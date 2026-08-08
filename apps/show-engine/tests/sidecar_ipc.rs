use std::fs;
use std::io::{BufRead, BufReader};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::Duration;

use lighthouse_domain::ProjectId;
use lighthouse_ipc::{
    ClientMessage, IPC_CONTRACT_VERSION, ServerMessage, read_message, write_message,
};
use lighthouse_persistence::{ProjectBundle, ProjectStore};

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
    ProjectStore::save_atomic(
        &project_path,
        &ProjectBundle::empty(ProjectId::new(77), "Sidecar Test"),
    )
    .unwrap();

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

    let _ = child.0.kill();
    let _ = child.0.wait();
    fs::remove_dir_all(directory).unwrap();
}

fn request_frame_count(address: &str) -> u64 {
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
    write_message(&mut stream, &ClientMessage::RequestSnapshot).unwrap();
    let ServerMessage::Snapshot { telemetry, .. } = read_message(&mut stream).unwrap().unwrap()
    else {
        panic!("expected engine snapshot");
    };
    telemetry.frames_sent
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
