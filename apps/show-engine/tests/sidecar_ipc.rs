use std::fs;
use std::io::{BufRead, BufReader};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

use lighthouse_domain::{FixtureId, ProjectId, UniverseId};
use lighthouse_fixture_library::FixtureLibrary;
use lighthouse_ipc::{
    ClientMessage, IPC_CONTRACT_VERSION, ServerMessage, read_message, write_message,
};
use lighthouse_persistence::{
    FixtureRecord, OutputRouteRecord, PatchRecord, ProjectBundle, ProjectStore, UniverseRecord,
};

static TEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);

struct ChildGuard(Child);

impl Drop for ChildGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[test]
fn client_can_disconnect_and_reconnect_while_engine_output_continues() {
    let directory = test_directory();
    let project_path = directory.join("sidecar.lightshow");
    let mut bundle = ProjectBundle::empty(ProjectId::new(77), "Sidecar Test");
    bundle.project.universes.push(UniverseRecord {
        id: UniverseId::new(1),
        name: "Test Universe".into(),
        enabled: true,
        routes: vec![OutputRouteRecord::ArtNet {
            port_address: 0,
            destination: "127.0.0.1:6454".into(),
            interface: None,
            broadcast: false,
        }],
    });
    bundle.fixture_definitions = FixtureLibrary::with_generic_pack()
        .unwrap()
        .iter()
        .cloned()
        .collect();
    bundle.project.fixtures.push(FixtureRecord {
        id: FixtureId::new(1),
        name: "Test Dimmer".into(),
        definition_id: "generic.dimmer".into(),
        definition_revision: "1".into(),
        mode_id: "1ch".into(),
        enabled: true,
        invert_pan: false,
        invert_tilt: false,
    });
    bundle.project.patch.push(PatchRecord {
        fixture_id: FixtureId::new(1),
        universe_id: UniverseId::new(1),
        start_address: 1,
        footprint: 1,
    });
    ProjectStore::save_atomic(&project_path, &bundle).unwrap();

    let mut child = Command::new(env!("CARGO_BIN_EXE_lighthouse-show-engine-app"))
        .args([
            "serve",
            project_path.to_str().unwrap(),
            "test-token",
            "127.0.0.1:0",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let stdout = child.stdout.take().unwrap();
    let mut child = ChildGuard(child);
    let mut reader = BufReader::new(stdout);
    let mut startup_line = String::new();
    reader.read_line(&mut startup_line).unwrap();
    let startup: serde_json::Value = serde_json::from_str(&startup_line).unwrap();
    let address = startup["address"].as_str().unwrap();

    let first_frames = request_frame_count(address);
    thread::sleep(Duration::from_millis(100));
    let later_frames = request_frame_count(address);
    assert!(
        later_frames > first_frames,
        "DMX output stopped across UI disconnect: {first_frames} -> {later_frames}"
    );

    let mut shutdown_stream = authenticated_stream(address);
    write_message(&mut shutdown_stream, &ClientMessage::Shutdown).unwrap();
    assert!(matches!(
        read_message::<_, ServerMessage>(&mut shutdown_stream)
            .unwrap()
            .unwrap(),
        ServerMessage::ShuttingDown
    ));
    let mut stopped = false;
    for _ in 0..50 {
        if child.0.try_wait().unwrap().is_some() {
            stopped = true;
            break;
        }
        thread::sleep(Duration::from_millis(20));
    }
    assert!(stopped, "sidecar did not stop within one second");

    fs::remove_dir_all(directory).unwrap();
}

fn request_frame_count(address: &str) -> u64 {
    let mut stream = authenticated_stream(address);
    write_message(&mut stream, &ClientMessage::RequestSnapshot).unwrap();
    let ServerMessage::Snapshot { telemetry, .. } = read_message(&mut stream).unwrap().unwrap()
    else {
        panic!("expected engine snapshot");
    };
    telemetry.frames_sent
}

fn authenticated_stream(address: &str) -> TcpStream {
    let mut stream = TcpStream::connect(address).unwrap();
    write_message(
        &mut stream,
        &ClientMessage::Hello {
            contract_version: IPC_CONTRACT_VERSION,
            auth_token: "test-token".into(),
            client_id: "integration-test".into(),
        },
    )
    .unwrap();
    assert!(matches!(
        read_message::<_, ServerMessage>(&mut stream)
            .unwrap()
            .unwrap(),
        ServerMessage::Welcome { .. }
    ));
    stream
}

fn test_directory() -> PathBuf {
    let sequence = TEST_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!(
        "lighthouse-sidecar-test-{}-{sequence}",
        std::process::id()
    ));
    fs::create_dir_all(&path).unwrap();
    path
}
