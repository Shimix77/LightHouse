use std::collections::BTreeMap;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command as ProcessCommand, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use lighthouse_commands::{
    Command, CommandEnvelope, CueEntryData, CueListData, FixtureParameterValues, OperationMode,
    PriorityLane, SceneData,
};
use lighthouse_domain::{
    CueListId, EffectId, FixtureId, LayoutObjectId, NormalizedValue, ParameterId, ProjectId,
    SceneId, UniverseId,
};
use lighthouse_effects::{
    EffectBlend, EffectDefinition, EffectDirection, EffectOrder, EffectTemplate,
};
use lighthouse_fixture_library::FixtureLibrary;
use lighthouse_ipc::{
    ClientMessage, EngineTelemetry, IPC_CONTRACT_VERSION, ServerMessage, read_message,
    write_message,
};
use lighthouse_persistence::{
    FixtureRecord, LayoutObjectKind, LayoutObjectRecord, LayoutTransform, LiveControlRecord,
    OutputRouteRecord, PatchRecord, ProjectBundle, ProjectStore, UniverseRecord,
};
use lighthouse_show_engine::ShowSnapshot;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const DEFAULT_PROJECT_FILE: &str = "LightHouse Demo.lightshow";
const SESSION_FILE: &str = "engine-session.json";
const ENGINE_LOG_FILE: &str = "engine.log";
const IPC_TIMEOUT: Duration = Duration::from_secs(2);

pub struct DesktopBackend {
    app_data_dir: PathBuf,
    project_path: PathBuf,
    bundle: ProjectBundle,
    session: EngineSession,
    next_sequence: u64,
}

impl DesktopBackend {
    pub fn open(app_data_dir: PathBuf) -> Result<Self, BackendError> {
        fs::create_dir_all(&app_data_dir)?;
        let project_dir = app_data_dir.join("Projects");
        fs::create_dir_all(&project_dir)?;
        let project_path = project_dir.join(DEFAULT_PROJECT_FILE);
        if !project_path.exists() {
            ProjectStore::save_atomic(&project_path, &demo_project()?)?;
        }
        let bundle = ProjectStore::load(&project_path)?.bundle;
        let session = EngineSession::connect_or_spawn(&app_data_dir, &project_path)?;
        Ok(Self {
            app_data_dir,
            project_path,
            bundle,
            session,
            next_sequence: 1,
        })
    }

    pub fn bootstrap(&mut self) -> Result<UiBootstrap, BackendError> {
        let (snapshot, telemetry) = self.request_snapshot_with_restart()?;
        Ok(UiBootstrap {
            project: project_view(&self.bundle, &snapshot),
            engine: engine_view(snapshot, telemetry),
            project_path: self.project_path.to_string_lossy().into_owned(),
        })
    }

    pub fn refresh(&mut self) -> Result<UiEngineView, BackendError> {
        let (snapshot, telemetry) = self.request_snapshot_with_restart()?;
        Ok(engine_view(snapshot, telemetry))
    }

    pub fn command(&mut self, command: UiEngineCommand) -> Result<UiEngineView, BackendError> {
        let priority_lane = command.priority_lane();
        let retryable = command.is_retryable();
        let command = command.into_domain()?;
        let mut envelope = CommandEnvelope::new(
            Uuid::new_v4().as_u128(),
            "desktop-ui",
            self.bundle.project.project_id,
            command.clone(),
        );
        envelope.client_sequence = self.next_sequence;
        envelope.priority_lane = priority_lane;
        self.next_sequence = self.next_sequence.saturating_add(1);
        let response = self.session.request(ClientMessage::Command {
            envelope: Box::new(envelope),
        });
        let response = match response {
            Ok(response) => response,
            Err(_) if retryable => {
                self.restart_engine()?;
                let mut retry = CommandEnvelope::new(
                    Uuid::new_v4().as_u128(),
                    "desktop-ui-retry",
                    self.bundle.project.project_id,
                    command,
                );
                retry.client_sequence = self.next_sequence;
                retry.priority_lane = priority_lane;
                self.next_sequence = self.next_sequence.saturating_add(1);
                self.session.request(ClientMessage::Command {
                    envelope: Box::new(retry),
                })?
            }
            Err(error) => return Err(error),
        };
        match response {
            ServerMessage::CommandOutcome { outcome } => {
                if let Err(rejection) = outcome.result {
                    return Err(BackendError::CommandRejected(rejection.message));
                }
            }
            ServerMessage::EngineError { message } => {
                return Err(BackendError::Engine(message));
            }
            other => return Err(BackendError::UnexpectedMessage(format!("{other:?}"))),
        }
        self.refresh()
    }

