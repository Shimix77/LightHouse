use std::error::Error;
use std::ffi::OsString;
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use lighthouse_domain::UniverseId;
use lighthouse_engine_runtime::{EngineClient, EngineRuntime, EngineRuntimeConfig};
use lighthouse_ipc::{
    ClientMessage, EngineTelemetry, HandshakeResult, HandshakeValidator, IPC_CONTRACT_VERSION,
    ServerMessage, read_message, write_message,
};
use lighthouse_output_api::FrameSet;
use lighthouse_output_artnet::{ART_NET_PORT, ArtNetOutput, ArtNetRoute};
use lighthouse_persistence::{DisconnectPolicy, OutputRouteRecord, ProjectStore, RecoveryJournal};
use lighthouse_show_engine::{DEFAULT_DMX_REFRESH_HZ, DmxOutputLoop};

fn main() -> Result<(), Box<dyn Error>> {
    let mut arguments = std::env::args().skip(1);
    match arguments.next().as_deref() {
        Some("serve") => {
            let project_path = arguments.next().ok_or(
                "usage: lighthouse-show-engine-app serve <project.lightshow> <token> [address]",
            )?;
            let auth_token = arguments.next().ok_or(
                "usage: lighthouse-show-engine-app serve <project.lightshow> <token> [address]",
            )?;
            let address = arguments.next().unwrap_or_else(|| "127.0.0.1:0".into());
            serve(Path::new(&project_path), auth_token, &address)
        }
        Some("demo-artnet") => {
            let destination = arguments
                .next()
                .unwrap_or_else(|| format!("127.0.0.1:{ART_NET_PORT}"));
            demo_artnet(destination.parse()?)
        }
        _ => Err("usage: lighthouse-show-engine-app <serve|demo-artnet> ...".into()),
    }
}

fn serve(project_path: &Path, auth_token: String, address: &str) -> Result<(), Box<dyn Error>> {
    let loaded = ProjectStore::load(project_path)?;
    let mut adapter = ArtNetOutput::bind("0.0.0.0:0")?;
    configure_artnet_routes(&mut adapter, &loaded.bundle)?;
    let refresh_hz = loaded.bundle.project.settings.dmx_refresh_hz;
    let disconnect_policy = loaded.bundle.project.settings.disconnect_policy;
    let disconnect_timeout =
        Duration::from_millis(loaded.bundle.project.settings.disconnect_timeout_ms);
    let project_id = loaded.bundle.project.project_id;
    let recovery_path = recovery_path(project_path);
    let runtime = EngineRuntime::start(
        loaded.bundle,
        adapter,
        EngineRuntimeConfig {
            refresh_hz,
            recovery_journal_path: Some(recovery_path.clone()),
            ..EngineRuntimeConfig::default()
        },
    )?;
    let watchdog = ClientWatchdog::new(disconnect_policy, disconnect_timeout, runtime.client());

    let listener = TcpListener::bind(address)?;
    listener.set_nonblocking(true)?;
    let bound_address = listener.local_addr()?;
    println!(
        "{{\"address\":\"{bound_address}\",\"contractVersion\":{IPC_CONTRACT_VERSION},\"projectId\":{}}}",
        project_id.0
    );
    let shutdown = Arc::new(AtomicBool::new(false));
    while !shutdown.load(Ordering::Acquire) {
        watchdog.poll();
        match listener.accept() {
            Ok((stream, _peer_address)) => {
                let validator = HandshakeValidator::new(auth_token.clone());
                let client = runtime.client();
                let client_shutdown = Arc::clone(&shutdown);
                let client_watchdog = watchdog.clone();
                thread::Builder::new()
                    .name("lighthouse-ipc-client".into())
                    .spawn(move || {
                        let _ = handle_client(
                            stream,
                            &validator,
                            &client,
                            &client_shutdown,
                            &client_watchdog,
                        );
                    })?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(20));
            }
            Err(error) => eprintln!("IPC accept failed: {error}"),
        }
    }
    // Give the authenticated shutdown client time to receive its acknowledgement before
    // dropping the runtime and terminating the process.
    thread::sleep(Duration::from_millis(40));
    runtime.shutdown();
    RecoveryJournal::new(recovery_path).truncate()?;
    Ok(())
}

#[derive(Clone)]
struct ClientWatchdog {
    enabled: bool,
    timeout: Duration,
    last_activity: Arc<Mutex<Instant>>,
    tripped: Arc<AtomicBool>,
    client: EngineClient,
}

impl ClientWatchdog {
    fn new(policy: DisconnectPolicy, timeout: Duration, client: EngineClient) -> Self {
        Self {
            enabled: policy == DisconnectPolicy::BlackoutAfterTimeout,
            timeout,
            last_activity: Arc::new(Mutex::new(Instant::now())),
            tripped: Arc::new(AtomicBool::new(false)),
            client,
        }
    }

    fn mark_activity(&self) {
        *self
            .last_activity
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Instant::now();
        if self.tripped.swap(false, Ordering::AcqRel) {
            self.client.set_watchdog_blackout(false);
        }
    }

