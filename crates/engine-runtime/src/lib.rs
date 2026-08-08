//! Process-hostable engine runtime with prioritized commands and independent DMX output.

use std::collections::BTreeMap;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::io;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, SyncSender, TryRecvError, TrySendError};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle, Thread};
use std::time::{Duration, Instant};

use lighthouse_commands::{
    Command, CommandEnvelope, CommandOutcome, FixtureParameterValues, PriorityLane,
};
use lighthouse_domain::{FixtureId, ParameterId};
use lighthouse_fixture_model::FixtureMode;
use lighthouse_output_api::{FrameSet, OutputAdapter};
use lighthouse_parameter_resolver::{FixtureRenderState, resolve};
use lighthouse_patch::PatchAssignment;
use lighthouse_persistence::{FixtureRecord, JournalEntry, ProjectBundle, RecoveryJournal};
use lighthouse_show_engine::{DmxOutputLoop, OutputMetrics, ShowCore, ShowSnapshot, SystemClock};

const SAFETY_QUEUE_CAPACITY: usize = 32;
const COMMAND_QUEUE_CAPACITY: usize = 1024;
const JOURNAL_QUEUE_CAPACITY: usize = 2048;
const MAX_NORMAL_COMMANDS_PER_TICK: usize = 256;

#[derive(Clone, Debug)]
pub struct EngineRuntimeConfig {
    pub refresh_hz: u32,
    pub command_timeout: Duration,
    pub recovery_journal_path: Option<PathBuf>,
}