    fn request_snapshot_with_restart(
        &mut self,
    ) -> Result<(ShowSnapshot, EngineTelemetry), BackendError> {
        match self.session.snapshot() {
            Ok(snapshot) => Ok(snapshot),
            Err(_) => {
                self.restart_engine()?;
                self.session.snapshot()
            }
        }
    }

    fn restart_engine(&mut self) -> Result<(), BackendError> {
        self.session = EngineSession::spawn(&self.app_data_dir, &self.project_path)?;
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "data")]
pub enum UiEngineCommand {
    SetFixtureParameter {
        fixture_id: String,
        parameter_id: String,
        value: f64,
    },
    ClearProgrammer {
        fixture_id: Option<String>,
    },
    ActivateScene {
        scene_id: String,
        fade_ms: Option<u64>,
    },
    ReleaseScene {
        scene_id: String,
        fade_ms: Option<u64>,
    },
    GoNextCue {
        cue_list_id: String,
    },
    BackCue {
        cue_list_id: String,
    },
    PauseCueList {
        cue_list_id: String,
    },
    ResumeCueList {
        cue_list_id: String,
    },
    SetGrandMaster {
        value: f64,
    },
    SetBlackout {
        enabled: bool,
    },
    SetBlind {
        enabled: bool,
    },
    CommitBlind,
    SetFreeze {
        enabled: bool,
    },
    SetOperationMode {
        mode: OperationMode,
    },
    SetTempo {
        bpm: f64,
    },
    TapTempo,
}

impl UiEngineCommand {
    fn priority_lane(&self) -> PriorityLane {
        match self {
            Self::SetBlackout { .. } | Self::SetGrandMaster { .. } => PriorityLane::Safety,
            Self::ActivateScene { .. }
            | Self::ReleaseScene { .. }
            | Self::GoNextCue { .. }
            | Self::BackCue { .. }
            | Self::PauseCueList { .. }
            | Self::ResumeCueList { .. }
            | Self::SetFreeze { .. }
            | Self::TapTempo => PriorityLane::Live,
            _ => PriorityLane::Edit,
        }
    }

    fn into_domain(self) -> Result<Command, BackendError> {
        Ok(match self {
            Self::SetFixtureParameter {
                fixture_id,
                parameter_id,
                value,
            } => Command::SetFixtureParameter {
                fixture_id: FixtureId::new(parse_id(&fixture_id)?),
                parameter_id: ParameterId::new(parameter_id),
                value: NormalizedValue::new(value)
                    .map_err(|error| BackendError::InvalidCommand(error.to_string()))?,
            },
            Self::ClearProgrammer { fixture_id } => Command::ClearProgrammer {
                fixture_id: fixture_id
                    .as_deref()
                    .map(parse_id)
                    .transpose()?
                    .map(FixtureId::new),
            },
            Self::ActivateScene { scene_id, fade_ms } => Command::ActivateScene {
                scene_id: SceneId::new(parse_id(&scene_id)?),
                fade_ms,
            },
            Self::ReleaseScene { scene_id, fade_ms } => Command::ReleaseScene {
                scene_id: SceneId::new(parse_id(&scene_id)?),
                fade_ms,
            },
            Self::GoNextCue { cue_list_id } => Command::GoNextCue {
                cue_list_id: CueListId::new(parse_id(&cue_list_id)?),
            },
            Self::BackCue { cue_list_id } => Command::BackCue {
                cue_list_id: CueListId::new(parse_id(&cue_list_id)?),
            },
            Self::PauseCueList { cue_list_id } => Command::PauseCueList {
                cue_list_id: CueListId::new(parse_id(&cue_list_id)?),
            },
            Self::ResumeCueList { cue_list_id } => Command::ResumeCueList {
                cue_list_id: CueListId::new(parse_id(&cue_list_id)?),
            },
            Self::SetGrandMaster { value } => Command::SetGrandMaster {
                value: NormalizedValue::new(value)
                    .map_err(|error| BackendError::InvalidCommand(error.to_string()))?,
            },
            Self::SetBlackout { enabled } => Command::SetBlackout { enabled },
            Self::SetBlind { enabled } => Command::SetBlind { enabled },
            Self::CommitBlind => Command::CommitBlind,
            Self::SetFreeze { enabled } => Command::SetFreeze { enabled },
            Self::SetOperationMode { mode } => Command::SetOperationMode { mode },
            Self::SetTempo { bpm } => Command::SetTempo { bpm },
            Self::TapTempo => Command::TapTempo,
        })
    }

