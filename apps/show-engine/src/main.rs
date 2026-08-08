use std::error::Error;
use std::net::SocketAddr;
use std::thread;
use std::time::Duration;

use lighthouse_domain::UniverseId;
use lighthouse_output_api::FrameSet;
use lighthouse_output_artnet::{ART_NET_PORT, ArtNetOutput, ArtNetRoute};
use lighthouse_show_engine::{DEFAULT_DMX_REFRESH_HZ, DmxOutputLoop};

fn main() -> Result<(), Box<dyn Error>> {
    let destination: SocketAddr = std::env::args()
        .nth(1)
        .unwrap_or_else(|| format!("127.0.0.1:{ART_NET_PORT}"))
        .parse()?;

    let universe_id = UniverseId::new(1);
    let mut adapter = ArtNetOutput::bind("0.0.0.0:0")?;
    adapter.set_route(
        universe_id,
        ArtNetRoute {
            port_address: 0,
            destination,
        },
    );

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
