//! FTDI/Open-DMX output adapter with an injectable transport for hardware-free tests.

use std::io::{self, Write};
use std::thread;
use std::time::Duration;

use lighthouse_domain::UniverseId;
use lighthouse_output_api::{DMX_SLOT_COUNT, FrameSet, OutputAdapter};
use serialport::{DataBits, FlowControl, Parity, SerialPort, SerialPortType, StopBits};

pub const DMX_BAUD_RATE: u32 = 250_000;
pub const DMX_START_CODE: u8 = 0;
pub const DEFAULT_BREAK: Duration = Duration::from_micros(120);
pub const DEFAULT_MARK_AFTER_BREAK: Duration = Duration::from_micros(16);
const SERIAL_TIMEOUT: Duration = Duration::from_millis(20);
const FTDI_VENDOR_ID: u16 = 0x0403;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UsbDmxPortInfo {
    pub path: String,
    pub product: Option<String>,
    pub serial_number: Option<String>,
}

/// Enumerates FTDI virtual serial ports without opening or claiming them.
pub fn discover_ftdi_ports() -> io::Result<Vec<UsbDmxPortInfo>> {
    let mut ports = serialport::available_ports()
        .map_err(serial_error)?
        .into_iter()
        .filter_map(|port| match port.port_type {
            SerialPortType::UsbPort(info) if info.vid == FTDI_VENDOR_ID => Some(UsbDmxPortInfo {
                path: preferred_outgoing_path(port.port_name),
                product: info.product,
                serial_number: info.serial_number,
            }),
            _ => None,
        })
        .collect::<Vec<_>>();
    ports.sort_by(|left, right| left.path.cmp(&right.path));
    ports.dedup_by(|left, right| left.path == right.path);
    Ok(ports)
}

fn preferred_outgoing_path(path: String) -> String {
    #[cfg(target_os = "macos")]
    if let Some(suffix) = path.strip_prefix("/dev/tty.") {
        let candidate = format!("/dev/cu.{suffix}");
        if std::path::Path::new(&candidate).exists() {
            return candidate;
        }
    }
    path
}

pub trait OpenDmxTransport: Write + Send + 'static {
    fn set_break(&self) -> io::Result<()>;
    fn clear_break(&self) -> io::Result<()>;
}

#[doc(hidden)]
pub struct SerialTransport {
    port: Box<dyn SerialPort>,
}

impl Write for SerialTransport {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        self.port.write(buffer)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.port.flush()
    }
}

impl OpenDmxTransport for SerialTransport {
    fn set_break(&self) -> io::Result<()> {
        self.port.set_break().map_err(serial_error)
    }

    fn clear_break(&self) -> io::Result<()> {
        self.port.clear_break().map_err(serial_error)
    }
}

pub struct OpenDmxOutput<T: OpenDmxTransport = SerialTransport> {
    universe_id: UniverseId,
    transport: T,
    break_duration: Duration,
    mark_after_break: Duration,
}

impl OpenDmxOutput<SerialTransport> {
    /// Opens a serial device as 250000 baud, 8 data bits, no parity and 2 stop bits.
    /// Calling this function claims the device and enables physical DMX transmission.
    pub fn open(device_path: &str, universe_id: UniverseId) -> io::Result<Self> {
        validate_device_path(device_path)?;
        let port = serialport::new(device_path, DMX_BAUD_RATE)
            .data_bits(DataBits::Eight)
            .flow_control(FlowControl::None)
            .parity(Parity::None)
            .stop_bits(StopBits::Two)
            .timeout(SERIAL_TIMEOUT)
            .open()
            .map_err(serial_error)?;
        Ok(Self::with_transport(universe_id, SerialTransport { port }))
    }
}

impl<T: OpenDmxTransport> OpenDmxOutput<T> {
    #[must_use]
    pub const fn with_transport(universe_id: UniverseId, transport: T) -> Self {
        Self {
            universe_id,
            transport,
            break_duration: DEFAULT_BREAK,
            mark_after_break: DEFAULT_MARK_AFTER_BREAK,
        }
    }

    #[must_use]
    pub const fn with_timing(
        mut self,
        break_duration: Duration,
        mark_after_break: Duration,
    ) -> Self {
        self.break_duration = break_duration;
        self.mark_after_break = mark_after_break;
        self
    }

