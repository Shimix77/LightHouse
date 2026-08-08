//! Length-prefixed, versioned IPC messages for the desktop clients and engine sidecar.

use std::error::Error;
use std::fmt::{Display, Formatter};
use std::io::{self, Read, Write};

use lighthouse_commands::{CommandEnvelope, CommandOutcome};
use lighthouse_domain::ProjectId;
use lighthouse_show_engine::ShowSnapshot;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

pub const IPC_CONTRACT_VERSION: u16 = 1;
pub const MAX_FRAME_BYTES: usize = 16 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "data")]
pub enum ClientMessage {
    Hello {
        contract_version: u16,
        auth_token: String,
        client_id: String,
    },
    Command {
        envelope: Box<CommandEnvelope>,
    },
    RequestSnapshot,
    Ping {
        nonce: u64,
    },
    Shutdown,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "data")]
pub enum ServerMessage {
    Welcome {
        contract_version: u16,
        engine_version: String,
        project_id: ProjectId,
        revision: u64,
    },
    AuthenticationRejected,
    ContractRejected {
        supported_version: u16,
    },
    CommandOutcome {
        outcome: CommandOutcome,
    },
    Snapshot {
        snapshot: ShowSnapshot,
        telemetry: EngineTelemetry,
    },
    Pong {
        nonce: u64,
    },
    EngineError {
        message: String,
    },
    ShuttingDown,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineTelemetry {
    pub frames_sent: u64,
    pub send_errors: u64,
    pub missed_deadlines: u64,
    pub dropped_commands: u64,
    pub dropped_journal_entries: u64,
}

#[derive(Clone, Debug)]
pub struct HandshakeValidator {
    expected_token: String,
}

impl HandshakeValidator {
    #[must_use]
    pub fn new(expected_token: impl Into<String>) -> Self {
        Self {
            expected_token: expected_token.into(),
        }
    }

    #[must_use]
    pub fn validate(&self, message: &ClientMessage) -> HandshakeResult {
        let ClientMessage::Hello {
            contract_version,
            auth_token,
            ..
        } = message
        else {
            return HandshakeResult::AuthenticationRejected;
        };
        if *contract_version != IPC_CONTRACT_VERSION {
            return HandshakeResult::ContractRejected;
        }
        if !constant_time_equal(auth_token.as_bytes(), self.expected_token.as_bytes()) {
            return HandshakeResult::AuthenticationRejected;
        }
        HandshakeResult::Accepted
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HandshakeResult {
    Accepted,
    AuthenticationRejected,
    ContractRejected,
}

fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    let mut difference = left.len() ^ right.len();
    let length = left.len().max(right.len());
    for index in 0..length {
        let left_byte = left.get(index).copied().unwrap_or_default();
        let right_byte = right.get(index).copied().unwrap_or_default();
        difference |= usize::from(left_byte ^ right_byte);
    }
    difference == 0
}

pub fn write_message<W: Write, T: Serialize>(writer: &mut W, message: &T) -> Result<(), IpcError> {
    let payload = serde_json::to_vec(message)?;
    if payload.len() > MAX_FRAME_BYTES {
        return Err(IpcError::FrameTooLarge(payload.len()));
    }
    let length =
        u32::try_from(payload.len()).map_err(|_| IpcError::FrameTooLarge(payload.len()))?;
    writer.write_all(&length.to_be_bytes())?;
    writer.write_all(&payload)?;
    writer.flush()?;
    Ok(())
}

pub fn read_message<R: Read, T: DeserializeOwned>(reader: &mut R) -> Result<Option<T>, IpcError> {
    let mut length_bytes = [0_u8; 4];
    match reader.read_exact(&mut length_bytes) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(error) => return Err(error.into()),
    }
    let length = u32::from_be_bytes(length_bytes) as usize;
    if length > MAX_FRAME_BYTES {
        return Err(IpcError::FrameTooLarge(length));
    }
    let mut payload = vec![0; length];
    reader.read_exact(&mut payload)?;
    Ok(Some(serde_json::from_slice(&payload)?))
}

#[derive(Debug)]
pub enum IpcError {
    Io(io::Error),
    Json(serde_json::Error),
    FrameTooLarge(usize),
}

impl From<io::Error> for IpcError {
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<serde_json::Error> for IpcError {
    fn from(value: serde_json::Error) -> Self {
        Self::Json(value)
    }
}

impl Display for IpcError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "IPC I/O failed: {error}"),
            Self::Json(error) => write!(formatter, "IPC payload is invalid: {error}"),
            Self::FrameTooLarge(length) => {
                write!(
                    formatter,
                    "IPC frame size {length} exceeds the safety limit"
                )
            }
        }
    }
}

impl Error for IpcError {}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::*;

    #[test]
    fn messages_round_trip_through_length_prefixed_frames() {
        let message = ClientMessage::Ping { nonce: 42 };
        let mut bytes = Vec::new();
        write_message(&mut bytes, &message).unwrap();
        let decoded: ClientMessage = read_message(&mut Cursor::new(bytes)).unwrap().unwrap();
        assert_eq!(decoded, message);
    }

    #[test]
    fn handshake_requires_both_version_and_token() {
        let validator = HandshakeValidator::new("secret-token");
        let accepted = ClientMessage::Hello {
            contract_version: IPC_CONTRACT_VERSION,
            auth_token: "secret-token".into(),
            client_id: "test".into(),
        };
        assert_eq!(validator.validate(&accepted), HandshakeResult::Accepted);

        let wrong_token = ClientMessage::Hello {
            contract_version: IPC_CONTRACT_VERSION,
            auth_token: "wrong".into(),
            client_id: "test".into(),
        };
        assert_eq!(
            validator.validate(&wrong_token),
            HandshakeResult::AuthenticationRejected
        );
    }
}