    fn poll(&self) {
        if !self.enabled || self.tripped.load(Ordering::Acquire) {
            return;
        }
        let elapsed = self
            .last_activity
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .elapsed();
        if elapsed >= self.timeout && !self.tripped.swap(true, Ordering::AcqRel) {
            self.client.set_watchdog_blackout(true);
        }
    }
}

fn configure_artnet_routes(
    adapter: &mut ArtNetOutput,
    bundle: &lighthouse_persistence::ProjectBundle,
) -> Result<(), Box<dyn Error>> {
    for universe in bundle
        .project
        .universes
        .iter()
        .filter(|universe| universe.enabled)
    {
        for route in &universe.routes {
            match route {
                OutputRouteRecord::ArtNet {
                    port_address,
                    destination,
                    interface,
                    broadcast,
                } => {
                    adapter.set_route(
                        universe.id,
                        ArtNetRoute {
                            port_address: *port_address,
                            destination: destination.parse()?,
                            interface: interface.as_deref().map(str::parse).transpose()?,
                            broadcast: *broadcast,
                        },
                    )?;
                }
            }
        }
    }
    Ok(())
}

fn handle_client(
    mut stream: TcpStream,
    validator: &HandshakeValidator,
    client: &EngineClient,
    shutdown: &AtomicBool,
    watchdog: &ClientWatchdog,
) -> Result<(), Box<dyn Error>> {
    stream.set_nonblocking(false)?;
    stream.set_nodelay(true)?;
    let Some(hello) = read_message::<_, ClientMessage>(&mut stream)? else {
        return Ok(());
    };
    match validator.validate(&hello) {
        HandshakeResult::Accepted => {
            watchdog.mark_activity();
            let snapshot = client.snapshot();
            write_message(
                &mut stream,
                &ServerMessage::Welcome {
                    contract_version: IPC_CONTRACT_VERSION,
                    engine_version: env!("CARGO_PKG_VERSION").into(),
                    project_id: snapshot.show.project_id,
                    revision: snapshot.show.revision,
                },
            )?;
        }
        HandshakeResult::AuthenticationRejected => {
            write_message(&mut stream, &ServerMessage::AuthenticationRejected)?;
            return Ok(());
        }
        HandshakeResult::ContractRejected => {
            write_message(
                &mut stream,
                &ServerMessage::ContractRejected {
                    supported_version: IPC_CONTRACT_VERSION,
                },
            )?;
            return Ok(());
        }
    }

    while let Some(message) = read_message::<_, ClientMessage>(&mut stream)? {
        watchdog.mark_activity();
        let response = match message {
            ClientMessage::Hello { .. } => ServerMessage::EngineError {
                message: "client is already authenticated".into(),
            },
            ClientMessage::Command { envelope } => match client.submit(*envelope) {
                Ok(outcome) => ServerMessage::CommandOutcome { outcome },
                Err(error) => ServerMessage::EngineError {
                    message: error.to_string(),
                },
            },
            ClientMessage::RequestSnapshot => snapshot_message(client),
            ClientMessage::Ping { nonce } => ServerMessage::Pong { nonce },
            ClientMessage::Shutdown => ServerMessage::ShuttingDown,
        };
        write_message(&mut stream, &response)?;
        if matches!(response, ServerMessage::ShuttingDown) {
            stream.shutdown(std::net::Shutdown::Write)?;
            shutdown.store(true, Ordering::Release);
            break;
        }
    }
    Ok(())
}

fn snapshot_message(client: &EngineClient) -> ServerMessage {
    let snapshot = client.snapshot();
    ServerMessage::Snapshot {
        snapshot: snapshot.show,
        telemetry: EngineTelemetry {
            frames_sent: snapshot.telemetry.output.frames_sent,
            send_errors: snapshot.telemetry.output.send_errors,
            missed_deadlines: snapshot.telemetry.output.missed_deadlines,
            dropped_commands: snapshot.telemetry.dropped_commands,
            dropped_journal_entries: snapshot.telemetry.dropped_journal_entries,
            watchdog_blackout: snapshot.telemetry.watchdog_blackout,
        },
    }
}

fn recovery_path(project_path: &Path) -> PathBuf {
    let mut value: OsString = project_path.as_os_str().to_owned();
    value.push(".recovery.jsonl");
    PathBuf::from(value)
}

fn demo_artnet(destination: SocketAddr) -> Result<(), Box<dyn Error>> {
    let universe_id = UniverseId::new(1);
    let mut adapter = ArtNetOutput::bind("0.0.0.0:0")?;
    adapter.set_route(
        universe_id,
        ArtNetRoute {
            port_address: 0,
            destination,
            interface: None,
            broadcast: false,
        },
    )?;

    let output = DmxOutputLoop::start(adapter, DEFAULT_DMX_REFRESH_HZ)?;
    let mut frames = FrameSet::default();
    frames.frame_mut(universe_id).set_slot(1, 255, true)?;
    output.publish(frames);

    println!(
        "Sending a two-second Art-Net test look to {destination} at {DEFAULT_DMX_REFRESH_HZ} Hz"
    );
    thread::sleep(Duration::from_secs(2));
    let metrics = output.metrics();
    output.shutdown();
    println!(
        "Finished: {} frames sent, {} errors, {} missed deadlines",
        metrics.frames_sent, metrics.send_errors, metrics.missed_deadlines
    );
    Ok(())
}