    fn write_frame(&mut self, slots: &[u8; DMX_SLOT_COUNT]) -> io::Result<()> {
        self.transport.set_break()?;
        thread::sleep(self.break_duration);
        self.transport.clear_break()?;
        thread::sleep(self.mark_after_break);
        let mut packet = [0_u8; DMX_SLOT_COUNT + 1];
        packet[0] = DMX_START_CODE;
        packet[1..].copy_from_slice(slots);
        self.transport.write_all(&packet)
    }
}

impl<T: OpenDmxTransport> OutputAdapter for OpenDmxOutput<T> {
    fn send(&mut self, frames: &FrameSet) -> io::Result<()> {
        let Some(frame) = frames.frame(self.universe_id) else {
            return Ok(());
        };
        self.write_frame(frame.slots())
    }
}

pub fn validate_device_path(device_path: &str) -> io::Result<()> {
    let valid_macos = device_path.starts_with("/dev/cu.") || device_path.starts_with("/dev/tty.");
    let valid_windows = device_path
        .strip_prefix("COM")
        .or_else(|| device_path.strip_prefix("com"))
        .is_some_and(|number| {
            number
                .parse::<u16>()
                .is_ok_and(|value| (1..=256).contains(&value))
        });
    if device_path.len() > 512
        || device_path.contains('\0')
        || device_path.contains("..")
        || !(valid_macos || valid_windows)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "USB-DMX device must be a macOS /dev/cu.* or Windows COM port",
        ));
    }
    Ok(())
}

fn serial_error(error: serialport::Error) -> io::Error {
    let kind = match error.kind() {
        serialport::ErrorKind::NoDevice => io::ErrorKind::NotFound,
        serialport::ErrorKind::InvalidInput => io::ErrorKind::InvalidInput,
        serialport::ErrorKind::Io(kind) => kind,
        _ => io::ErrorKind::Other,
    };
    io::Error::new(kind, error.to_string())
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;

    #[derive(Clone, Debug, Default)]
    struct MockState {
        events: Vec<&'static str>,
        bytes: Vec<u8>,
    }

    #[derive(Clone, Debug, Default)]
    struct MockTransport {
        state: Arc<Mutex<MockState>>,
    }

    impl Write for MockTransport {
        fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
            let mut state = self.state.lock().unwrap();
            state.events.push("write");
            state.bytes.extend_from_slice(buffer);
            Ok(buffer.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl OpenDmxTransport for MockTransport {
        fn set_break(&self) -> io::Result<()> {
            self.state.lock().unwrap().events.push("break-on");
            Ok(())
        }

        fn clear_break(&self) -> io::Result<()> {
            self.state.lock().unwrap().events.push("break-off");
            Ok(())
        }
    }

    #[test]
    fn writes_break_start_code_and_all_512_slots() {
        let transport = MockTransport::default();
        let state = Arc::clone(&transport.state);
        let mut output = OpenDmxOutput::with_transport(UniverseId::new(2), transport)
            .with_timing(Duration::ZERO, Duration::ZERO);
        let mut frames = FrameSet::default();
        let frame = frames.frame_mut(UniverseId::new(2));
        frame.set_slot(1, 255, true).unwrap();
        frame.set_slot(512, 17, false).unwrap();

        output.send(&frames).unwrap();

        let state = state.lock().unwrap();
        assert_eq!(state.events, ["break-on", "break-off", "write"]);
        assert_eq!(state.bytes.len(), DMX_SLOT_COUNT + 1);
        assert_eq!(state.bytes[0], DMX_START_CODE);
        assert_eq!(state.bytes[1], 255);
        assert_eq!(state.bytes[512], 17);
    }

    #[test]
    fn ignores_frames_for_other_universes() {
        let transport = MockTransport::default();
        let state = Arc::clone(&transport.state);
        let mut output = OpenDmxOutput::with_transport(UniverseId::new(2), transport)
            .with_timing(Duration::ZERO, Duration::ZERO);
        let mut frames = FrameSet::default();
        frames.frame_mut(UniverseId::new(1));

        output.send(&frames).unwrap();

        assert!(state.lock().unwrap().events.is_empty());
    }

    #[test]
    fn validates_cross_platform_serial_device_names() {
        assert!(validate_device_path("/dev/cu.usbserial-AB0KT9HX").is_ok());
        assert!(validate_device_path("COM12").is_ok());
        assert!(validate_device_path("/tmp/not-a-device").is_err());
        assert!(validate_device_path("/dev/cu../escape").is_err());
    }
}
