use std::error::Error;
use std::net::UdpSocket;
use std::time::Instant;

use lighthouse_output_artnet::{ART_NET_PORT, parse_art_dmx};

fn main() -> Result<(), Box<dyn Error>> {
    let bind_address = std::env::args()
        .nth(1)
        .unwrap_or_else(|| format!("0.0.0.0:{ART_NET_PORT}"));
    let socket = UdpSocket::bind(&bind_address)?;
    let mut buffer = [0_u8; 1024];
    let mut first_packet_at = None;
    let mut packet_count = 0_u64;

    println!("Virtual DMX node listening on {bind_address}");
    loop {
        let (length, sender) = socket.recv_from(&mut buffer)?;
        let Ok(packet) = parse_art_dmx(&buffer[..length]) else {
            continue;
        };
        let received_at = Instant::now();
        let started = *first_packet_at.get_or_insert(received_at);
        packet_count += 1;
        let elapsed = received_at.duration_since(started).as_secs_f64();
        let average_hz = if packet_count > 1 {
            (packet_count - 1) as f64 / elapsed.max(f64::EPSILON)
        } else {
            0.0
        };
        println!(
            "from={sender} port-address={} sequence={} slots={} first={} average={average_hz:.1}Hz",
            packet.port_address,
            packet.sequence,
            packet.data.len(),
            packet.data.first().copied().unwrap_or_default()
        );
    }
}
