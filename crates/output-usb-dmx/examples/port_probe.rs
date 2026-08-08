//! Opens a USB-DMX serial device without writing data and reports which settings work.

use std::env;
use std::time::Duration;

use serialport::{DataBits, FlowControl, Parity, StopBits};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let device_path = env::args().nth(1).ok_or(
        "usage: cargo run -p lighthouse-output-usb-dmx --example port_probe -- /dev/cu.usbserial-…",
    )?;

    for (baud_rate, exclusive) in [
        (9_600, true),
        (9_600, false),
        (250_000, true),
        (250_000, false),
    ] {
        let builder = serialport::new(&device_path, baud_rate)
            .data_bits(DataBits::Eight)
            .flow_control(FlowControl::None)
            .parity(Parity::None)
            .stop_bits(StopBits::Two)
            .timeout(Duration::from_millis(20));
        #[cfg(unix)]
        let builder = builder.exclusive(exclusive);

        match builder.open() {
            Ok(_) => eprintln!("PASS baud={baud_rate} exclusive={exclusive}"),
            Err(error) => eprintln!(
                "FAIL baud={baud_rate} exclusive={exclusive}: kind={:?}, error={error}",
                error.kind()
            ),
        }
    }
    Ok(())
}
