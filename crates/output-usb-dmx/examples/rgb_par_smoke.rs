//! Explicit live RGB PAR test. Channel 4 is always held at zero.

use std::env;
use std::thread;
use std::time::{Duration, Instant};

use lighthouse_domain::UniverseId;
use lighthouse_output_api::{FrameSet, OutputAdapter};
use lighthouse_output_usb_dmx::OpenDmxOutput;

const FRAME_INTERVAL: Duration = Duration::from_millis(25);
const LOOK_DURATION: Duration = Duration::from_millis(900);
const WHITE_ONLY_DURATION: Duration = Duration::from_secs(2);
const BLACKOUT_DURATION: Duration = Duration::from_millis(450);
const CONFIRMATION: &str = "--confirm-live-dmx";
const RGB_ONLY: &str = "--rgb-only";
const WHITE_ONLY: &str = "--white-only";

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut arguments = env::args().skip(1);
    let device_path = arguments
        .next()
        .ok_or("usage: rgb_par_smoke /dev/cu.usbserial-… <max-percent> --confirm-live-dmx")?;
    let maximum_percent = arguments
        .next()
        .ok_or("maximum percentage is required")?
        .parse::<u8>()?;
    if !(1..=100).contains(&maximum_percent) {
        return Err("maximum percentage must be between 1 and 100".into());
    }
    if arguments.next().as_deref() != Some(CONFIRMATION) {
        return Err("live DMX confirmation token is missing".into());
    }
    let test_mode = match arguments.next().as_deref() {
        None => TestMode::Complete,
        Some(RGB_ONLY) => TestMode::RgbOnly,
        Some(WHITE_ONLY) => TestMode::WhiteOnly,
        Some(_) => return Err("unknown RGB PAR smoke-test mode".into()),
    };
    if arguments.next().is_some() {
        return Err("too many RGB PAR smoke-test arguments".into());
    }

    let universe_id = UniverseId::new(1);
    let mut output = OpenDmxOutput::open(&device_path, universe_id)?;
    let maximum = ((u16::from(maximum_percent) * 255 + 50) / 100) as u8;
    let low = (maximum / 4).max(1);
    let medium = (maximum / 2).max(1);

    eprintln!(
        "LIVE RGB test on {device_path}; CH1=R CH2=G CH3=B CH4=0, maximum={maximum_percent}%"
    );
    let test_result = if test_mode == TestMode::WhiteOnly {
        eprintln!("LOOK: BLACKOUT");
        send_look(&mut output, universe_id, [0, 0, 0, 0], BLACKOUT_DURATION)?;
        eprintln!("LOOK: WHITE MAX ([{maximum}, {maximum}, {maximum}, 0])");
        send_look(
            &mut output,
            universe_id,
            [maximum, maximum, maximum, 0],
            WHITE_ONLY_DURATION,
        )
    } else if test_mode == TestMode::RgbOnly {
        run_sequence(
            &mut output,
            universe_id,
            [
                ("RED", [maximum, 0, 0, 0]),
                ("GREEN", [0, maximum, 0, 0]),
                ("BLUE", [0, 0, maximum, 0]),
            ],
        )
    } else {
        run_sequence(
            &mut output,
            universe_id,
            [
                ("RED", [maximum, 0, 0, 0]),
                ("GREEN", [0, maximum, 0, 0]),
                ("BLUE", [0, 0, maximum, 0]),
                ("WHITE LOW", [low, low, low, 0]),
                ("WHITE MEDIUM", [medium, medium, medium, 0]),
                ("WHITE MAX", [maximum, maximum, maximum, 0]),
            ],
        )
    };

    // A final blackout is attempted even if an earlier look failed.
    let blackout_result = send_look(&mut output, universe_id, [0, 0, 0, 0], BLACKOUT_DURATION);
    test_result?;
    blackout_result?;
    eprintln!("RGB PAR live test finished with an explicit blackout.");
    Ok(())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TestMode {
    Complete,
    RgbOnly,
    WhiteOnly,
}

fn run_sequence<const N: usize>(
    output: &mut OpenDmxOutput,
    universe_id: UniverseId,
    looks: [(&str, [u8; 4]); N],
) -> Result<(), Box<dyn std::error::Error>> {
    eprintln!("LOOK: BLACKOUT");
    send_look(output, universe_id, [0, 0, 0, 0], BLACKOUT_DURATION)?;
    for (label, channels) in looks {
        eprintln!("LOOK: {label} ({channels:?})");
        send_look(output, universe_id, channels, LOOK_DURATION)?;
        eprintln!("LOOK: BLACKOUT");
        send_look(output, universe_id, [0, 0, 0, 0], BLACKOUT_DURATION)?;
    }
    Ok(())
}

fn send_look(
    output: &mut OpenDmxOutput,
    universe_id: UniverseId,
    channels: [u8; 4],
    duration: Duration,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut frames = FrameSet::default();
    let frame = frames.frame_mut(universe_id);
    for (index, value) in channels.into_iter().enumerate() {
        frame.set_slot(index as u16 + 1, value, index < 3)?;
    }
    let deadline = Instant::now() + duration;
    while Instant::now() < deadline {
        let started = Instant::now();
        output.send(&frames)?;
        if let Some(remaining) = FRAME_INTERVAL.checked_sub(started.elapsed()) {
            thread::sleep(remaining);
        }
    }
    Ok(())
}