    fn is_retryable(&self) -> bool {
        matches!(
            self,
            Self::SetFixtureParameter { .. }
                | Self::ClearProgrammer { .. }
                | Self::SetGrandMaster { .. }
                | Self::SetBlackout { .. }
                | Self::SetBlind { .. }
                | Self::CommitBlind
                | Self::SetFreeze { .. }
                | Self::SetOperationMode { .. }
                | Self::SetTempo { .. }
        )
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiBootstrap {
    project: UiProjectView,
    engine: UiEngineView,
    project_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiProjectView {
    name: String,
    fixtures: Vec<UiFixtureView>,
    scenes: Vec<UiSceneView>,
    cue_lists: Vec<UiCueListView>,
    effects: Vec<UiEffectView>,
    universe_count: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiFixtureView {
    id: String,
    name: String,
    kind: String,
    universe: u32,
    address: u16,
    x: f64,
    y: f64,
    rotation: f64,
    intensity: f64,
    color: String,
    pan: f64,
    tilt: f64,
    zoom: f64,
    locked: bool,
    layer: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiSceneView {
    id: String,
    number: String,
    name: String,
    color: String,
    active: bool,
    fade_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiCueListView {
    id: String,
    name: String,
    entries: Vec<UiCueEntryView>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiCueEntryView {
    number: String,
    name: String,
    scene_id: String,
    fade_ms: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiEffectView {
    id: String,
    name: String,
    template: EffectTemplate,
    target_parameter: String,
    beat_sync: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiEngineView {
    revision: u64,
    operation_mode: OperationMode,
    fixture_values: Vec<UiFixtureValues>,
    active_scene_ids: Vec<String>,
    active_effect_ids: Vec<String>,
    cue_runtime: Vec<UiCueRuntime>,
    grand_master: f64,
    blackout: bool,
    blind: bool,
    freeze: bool,
    bpm: f64,
    telemetry: EngineTelemetry,
    connected: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiFixtureValues {
    fixture_id: String,
    parameters: BTreeMap<String, f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiCueRuntime {
    cue_list_id: String,
    cursor: Option<usize>,
    paused: bool,
}

fn project_view(bundle: &ProjectBundle, snapshot: &ShowSnapshot) -> UiProjectView {
    let patch: BTreeMap<_, _> = bundle
        .project
        .patch
        .iter()
        .map(|record| (record.fixture_id, record))
        .collect();
    let layout: BTreeMap<_, _> = bundle
        .project
        .layout_objects
        .iter()
        .filter_map(|record| match record.kind {
            LayoutObjectKind::Fixture { fixture_id } => Some((fixture_id, record)),
            _ => None,
        })
        .collect();
    let fixtures = bundle
        .project
        .fixtures
        .iter()
        .map(|fixture| {
            let patch_record = patch.get(&fixture.id).copied();
            let layout_record = layout.get(&fixture.id).copied();
            let values = snapshot.resolved_values.get(&fixture.id);
            UiFixtureView {
                id: fixture.id.0.to_string(),
                name: fixture.name.clone(),
                kind: fixture_kind(fixture),
                universe: patch_record.map_or(0, |record| record.universe_id.0),
                address: patch_record.map_or(0, |record| record.start_address),
                x: layout_record.map_or(0.0, |record| record.transform.x_meters),
                y: layout_record.map_or(0.0, |record| record.transform.y_meters),
                rotation: layout_record.map_or(0.0, |record| record.transform.rotation_degrees),
                intensity: parameter(values, "intensity", 0.0),
                color: rgb_hex(values),
                pan: parameter(values, "position.pan", 0.5),
                tilt: parameter(values, "position.tilt", 0.5),
                zoom: parameter(values, "beam.zoom", 0.5),
                locked: layout_record.is_some_and(|record| record.locked),
                layer: layout_record
                    .map_or_else(|| "Fixtures".into(), |record| record.layer.clone()),
            }
        })
        .collect();
    let palette = ["#ff9f43", "#4da3ff", "#a970ff", "#ff4d6d", "#48d597"];
    let scenes = bundle
        .project
        .scenes
        .iter()
        .enumerate()
        .map(|(index, scene)| UiSceneView {
            id: scene.id.0.to_string(),
            number: (index + 1).to_string(),
            name: scene.name.clone(),
            color: palette[index % palette.len()].into(),
            active: snapshot.active_scene_ids.contains(&scene.id),
            fade_ms: scene.default_fade_ms,
        })
        .collect();
    let cue_lists = bundle
        .project
        .cue_lists
        .iter()
        .map(|cue_list| UiCueListView {
            id: cue_list.id.0.to_string(),
            name: cue_list.name.clone(),
            entries: cue_list
                .entries
                .iter()
                .map(|entry| UiCueEntryView {
                    number: entry.number.clone(),
                    name: entry.name.clone(),
                    scene_id: entry.scene_id.0.to_string(),
                    fade_ms: entry.fade_ms,
                })
                .collect(),
        })
        .collect();
    let effects = bundle
        .project
        .effects
        .iter()
        .map(|effect| UiEffectView {
            id: effect.id.0.to_string(),
            name: effect.name.clone(),
            template: effect.template,
            target_parameter: effect.target_parameter.as_str().into(),
            beat_sync: effect.beat_sync,
        })
        .collect();
    UiProjectView {
        name: bundle.project.name.clone(),
        fixtures,
        scenes,
        cue_lists,
        effects,
        universe_count: bundle.project.universes.len(),
    }
}

fn engine_view(snapshot: ShowSnapshot, telemetry: EngineTelemetry) -> UiEngineView {
    UiEngineView {
        revision: snapshot.revision,
        operation_mode: snapshot.operation_mode,
        fixture_values: snapshot
            .resolved_values
            .into_iter()
            .map(|(fixture_id, values)| UiFixtureValues {
                fixture_id: fixture_id.0.to_string(),
                parameters: values
                    .into_iter()
                    .map(|(parameter_id, value)| (parameter_id.as_str().into(), value.get()))
                    .collect(),
            })
            .collect(),
        active_scene_ids: snapshot
            .active_scene_ids
            .into_iter()
            .map(|id| id.0.to_string())
            .collect(),
        active_effect_ids: snapshot
            .active_effect_ids
            .into_iter()
            .map(|id| id.0.to_string())
            .collect(),
        cue_runtime: snapshot
            .cue_runtime
            .into_iter()
            .map(|(id, runtime)| UiCueRuntime {
                cue_list_id: id.0.to_string(),
                cursor: runtime.cursor,
                paused: runtime.paused,
            })
            .collect(),
        grand_master: snapshot.grand_master.get(),
        blackout: snapshot.blackout,
        blind: snapshot.blind,
        freeze: snapshot.freeze,
        bpm: snapshot.bpm,
        telemetry,
        connected: true,
    }
}

fn fixture_kind(fixture: &FixtureRecord) -> String {
    if fixture.name.to_ascii_lowercase().contains("strobe") {
        "strobe"
    } else if fixture.definition_id.contains("moving-head") {
        "moving-head"
    } else if fixture.definition_id.contains("par") {
        "par"
    } else {
        "dimmer"
    }
    .into()
}

fn parameter(
    values: Option<&BTreeMap<ParameterId, NormalizedValue>>,
    id: &str,
    default: f64,
) -> f64 {
    values
        .and_then(|values| values.get(&ParameterId::new(id)))
        .map_or(default, |value| value.get())
}

fn rgb_hex(values: Option<&BTreeMap<ParameterId, NormalizedValue>>) -> String {
    let red = (parameter(values, "color.red", 1.0) * 255.0).round() as u8;
    let green = (parameter(values, "color.green", 1.0) * 255.0).round() as u8;
    let blue = (parameter(values, "color.blue", 1.0) * 255.0).round() as u8;
    format!("#{red:02x}{green:02x}{blue:02x}")
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionRecord {
    address: String,
    auth_token: String,
    project_path: String,
    process_id: u32,
}

struct EngineSession {
    record: SessionRecord,
    #[allow(dead_code)]
    child: Option<Child>,
}

impl EngineSession {
    fn connect_or_spawn(app_data_dir: &Path, project_path: &Path) -> Result<Self, BackendError> {
        let session_path = app_data_dir.join(SESSION_FILE);
        if let Ok(bytes) = fs::read(&session_path)
            && let Ok(record) = serde_json::from_slice::<SessionRecord>(&bytes)
            && record.project_path == project_path.to_string_lossy()
        {
            let session = Self {
                record,
                child: None,
            };
            if session.snapshot().is_ok() {
                return Ok(session);
            }
        }
        Self::spawn(app_data_dir, project_path)
    }

    fn spawn(app_data_dir: &Path, project_path: &Path) -> Result<Self, BackendError> {
        let engine_path = locate_engine_binary()?;
        let auth_token = Uuid::new_v4().simple().to_string();
        let log_path = app_data_dir.join(ENGINE_LOG_FILE);
        let log_file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)?;
        let mut child = ProcessCommand::new(&engine_path)
            .args([
                "serve",
                &project_path.to_string_lossy(),
                &auth_token,
                "127.0.0.1:0",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::from(log_file))
            .spawn()
            .map_err(|source| BackendError::Spawn {
                path: engine_path,
                source,
            })?;
        let stdout = child
            .stdout
            .take()
            .ok_or(BackendError::MissingEngineStdout)?;
        let (sender, receiver) = mpsc::sync_channel(1);
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            let result = reader.read_line(&mut line).map(|_| line);
            let _ = sender.send(result);
        });
        let startup_line = match receiver.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(line)) if !line.trim().is_empty() => line,
            Ok(Ok(_)) => {
                let _ = child.kill();
                return Err(BackendError::EmptyEngineStartup);
            }
            Ok(Err(error)) => {
                let _ = child.kill();
                return Err(error.into());
            }
            Err(_) => {
                let _ = child.kill();
                return Err(BackendError::EngineStartupTimeout);
            }
        };
        let startup: EngineStartup = serde_json::from_str(&startup_line)?;
        if startup.contract_version != IPC_CONTRACT_VERSION {
            let _ = child.kill();
            return Err(BackendError::ContractMismatch(startup.contract_version));
        }
        let record = SessionRecord {
            address: startup.address,
            auth_token,
            project_path: project_path.to_string_lossy().into_owned(),
            process_id: child.id(),
        };
        write_private_session_file(
            &app_data_dir.join(SESSION_FILE),
            &serde_json::to_vec_pretty(&record)?,
        )?;
        Ok(Self {
            record,
            child: Some(child),
        })
    }

    fn request(&self, message: ClientMessage) -> Result<ServerMessage, BackendError> {
        let mut stream = self.connect()?;
        write_message(&mut stream, &message)?;
        read_message(&mut stream)?
            .ok_or_else(|| BackendError::Engine("engine closed the IPC stream".into()))
    }

    fn snapshot(&self) -> Result<(ShowSnapshot, EngineTelemetry), BackendError> {
        match self.request(ClientMessage::RequestSnapshot)? {
            ServerMessage::Snapshot {
                snapshot,
                telemetry,
            } => Ok((snapshot, telemetry)),
            ServerMessage::EngineError { message } => Err(BackendError::Engine(message)),
            other => Err(BackendError::UnexpectedMessage(format!("{other:?}"))),
        }
    }

    fn connect(&self) -> Result<TcpStream, BackendError> {
        let address: SocketAddr = self
            .record
            .address
            .parse()
            .map_err(|_| BackendError::InvalidEngineAddress(self.record.address.clone()))?;
        let mut stream = TcpStream::connect_timeout(&address, IPC_TIMEOUT)?;
        stream.set_nodelay(true)?;
        stream.set_read_timeout(Some(IPC_TIMEOUT))?;
        stream.set_write_timeout(Some(IPC_TIMEOUT))?;
        write_message(
            &mut stream,
            &ClientMessage::Hello {
                contract_version: IPC_CONTRACT_VERSION,
                auth_token: self.record.auth_token.clone(),
                client_id: "lighthouse-desktop".into(),
            },
        )?;
        match read_message::<_, ServerMessage>(&mut stream)? {
            Some(ServerMessage::Welcome {
                contract_version, ..
            }) if contract_version == IPC_CONTRACT_VERSION => Ok(stream),
            Some(ServerMessage::AuthenticationRejected) => Err(BackendError::Authentication),
            Some(ServerMessage::ContractRejected { supported_version }) => {
                Err(BackendError::ContractMismatch(supported_version))
            }
            Some(other) => Err(BackendError::UnexpectedMessage(format!("{other:?}"))),
            None => Err(BackendError::Engine(
                "engine closed the IPC stream during handshake".into(),
            )),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EngineStartup {
    address: String,
    contract_version: u16,
}

fn locate_engine_binary() -> Result<PathBuf, BackendError> {
    if let Some(path) = std::env::var_os("LIGHTHOUSE_ENGINE_PATH") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
    }
    let binary_name = format!("lighthouse-show-engine-app{}", std::env::consts::EXE_SUFFIX);
    if let Ok(current_executable) = std::env::current_exe()
        && let Some(directory) = current_executable.parent()
    {
        let sibling = directory.join(&binary_name);
        if sibling.is_file() {
            return Ok(sibling);
        }
    }
    let profile = if cfg!(debug_assertions) {
        "debug"
    } else {
        "release"
    };
    let workspace_binary = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("target")
        .join(profile)
        .join(binary_name);
    if workspace_binary.is_file() {
        return Ok(workspace_binary);
    }
    Err(BackendError::EngineBinaryNotFound(workspace_binary))
}

fn parse_id(value: &str) -> Result<u128, BackendError> {
    value
        .parse()
        .map_err(|_| BackendError::InvalidCommand(format!("invalid object id {value}")))
}

fn write_private_session_file(path: &Path, contents: &[u8]) -> Result<(), BackendError> {
    fs::write(path, contents)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

fn demo_project() -> Result<ProjectBundle, BackendError> {
    let project_id = ProjectId::new(1);
    let mut bundle = ProjectBundle::empty(project_id, "Main Stage — Demo");
    bundle.fixture_definitions = FixtureLibrary::with_generic_pack()?
        .iter()
        .cloned()
        .collect();
    bundle.project.universes = vec![UniverseRecord {
        id: UniverseId::new(1),
        name: "Universe 1".into(),
        enabled: true,
        routes: vec![OutputRouteRecord::ArtNet {
            port_address: 0,
            destination: "127.0.0.1:6454".into(),
            interface: None,
            broadcast: false,
        }],
    }];
    let fixture_specs = [
        (
            101,
            "Front PAR L",
            "generic.rgbw-par",
            "5ch",
            1,
            5,
            -4.2,
            -2.6,
        ),
        (
            102,
            "Front PAR R",
            "generic.rgbw-par",
            "5ch",
            6,
            5,
            4.2,
            -2.6,
        ),
        (
            103,
            "Wash Left",
            "generic.moving-head-16bit",
            "10ch",
            11,
            10,
            -5.5,
            1.2,
        ),
        (
            104,
            "Wash Right",
            "generic.moving-head-16bit",
            "10ch",
            21,
            10,
            5.5,
            1.2,
        ),
        (
            105,
            "Back Center",
            "generic.moving-head-16bit",
            "10ch",
            31,
            10,
            0.0,
            4.2,
        ),
        (106, "Strobe", "generic.dimmer", "1ch", 41, 1, 0.0, -0.2),
    ];
    for (index, (id, name, definition_id, mode_id, address, footprint, x, y)) in
        fixture_specs.into_iter().enumerate()
    {
        let fixture_id = FixtureId::new(id);
        bundle.project.fixtures.push(FixtureRecord {
            id: fixture_id,
            name: name.into(),
            definition_id: definition_id.into(),
            definition_revision: "1".into(),
            mode_id: mode_id.into(),
            enabled: true,
            invert_pan: false,
            invert_tilt: false,
        });
        bundle.project.patch.push(PatchRecord {
            fixture_id,
            universe_id: UniverseId::new(1),
            start_address: address,
            footprint,
        });
        bundle.project.layout_objects.push(LayoutObjectRecord {
            id: LayoutObjectId::new(1001 + index as u128),
            name: name.into(),
            kind: LayoutObjectKind::Fixture { fixture_id },
            transform: LayoutTransform {
                x_meters: x,
                y_meters: y,
                width_meters: 0.65,
                height_meters: 0.65,
                rotation_degrees: 0.0,
                z_index: index as i32,
            },
            layer: "Fixtures".into(),
            locked: false,
            hidden: false,
            opacity: NormalizedValue::FULL,
        });
    }

    bundle.project.scenes = vec![
        scene(201, "Warm Welcome", 1_200, 0.72, (1.0, 0.48, 0.16)),
        scene(202, "Blue Air", 1_800, 0.64, (0.08, 0.35, 1.0)),
        scene(203, "Violet Motion", 900, 0.78, (0.55, 0.16, 1.0)),
        scene(204, "Full Energy", 300, 1.0, (1.0, 0.92, 0.82)),
    ];
    bundle.project.cue_lists = vec![CueListData {
        id: CueListId::new(301),
        name: "Main Show".into(),
        entries: bundle
            .project
            .scenes
            .iter()
            .enumerate()
            .map(|(index, scene)| CueEntryData {
                number: (index + 1).to_string(),
                name: scene.name.clone(),
                scene_id: scene.id,
                fade_ms: None,
            })
            .collect(),
    }];
    bundle.project.effects = vec![
        effect(
            401,
            "Intensity Chase",
            EffectTemplate::Chase,
            "intensity",
            true,
        ),
        effect(
            402,
            "Stage Wave",
            EffectTemplate::SineWave,
            "intensity",
            true,
        ),
        effect(
            403,
            "Pan Sweep",
            EffectTemplate::PanSweep,
            "position.pan",
            false,
        ),
        effect(
            404,
            "Candle Flicker",
            EffectTemplate::FireCandleFlicker,
            "intensity",
            false,
        ),
    ];
    bundle.project.live_controls = bundle
        .project
        .scenes
        .iter()
        .enumerate()
        .map(|(index, scene)| LiveControlRecord {
            id: 500 + index as u128,
            label: scene.name.clone(),
            scene_id: Some(scene.id),
            effect_id: None,
            page: 1,
            position: index as u16,
        })
        .collect();
    bundle.validate()?;
    Ok(bundle)
}

fn scene(id: u128, name: &str, fade_ms: u64, intensity: f64, rgb: (f64, f64, f64)) -> SceneData {
    let mut values = FixtureParameterValues::new();
    for fixture_id in 101..=106 {
        values
            .entry(FixtureId::new(fixture_id))
            .or_default()
            .insert(
                ParameterId::new("intensity"),
                NormalizedValue::clamped(intensity),
            );
    }
    for fixture_id in 101..=105 {
        let fixture_values = values.entry(FixtureId::new(fixture_id)).or_default();
        fixture_values.insert(
            ParameterId::new("color.red"),
            NormalizedValue::clamped(rgb.0),
        );
        fixture_values.insert(
            ParameterId::new("color.green"),
            NormalizedValue::clamped(rgb.1),
        );
        fixture_values.insert(
            ParameterId::new("color.blue"),
            NormalizedValue::clamped(rgb.2),
        );
    }
    SceneData {
        id: SceneId::new(id),
        name: name.into(),
        values,
        default_fade_ms: fade_ms,
    }
}

fn effect(
    id: u128,
    name: &str,
    template: EffectTemplate,
    target_parameter: &str,
    beat_sync: bool,
) -> EffectDefinition {
    EffectDefinition {
        id: EffectId::new(id),
        name: name.into(),
        target_parameter: ParameterId::new(target_parameter),
        template,
        amplitude: NormalizedValue::clamped(0.75),
        offset: NormalizedValue::clamped(0.15),
        speed_hz: 1.0,
        beat_multiplier: 1.0,
        beat_sync,
        spatial_phase: 1.0,
        direction: EffectDirection::Forward,
        blend: EffectBlend::Replace,
        order: EffectOrder::LayoutX,
        seed: id as u64,
    }
}

#[derive(Debug)]
pub enum BackendError {
    Io(std::io::Error),
    Json(serde_json::Error),
    Ipc(lighthouse_ipc::IpcError),
    Persistence(lighthouse_persistence::PersistenceError),
    FixtureLibrary(lighthouse_fixture_library::FixtureLibraryError),
    Engine(String),
    InvalidCommand(String),
    CommandRejected(String),
    Authentication,
    ContractMismatch(u16),
    InvalidEngineAddress(String),
    UnexpectedMessage(String),
    EngineBinaryNotFound(PathBuf),
    Spawn {
        path: PathBuf,
        source: std::io::Error,
    },
    MissingEngineStdout,
    EmptyEngineStartup,
    EngineStartupTimeout,
}

impl Display for BackendError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "desktop I/O failed: {error}"),
            Self::Json(error) => write!(formatter, "desktop JSON failed: {error}"),
            Self::Ipc(error) => write!(formatter, "engine IPC failed: {error}"),
            Self::Persistence(error) => write!(formatter, "project failed: {error}"),
            Self::FixtureLibrary(error) => write!(formatter, "fixture library failed: {error}"),
            Self::Engine(message) => write!(formatter, "engine failed: {message}"),
            Self::InvalidCommand(message) => write!(formatter, "invalid command: {message}"),
            Self::CommandRejected(message) => write!(formatter, "command rejected: {message}"),
            Self::Authentication => formatter.write_str("engine authentication was rejected"),
            Self::ContractMismatch(version) => {
                write!(formatter, "engine IPC contract {version} is not supported")
            }
            Self::InvalidEngineAddress(address) => {
                write!(formatter, "invalid engine address {address}")
            }
            Self::UnexpectedMessage(message) => {
                write!(formatter, "unexpected engine response: {message}")
            }
            Self::EngineBinaryNotFound(path) => write!(
                formatter,
                "engine executable was not found at {}",
                path.display()
            ),
            Self::Spawn { path, source } => write!(
                formatter,
                "could not start engine {}: {source}",
                path.display()
            ),
            Self::MissingEngineStdout => {
                formatter.write_str("engine startup channel is unavailable")
            }
            Self::EmptyEngineStartup => {
                formatter.write_str("engine exited before announcing its IPC address")
            }
            Self::EngineStartupTimeout => {
                formatter.write_str("engine did not start within five seconds")
            }
        }
    }
}

impl Error for BackendError {}

impl From<std::io::Error> for BackendError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<serde_json::Error> for BackendError {
    fn from(value: serde_json::Error) -> Self {
        Self::Json(value)
    }
}

impl From<lighthouse_ipc::IpcError> for BackendError {
    fn from(value: lighthouse_ipc::IpcError) -> Self {
        Self::Ipc(value)
    }
}

impl From<lighthouse_persistence::PersistenceError> for BackendError {
    fn from(value: lighthouse_persistence::PersistenceError) -> Self {
        Self::Persistence(value)
    }
}

impl From<lighthouse_fixture_library::FixtureLibraryError> for BackendError {
    fn from(value: lighthouse_fixture_library::FixtureLibraryError) -> Self {
        Self::FixtureLibrary(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory() -> PathBuf {
        std::env::temp_dir().join(format!("lighthouse-desktop-test-{}", Uuid::new_v4()))
    }

    #[test]
    fn demo_project_is_valid_and_ready_for_the_engine() {
        let bundle = demo_project().unwrap();
        assert_eq!(bundle.project.fixtures.len(), 6);
        assert_eq!(bundle.project.scenes.len(), 4);
        assert_eq!(bundle.project.effects.len(), 4);
        assert!(bundle.validate().is_ok());
    }

    #[test]
    fn ui_commands_reject_values_outside_normalized_range() {
        let command = UiEngineCommand::SetGrandMaster { value: 1.2 };
        assert!(matches!(
            command.into_domain(),
            Err(BackendError::InvalidCommand(_))
        ));
    }

    #[test]
    fn desktop_backend_round_trips_commands_through_the_sidecar() {
        let directory = test_directory();
        let mut backend = DesktopBackend::open(directory.clone()).unwrap();
        let first = backend.bootstrap().unwrap().engine;
        thread::sleep(Duration::from_millis(100));
        let later = backend.refresh().unwrap();
        assert!(later.telemetry.frames_sent > first.telemetry.frames_sent);

        let blackout = backend
            .command(UiEngineCommand::SetBlackout { enabled: true })
            .unwrap();
        assert!(blackout.blackout);
        let scene = backend
            .command(UiEngineCommand::ActivateScene {
                scene_id: "201".into(),
                fade_ms: Some(0),
            })
            .unwrap();
        assert_eq!(scene.active_scene_ids, vec!["201"]);

        if let Some(child) = backend.session.child.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
        drop(backend);
        fs::remove_dir_all(directory).unwrap();
    }
}
