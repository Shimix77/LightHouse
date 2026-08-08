//! Minimal non-blocking Art-Net ArtDmx output adapter.

use std::collections::BTreeMap;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::io;
use std::net::{SocketAddr, ToSocketAddrs, UdpSocket};

use lighthouse_domain::UniverseId;
use lighthouse_output_api::{DMX_SLOT_COUNT, DmxFrame, FrameSet, OutputAdapter};

pub const ART_NET_PORT: u16 = 6454;
pub const ART_NET_PROTOCOL_VERSION: u16 = 14;
const ART_DMX_OPCODE: u16 = 0x5000;
const ART_DMX_HEADER_LENGTH: usize = 18;
const ART_NET_ID: &[u8; 8] = b"Art-Net\0";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ArtNetRoute {
    pub port_address: u16,
    pub destination: SocketAddr,
}

pub struct ArtNetOutput {
    socket: UdpSocket,
    routes: BTreeMap<UniverseId, ArtNetRoute>,
    sequence: u8,
}

impl ArtNetOutput {
    pub fn bind(address: impl ToSocketAddrs) -> io::Result<Self> {
        let socket = UdpSocket::bind(address)?;
        socket.set_nonblocking(true)?;
        socket.set_broadcast(true)?;
        Ok(Self {
            socket,
            routes: BTreeMap::new(),
            sequence: 1,
        })
    }

    pub fn set_route(&mut self, universe_id: UniverseId, route: ArtNetRoute) {
        self.routes.insert(universe_id, route);
    }

    fn next_sequence(&mut self) -> u8 {
        let current = self.sequence;
        self.sequence = if current == u8::MAX { 1 } else { current + 1 };
        current
    }
}

impl OutputAdapter for ArtNetOutput {
    fn send(&mut self, frames: &FrameSet) -> io::Result<()> {
        let sequence = self.next_sequence();
        for frame in frames.iter() {
            let Some(route) = self.routes.get(&frame.universe_id).copied() else {
                continue;
            };
            let packet = encode_art_dmx(frame, route.port_address, sequence)
                .map_err(|error| io::Error::new(io::ErrorKind::InvalidInput, error))?;
            match self.socket.send_to(&packet, route.destination) {
                Ok(_) => {}
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => {}
                Err(error) => return Err(error),
            }
        }
        Ok(())
    }
}

pub fn encode_art_dmx(
    frame: &DmxFrame,
    port_address: u16,
    sequence: u8,
) -> Result<Vec<u8>, ArtNetError> {
    if port_address > 0x7fff {
        return Err(ArtNetError::InvalidPortAddress(port_address));
    }

    let mut packet = vec![0; ART_DMX_HEADER_LENGTH + DMX_SLOT_COUNT];
    packet[0..8].copy_from_slice(ART_NET_ID);
    packet[8..10].copy_from_slice(&ART_DMX_OPCODE.to_le_bytes());
    packet[10..12].copy_from_slice(&ART_NET_PROTOCOL_VERSION.to_be_bytes());
    packet[12] = sequence;
    packet[13] = 0;
    packet[14] = (port_address & 0x00ff) as u8;
    packet[15] = ((port_address >> 8) & 0x007f) as u8;
    packet[16..18].copy_from_slice(&(DMX_SLOT_COUNT as u16).to_be_bytes());
    packet[ART_DMX_HEADER_LENGTH..].copy_from_slice(frame.slots());
    Ok(packet)
}

pub fn parse_art_dmx(packet: &[u8]) -> Result<ParsedArtDmx<'_>, ArtNetError> {
    if packet.len() < ART_DMX_HEADER_LENGTH {
        return Err(ArtNetError::PacketTooShort(packet.len()));
    }
    if &packet[0..8] != ART_NET_ID {
        return Err(ArtNetError::InvalidId);
    }
    if u16::from_le_bytes([packet[8], packet[9]]) != ART_DMX_OPCODE {
        return Err(ArtNetError::UnsupportedOpcode);
    }
    let length = usize::from(u16::from_be_bytes([packet[16], packet[17]]));
    if !(2..=DMX_SLOT_COUNT).contains(&length) || length % 2 != 0 {
        return Err(ArtNetError::InvalidDmxLength(length));
    }
    if packet.len() < ART_DMX_HEADER_LENGTH + length {
        return Err(ArtNetError::PacketTooShort(packet.len()));
    }

    Ok(ParsedArtDmx {
        sequence: packet[12],
        port_address: u16::from(packet[14]) | (u16::from(packet[15] & 0x7f) << 8),
        data: &packet[ART_DMX_HEADER_LENGTH..ART_DMX_HEADER_LENGTH + length],
    })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ParsedArtDmx<'a> {
    pub sequence: u8,
    pub port_address: u16,
    pub data: &'a [u8],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ArtNetError {
    InvalidPortAddress(u16),
    PacketTooShort(usize),
    InvalidId,
    UnsupportedOpcode,
    InvalidDmxLength(usize),
}

impl Display for ArtNetError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidPortAddress(address) => {
                write!(formatter, "Art-Net port-address {address} exceeds 15 bits")
            }
            Self::PacketTooShort(length) => {
                write!(formatter, "Art-Net packet is too short: {length}")
            }
            Self::InvalidId => formatter.write_str("invalid Art-Net packet id"),
            Self::UnsupportedOpcode => formatter.write_str("packet is not ArtDmx"),
            Self::InvalidDmxLength(length) => write!(formatter, "invalid ArtDmx length {length}"),
        }
    }
}

impl Error for ArtNetError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_and_parses_a_full_art_dmx_packet() {
        let mut frame = DmxFrame::new(UniverseId::new(42));
        frame.set_slot(1, 255, true).unwrap();
        frame.set_slot(512, 17, false).unwrap();

        let packet = encode_art_dmx(&frame, 0x1234, 9).unwrap();
        assert_eq!(packet.len(), 530);
        assert_eq!(&packet[0..8], b"Art-Net\0");
        assert_eq!(&packet[8..10], &[0x00, 0x50]);
        assert_eq!(&packet[10..12], &[0x00, 0x0e]);
        assert_eq!(&packet[16..18], &[0x02, 0x00]);

        let parsed = parse_art_dmx(&packet).unwrap();
        assert_eq!(parsed.sequence, 9);
        assert_eq!(parsed.port_address, 0x1234);
        assert_eq!(parsed.data[0], 255);
        assert_eq!(parsed.data[511], 17);
    }

    #[test]
    fn rejects_an_out_of_range_port_address() {
        let frame = DmxFrame::new(UniverseId::new(1));
        assert_eq!(
            encode_art_dmx(&frame, 0x8000, 1),
            Err(ArtNetError::InvalidPortAddress(0x8000))
        );
    }
}