impl Default for EngineRuntimeConfig {
    fn default() -> Self {
        Self {
            refresh_hz: 44,
            command_timeout: Duration::from_secs(2),
            recovery_journal_path: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct RuntimeTelemetry {
    pub output: OutputMetrics,
    pub dropped_commands: u64,
    pub dropped_journal_entries: u64,
    pub frame_build_errors: u64,
    pub watchdog_blackout: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RuntimeSnapshot {
    pub show: ShowSnapshot,
    pub telemetry: RuntimeTelemetry,
}

struct CommandRequest {
    envelope: CommandEnvelope,
    response: SyncSender<CommandOutcome>,
}

#[derive(Debug)]
struct SharedRuntime {
    snapshot: Mutex<RuntimeSnapshot>,
    stop: AtomicBool,
    dropped_commands: AtomicU64,
    dropped_journal_entries: AtomicU64,
    frame_build_errors: AtomicU64,
    watchdog_blackout: AtomicBool,
}

#[derive(Clone)]
pub struct EngineClient {
    safety_sender: SyncSender<CommandRequest>,
    command_sender: SyncSender<CommandRequest>,
    shared: Arc<SharedRuntime>,
    worker_thread: Thread,
    command_timeout: Duration,
}

impl EngineClient {
    pub fn submit(&self, envelope: CommandEnvelope) -> Result<CommandOutcome, RuntimeError> {
        let (response_sender, response_receiver) = mpsc::sync_channel(1);
        let request = CommandRequest {
            envelope: envelope.clone(),
            response: response_sender,
        };
        let sender = if envelope.priority_lane == PriorityLane::Safety {
            &self.safety_sender
        } else {
            &self.command_sender
        };
        match sender.try_send(request) {
            Ok(()) => self.worker_thread.unpark(),
            Err(TrySendError::Full(_)) => {
                self.shared.dropped_commands.fetch_add(1, Ordering::Relaxed);
                return Err(RuntimeError::CommandQueueFull);
            }
            Err(TrySendError::Disconnected(_)) => return Err(RuntimeError::EngineStopped),
        }
        match response_receiver.recv_timeout(self.command_timeout) {
            Ok(outcome) => Ok(outcome),
            Err(RecvTimeoutError::Timeout) => Err(RuntimeError::CommandTimedOut),
            Err(RecvTimeoutError::Disconnected) => Err(RuntimeError::EngineStopped),
        }
    }

    #[must_use]
    pub fn snapshot(&self) -> RuntimeSnapshot {
        self.shared
            .snapshot
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    /// Applies a transient safety blackout without mutating the logical show state.
    pub fn set_watchdog_blackout(&self, enabled: bool) {
        self.shared
            .watchdog_blackout
            .store(enabled, Ordering::Release);
        self.worker_thread.unpark();
    }
}

pub struct EngineRuntime {
    client: EngineClient,
    worker: Option<JoinHandle<()>>,
    persistence_sender: Option<SyncSender<JournalEntry>>,
    persistence_worker: Option<JoinHandle<()>>,
}

impl EngineRuntime {
    pub fn start<A: OutputAdapter>(
        bundle: ProjectBundle,
        adapter: A,
        config: EngineRuntimeConfig,
    ) -> Result<Self, RuntimeError> {
        bundle
            .validate()
            .map_err(|error| RuntimeError::InvalidProject(error.to_string()))?;
        let fixtures = compile_runtime_fixtures(&bundle)?;
        let mut core = ShowCore::new(bundle.project.project_id, SystemClock::default());
        hydrate_show_core(&mut core, &bundle);
        if let Some(path) = config.recovery_journal_path.as_ref() {
            replay_recovery_journal(&mut core, path)?;
        }
        let initial_snapshot = core.snapshot();
        let output = DmxOutputLoop::start(adapter, config.refresh_hz)?;

        let (safety_sender, safety_receiver) = mpsc::sync_channel(SAFETY_QUEUE_CAPACITY);
        let (command_sender, command_receiver) = mpsc::sync_channel(COMMAND_QUEUE_CAPACITY);
        let shared = Arc::new(SharedRuntime {
            snapshot: Mutex::new(RuntimeSnapshot {
                show: initial_snapshot,
                telemetry: RuntimeTelemetry::default(),
            }),
            stop: AtomicBool::new(false),
            dropped_commands: AtomicU64::new(0),
            dropped_journal_entries: AtomicU64::new(0),
            frame_build_errors: AtomicU64::new(0),
            watchdog_blackout: AtomicBool::new(false),
        });

        let (persistence_sender, persistence_worker) =
            start_persistence_worker(config.recovery_journal_path)?;
        let worker_shared = Arc::clone(&shared);
        let worker_persistence = persistence_sender.clone();
        let refresh_hz = config.refresh_hz;
        let engine_loop = EngineLoop {
            core,
            fixtures,
            output,
            safety_receiver,
            command_receiver,
            persistence_sender: worker_persistence,
            shared: worker_shared,
            refresh_hz,
        };
        let worker = thread::Builder::new()
            .name("lighthouse-show-runtime".into())
            .spawn(move || engine_loop.run())?;
        let client = EngineClient {
            safety_sender,
            command_sender,
            shared,
            worker_thread: worker.thread().clone(),
            command_timeout: config.command_timeout,
        };
        Ok(Self {
            client,
            worker: Some(worker),
            persistence_sender,
            persistence_worker,
        })
    }

    #[must_use]
    pub fn client(&self) -> EngineClient {
        self.client.clone()
    }

    pub fn shutdown(mut self) {
        self.stop_and_join();
    }

    fn stop_and_join(&mut self) {
        self.client.shared.stop.store(true, Ordering::Release);
        self.client.worker_thread.unpark();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
        self.persistence_sender.take();
        if let Some(worker) = self.persistence_worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for EngineRuntime {
    fn drop(&mut self) {
        self.stop_and_join();
    }
}

#[derive(Clone, Debug)]
struct RuntimeFixture {
    fixture_id: FixtureId,
    mode: FixtureMode,
    patch: PatchAssignment,
}

fn compile_runtime_fixtures(bundle: &ProjectBundle) -> Result<Vec<RuntimeFixture>, RuntimeError> {
    let definitions: BTreeMap<_, _> = bundle
        .fixture_definitions
        .iter()
        .map(|definition| {
            (
                (definition.id.as_str(), definition.revision.as_str()),
                definition,
            )
        })
        .collect();
    let patch: BTreeMap<_, _> = bundle
        .project
        .patch
        .iter()
        .map(|record| (record.fixture_id, *record))
        .collect();
    bundle
        .project
        .fixtures
        .iter()
        .filter(|fixture| fixture.enabled)
        .filter_map(|fixture| {
            patch
                .get(&fixture.id)
                .copied()
                .map(|patch| (fixture, patch))
        })
        .map(|(fixture, patch)| compile_fixture(fixture, patch, &definitions))
        .collect()
}

fn compile_fixture(
    fixture: &FixtureRecord,
    patch: lighthouse_persistence::PatchRecord,
    definitions: &BTreeMap<(&str, &str), &lighthouse_fixture_model::FixtureDefinition>,
) -> Result<RuntimeFixture, RuntimeError> {
    let definition = definitions
        .get(&(
            fixture.definition_id.as_str(),
            fixture.definition_revision.as_str(),
        ))
        .ok_or_else(|| RuntimeError::InvalidProject("fixture definition is missing".into()))?;
    let mut mode = definition
        .modes
        .iter()
        .find(|mode| mode.id == fixture.mode_id)
        .cloned()
        .ok_or_else(|| RuntimeError::InvalidProject("fixture mode is missing".into()))?;
    if mode.footprint != patch.footprint {
        return Err(RuntimeError::InvalidProject(format!(
            "fixture {} mode footprint does not match its patch",
            fixture.id.0
        )));
    }
    for parameter in &mut mode.parameters {
        if (fixture.invert_pan && parameter.id.as_str() == "position.pan")
            || (fixture.invert_tilt && parameter.id.as_str() == "position.tilt")
        {
            parameter.invert = !parameter.invert;
        }
    }
    Ok(RuntimeFixture {
        fixture_id: fixture.id,
        mode,
        patch: PatchAssignment::new(
            patch.fixture_id,
            patch.universe_id,
            patch.start_address,
            patch.footprint,
        )
        .map_err(|error| RuntimeError::InvalidProject(error.to_string()))?,
    })
}

fn hydrate_show_core(core: &mut ShowCore<SystemClock>, bundle: &ProjectBundle) {
    let mut command_id = 1_u128;
    for command in bundle
        .project
        .scenes
        .iter()
        .cloned()
        .map(|scene| Command::PutScene { scene })
        .chain(
            bundle
                .project
                .cue_lists
                .iter()
                .cloned()
                .map(|cue_list| Command::PutCueList { cue_list }),
        )
        .chain(
            bundle
                .project
                .effects
                .iter()
                .cloned()
                .map(|effect| Command::PutEffect { effect }),
        )
    {
        let envelope = CommandEnvelope::new(
            command_id,
            "project-loader",
            bundle.project.project_id,
            command,
        );
        let outcome = core.process(envelope);
        debug_assert!(outcome.result.is_ok());
        command_id = command_id.saturating_add(1);
    }
}

struct EngineLoop {
    core: ShowCore<SystemClock>,
    fixtures: Vec<RuntimeFixture>,
    output: DmxOutputLoop,
    safety_receiver: Receiver<CommandRequest>,
    command_receiver: Receiver<CommandRequest>,
    persistence_sender: Option<SyncSender<JournalEntry>>,
    shared: Arc<SharedRuntime>,
    refresh_hz: u32,
}

impl EngineLoop {
    fn run(mut self) {
        let period = Duration::from_secs_f64(1.0 / f64::from(self.refresh_hz));
        let mut next_deadline = Instant::now();
        while !self.shared.stop.load(Ordering::Acquire) {
            drain_safety_commands(
                &mut self.core,
                &self.safety_receiver,
                self.persistence_sender.as_ref(),
                &self.shared,
            );
            drain_normal_commands(
                &mut self.core,
                &self.command_receiver,
                self.persistence_sender.as_ref(),
                &self.shared,
            );

            let show_snapshot = self.core.snapshot();
            self.output.set_blackout(
                show_snapshot.blackout || self.shared.watchdog_blackout.load(Ordering::Acquire),
            );
            self.output.set_grand_master(show_snapshot.grand_master);
            match build_frames(&self.fixtures, &show_snapshot.resolved_values) {
                Ok(frames) => self.output.publish(frames),
                Err(_) => {
                    self.shared
                        .frame_build_errors
                        .fetch_add(1, Ordering::Relaxed);
                }
            }
            publish_runtime_snapshot(&self.shared, show_snapshot, self.output.metrics());

            next_deadline += period;
            let now = Instant::now();
            if now > next_deadline {
                next_deadline = now + period;
            }
            thread::park_timeout(next_deadline.saturating_duration_since(Instant::now()));
        }
        self.output.shutdown();
    }
}

fn drain_safety_commands(
    core: &mut ShowCore<SystemClock>,
    receiver: &Receiver<CommandRequest>,
    persistence_sender: Option<&SyncSender<JournalEntry>>,
    shared: &SharedRuntime,
) {
    loop {
        match receiver.try_recv() {
            Ok(request) => process_request(core, request, persistence_sender, shared),
            Err(TryRecvError::Empty | TryRecvError::Disconnected) => return,
        }
    }
}

fn drain_normal_commands(
    core: &mut ShowCore<SystemClock>,
    receiver: &Receiver<CommandRequest>,
    persistence_sender: Option<&SyncSender<JournalEntry>>,
    shared: &SharedRuntime,
) {
    for _ in 0..MAX_NORMAL_COMMANDS_PER_TICK {
        match receiver.try_recv() {
            Ok(request) => process_request(core, request, persistence_sender, shared),
            Err(TryRecvError::Empty | TryRecvError::Disconnected) => return,
        }
    }
}

fn process_request(
    core: &mut ShowCore<SystemClock>,
    request: CommandRequest,
    persistence_sender: Option<&SyncSender<JournalEntry>>,
    shared: &SharedRuntime,
) {
    let envelope = request.envelope;
    let journal_envelope = envelope.clone();
    let outcome = core.process(envelope);
    if outcome.result.is_ok()
        && let Some(sender) = persistence_sender
        && let Err(error) = sender.try_send(JournalEntry {
            sequence: outcome.revision,
            command: journal_envelope,
        })
        && matches!(error, TrySendError::Full(_))
    {
        shared
            .dropped_journal_entries
            .fetch_add(1, Ordering::Relaxed);
    }
    let _ = request.response.try_send(outcome);
}

fn build_frames(
    fixtures: &[RuntimeFixture],
    values: &FixtureParameterValues,
) -> Result<FrameSet, lighthouse_parameter_resolver::ResolverError> {
    let empty = BTreeMap::<ParameterId, lighthouse_domain::NormalizedValue>::new();
    let states: Vec<_> = fixtures
        .iter()
        .map(|fixture| FixtureRenderState {
            fixture_id: fixture.fixture_id,
            mode: &fixture.mode,
            patch: &fixture.patch,
            values: values.get(&fixture.fixture_id).unwrap_or(&empty),
        })
        .collect();
    resolve(&states)
}

fn publish_runtime_snapshot(shared: &SharedRuntime, show: ShowSnapshot, output: OutputMetrics) {
    let telemetry = RuntimeTelemetry {
        output,
        dropped_commands: shared.dropped_commands.load(Ordering::Relaxed),
        dropped_journal_entries: shared.dropped_journal_entries.load(Ordering::Relaxed),
        frame_build_errors: shared.frame_build_errors.load(Ordering::Relaxed),
        watchdog_blackout: shared.watchdog_blackout.load(Ordering::Acquire),
    };
    *shared
        .snapshot
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = RuntimeSnapshot { show, telemetry };
}

fn replay_recovery_journal(
    core: &mut ShowCore<SystemClock>,
    path: &std::path::Path,
) -> Result<(), RuntimeError> {
    let read = RecoveryJournal::new(path)
        .read()
        .map_err(|error| RuntimeError::InvalidProject(format!("recovery journal: {error}")))?;
    let mut previous_sequence = 0;
    for entry in read.entries {
        if entry.sequence <= previous_sequence {
            return Err(RuntimeError::InvalidProject(
                "recovery journal sequence is not strictly increasing".into(),
            ));
        }
        previous_sequence = entry.sequence;
        let outcome = core.process(entry.command);
        if let Err(rejection) = outcome.result {
            return Err(RuntimeError::InvalidProject(format!(
                "recovery command was rejected: {}",
                rejection.message
            )));
        }
    }
    Ok(())
}

type PersistenceWorker = (Option<SyncSender<JournalEntry>>, Option<JoinHandle<()>>);

fn start_persistence_worker(path: Option<PathBuf>) -> Result<PersistenceWorker, RuntimeError> {
    let Some(path) = path else {
        return Ok((None, None));
    };
    let (sender, receiver) = mpsc::sync_channel::<JournalEntry>(JOURNAL_QUEUE_CAPACITY);
    let worker = thread::Builder::new()
        .name("lighthouse-persistence".into())
        .spawn(move || {
            let journal = RecoveryJournal::new(path);
            while let Ok(entry) = receiver.recv() {
                let _ = journal.append(&entry);
            }
        })?;
    Ok((Some(sender), Some(worker)))
}

#[derive(Debug)]
pub enum RuntimeError {
    Io(io::Error),
    InvalidProject(String),
    CommandQueueFull,
    CommandTimedOut,
    EngineStopped,
}

impl From<io::Error> for RuntimeError {
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

impl Display for RuntimeError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "engine runtime I/O failed: {error}"),
            Self::InvalidProject(message) => write!(formatter, "project cannot run: {message}"),
            Self::CommandQueueFull => formatter.write_str("engine command queue is full"),
            Self::CommandTimedOut => formatter.write_str("engine command timed out"),
            Self::EngineStopped => formatter.write_str("engine runtime has stopped"),
        }
    }
}

impl Error for RuntimeError {}

#[cfg(test)]
mod tests {
    use lighthouse_commands::Command;
    use lighthouse_domain::{NormalizedValue, ProjectId, UniverseId};
    use lighthouse_fixture_library::FixtureLibrary;
    use lighthouse_output_api::{VirtualDmxHandle, VirtualDmxOutput};
    use lighthouse_persistence::{FixtureRecord, PatchRecord, UniverseRecord};
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};

    use super::*;

    static TEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    fn recovery_path() -> PathBuf {
        std::env::temp_dir().join(format!(
            "lighthouse-runtime-recovery-{}-{}.jsonl",
            std::process::id(),
            TEST_SEQUENCE.fetch_add(1, AtomicOrdering::Relaxed)
        ))
    }

    fn sample_project() -> ProjectBundle {
        let project_id = ProjectId::new(1);
        let fixture_id = FixtureId::new(10);
        let mut bundle = ProjectBundle::empty(project_id, "Runtime");
        bundle.fixture_definitions.push(
            FixtureLibrary::with_generic_pack()
                .unwrap()
                .get("generic.dimmer", "1")
                .unwrap()
                .clone(),
        );
        bundle.project.universes.push(UniverseRecord {
            id: UniverseId::new(1),
            name: "Main".into(),
            enabled: true,
            routes: Vec::new(),
        });
        bundle.project.fixtures.push(FixtureRecord {
            id: fixture_id,
            name: "Dimmer".into(),
            definition_id: "generic.dimmer".into(),
            definition_revision: "1".into(),
            mode_id: "1ch".into(),
            enabled: true,
            invert_pan: false,
            invert_tilt: false,
        });
        bundle.project.patch.push(PatchRecord {
            fixture_id,
            universe_id: UniverseId::new(1),
            start_address: 1,
            footprint: 1,
        });
        bundle
    }

    fn command(id: u128, payload: Command, lane: PriorityLane) -> CommandEnvelope {
        let mut envelope = CommandEnvelope::new(id, "test-ui", ProjectId::new(1), payload);
        envelope.priority_lane = lane;
        envelope
    }

    fn wait_for_slot(handle: &VirtualDmxHandle, expected: u8) {
        for _ in 0..100 {
            let value = handle
                .snapshot()
                .last_frames
                .and_then(|frames| frames.frame(UniverseId::new(1)).cloned())
                .and_then(|frame| frame.slot(1));
            if value == Some(expected) {
                return;
            }
            thread::sleep(Duration::from_millis(5));
        }
        panic!("virtual DMX slot 1 did not reach {expected}");
    }

    #[test]
    fn logical_commands_flow_through_the_runtime_to_virtual_dmx() {
        let (adapter, virtual_node) = VirtualDmxOutput::new();
        let runtime =
            EngineRuntime::start(sample_project(), adapter, EngineRuntimeConfig::default())
                .unwrap();
        let client = runtime.client();
        let outcome = client
            .submit(command(
                1,
                Command::SetFixtureParameter {
                    fixture_id: FixtureId::new(10),
                    parameter_id: ParameterId::from("intensity"),
                    value: NormalizedValue::FULL,
                },
                PriorityLane::Live,
            ))
            .unwrap();
        assert!(outcome.result.is_ok());
        wait_for_slot(&virtual_node, 255);
        runtime.shutdown();
    }

    #[test]
    fn dmx_keeps_running_while_no_ui_client_is_sending_commands() {
        let (adapter, virtual_node) = VirtualDmxOutput::new();
        let runtime =
            EngineRuntime::start(sample_project(), adapter, EngineRuntimeConfig::default())
                .unwrap();
        thread::sleep(Duration::from_millis(50));
        let before = virtual_node.snapshot().send_count;
        thread::sleep(Duration::from_millis(70));
        let after = virtual_node.snapshot().send_count;
        assert!(after > before);
        runtime.shutdown();
    }

    #[test]
    fn safety_blackout_uses_the_prioritized_command_lane() {
        let (adapter, virtual_node) = VirtualDmxOutput::new();
        let runtime =
            EngineRuntime::start(sample_project(), adapter, EngineRuntimeConfig::default())
                .unwrap();
        let client = runtime.client();
        client
            .submit(command(
                1,
                Command::SetFixtureParameter {
                    fixture_id: FixtureId::new(10),
                    parameter_id: ParameterId::from("intensity"),
                    value: NormalizedValue::FULL,
                },
                PriorityLane::Live,
            ))
            .unwrap();
        client
            .submit(command(
                2,
                Command::SetBlackout { enabled: true },
                PriorityLane::Safety,
            ))
            .unwrap();
        wait_for_slot(&virtual_node, 0);
        runtime.shutdown();
    }

    #[test]
    fn watchdog_blackout_is_transient_and_does_not_mutate_show_state() {
        let (adapter, virtual_node) = VirtualDmxOutput::new();
        let runtime =
            EngineRuntime::start(sample_project(), adapter, EngineRuntimeConfig::default())
                .unwrap();
        let client = runtime.client();
        client
            .submit(command(
                1,
                Command::SetFixtureParameter {
                    fixture_id: FixtureId::new(10),
                    parameter_id: ParameterId::from("intensity"),
                    value: NormalizedValue::FULL,
                },
                PriorityLane::Live,
            ))
            .unwrap();
        client.set_watchdog_blackout(true);
        wait_for_slot(&virtual_node, 0);
        assert!(client.snapshot().telemetry.watchdog_blackout);
        assert!(!client.snapshot().show.blackout);

        client.set_watchdog_blackout(false);
        wait_for_slot(&virtual_node, 255);
        runtime.shutdown();
    }

    #[test]
    fn accepted_commands_replay_from_the_recovery_journal() {
        let path = recovery_path();
        RecoveryJournal::new(&path)
            .append(&JournalEntry {
                sequence: 1,
                command: command(
                    91,
                    Command::SetFixtureParameter {
                        fixture_id: FixtureId::new(10),
                        parameter_id: ParameterId::from("intensity"),
                        value: NormalizedValue::FULL,
                    },
                    PriorityLane::Live,
                ),
            })
            .unwrap();
        let (adapter, virtual_node) = VirtualDmxOutput::new();
        let runtime = EngineRuntime::start(
            sample_project(),
            adapter,
            EngineRuntimeConfig {
                recovery_journal_path: Some(path.clone()),
                ..EngineRuntimeConfig::default()
            },
        )
        .unwrap();
        wait_for_slot(&virtual_node, 255);
        runtime.shutdown();
        fs::remove_file(path).unwrap();
    }
}
