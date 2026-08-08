//! Explicit hardware smoke test that sends only zero-valued DMX frames.

use std::env;
use std::thread;
use std::time::{Duration, Instant};

use lighthouse_domain::UniverseId;
use lighthouse_output_api::{FrameSet, OutputAdapter};
use lighthouse_output_usb_dmx::OpenDmxOutput;

const TEST_DURATION: Duration = Duration::from_secs(2);
const FRAME_INTERVAL: Duration = Duration::from_millis(25);

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let device_path = env::args().nth(1).ok_or(
        "usage: cargo run -p lighthouse-output-usb-dmx --example blackout_smoke -- /dev/cu.usbserial-…",
    )?;
    let universe_id = UniverseId::new(1);
    let mut output = OpenDmxOutput::open(&device_path, universe_id)?;
    let mut frames = FrameSet::default();
    frames.frame_mut(universe_id);

    eprintln!("Sending zero-valued DMX frames to {device_path} for two seconds…");
    let deadline = Instant::now() + TEST_DURATION;
    let mut sent = 0_u32;
    while Instant::now() < deadline {
        let started = Instant::now();
        output.send(&frames)?;
        sent += 1;
        if let Some(remaining) = FRAME_INTERVAL.checked_sub(started.elapsed()) {
            thread::sleep(remaining);
        }
    }

    // Leave the connected universe with a final explicit blackout frame.
    output.send(&frames)?;
    eprintln!("USB-DMX blackout smoke test passed: {sent} frames plus final blackout.");
    Ok(())
}
