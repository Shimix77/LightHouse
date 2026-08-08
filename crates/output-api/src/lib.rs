//! Protocol-independent DMX frames and output adapter contract.

use std::collections::BTreeMap;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::io;
use std::sync::{Arc, Mutex};

use lighthouse_domain::{NormalizedValue, UniverseId};

pub const DMX_SLOT_COUNT: usize = 512;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DmxFrame {
    pub universe_id: UniverseId,
    slots: [u8; DMX_SLOT_COUNT],
    intensity_mask: [bool; DMX_SLOT_COUNT],
}

impl DmxFrame {
    #[must_use]
    pub const fn new(universe_id: UniverseId) -> Self {
        Self {
            universe_id,
            slots: [0; DMX_SLOT_COUNT],
            intensity_mask: [false; DMX_SLOT_COUNT],
        }
    }

    pub fn set_slot(
        &mut self,
        address: u16,
        value: u8,
        is_intensity: bool,
    ) -> Result<(), FrameError> {
        let index = address
            .checked_sub(1)
            .map(usize::from)
            .filter(|index| *index < DMX_SLOT_COUNT)
            .ok_or(FrameError::InvalidAddress(address))?;
        self.slots[index] = value;
        self.intensity_mask[index] = is_intensity;
        Ok(())
    }

    #[must_use]
    pub const fn slots(&self) -> &[u8; DMX_SLOT_COUNT] {
        &self.slots
    }

    #[must_use]
    pub fn slot(&self, address: u16) -> Option<u8> {
        address
            .checked_sub(1)
            .map(usize::from)
            .filter(|index| *index < DMX_SLOT_COUNT)
            .map(|index| self.slots[index])
    }

    pub fn apply_blackout(&mut self) {
        for (slot, is_intensity) in self.slots.iter_mut().zip(self.intensity_mask) {
            if is_intensity {
                *slot = 0;
            }
        }
    }

    pub fn apply_intensity_scale(&mut self, scale: NormalizedValue) {
        for (slot, is_intensity) in self.slots.iter_mut().zip(self.intensity_mask) {
            if is_intensity {
                *slot = (f64::from(*slot) * scale.get()).round() as u8;
            }
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct FrameSet {
    frames: BTreeMap<UniverseId, DmxFrame>,
}

impl FrameSet {
    pub fn frame_mut(&mut self, universe_id: UniverseId) -> &mut DmxFrame {
        self.frames
            .entry(universe_id)
            .or_insert_with(|| DmxFrame::new(universe_id))
    }

    #[must_use]
    pub fn frame(&self, universe_id: UniverseId) -> Option<&DmxFrame> {
        self.frames.get(&universe_id)
    }

    pub fn iter(&self) -> impl Iterator<Item = &DmxFrame> {
        self.frames.values()
    }

    #[must_use]
    pub fn blackout_copy(&self) -> Self {
        let mut copy = self.clone();
        for frame in copy.frames.values_mut() {
            frame.apply_blackout();
        }
        copy
    }

    #[must_use]
    pub fn intensity_scaled_copy(&self, scale: NormalizedValue) -> Self {
        let mut copy = self.clone();
        for frame in copy.frames.values_mut() {
            frame.apply_intensity_scale(scale);
        }
        copy
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.frames.is_empty()
    }
}

/// Output implementations must avoid unbounded waits. Network adapters should use non-blocking I/O.
pub trait OutputAdapter: Send + 'static {
    fn send(&mut self, frames: &FrameSet) -> io::Result<()>;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FrameError {
    InvalidAddress(u16),
}

impl Display for FrameError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidAddress(address) => write!(formatter, "invalid DMX address {address}"),
        }
    }
}

impl Error for FrameError {}

#[derive(Clone, Debug, Default)]
pub struct VirtualDmxHandle {
    state: Arc<Mutex<VirtualDmxState>>,
}

impl VirtualDmxHandle {
    #[must_use]
    pub fn snapshot(&self) -> VirtualDmxSnapshot {
        let state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        VirtualDmxSnapshot {
            last_frames: state.last_frames.clone(),
            send_count: state.send_count,
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct VirtualDmxSnapshot {
    pub last_frames: Option<FrameSet>,
    pub send_count: u64,
}

#[derive(Debug, Default)]
struct VirtualDmxState {
    last_frames: Option<FrameSet>,
    send_count: u64,
}

#[derive(Debug, Default)]
pub struct VirtualDmxOutput {
    state: Arc<Mutex<VirtualDmxState>>,
}

impl VirtualDmxOutput {
    #[must_use]
    pub fn new() -> (Self, VirtualDmxHandle) {
        let state = Arc::new(Mutex::new(VirtualDmxState::default()));
        (
            Self {
                state: Arc::clone(&state),
            },
            VirtualDmxHandle { state },
        )
    }
}

impl OutputAdapter for VirtualDmxOutput {
    fn send(&mut self, frames: &FrameSet) -> io::Result<()> {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        state.last_frames = Some(frames.clone());
        state.send_count += 1;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blackout_only_changes_intensity_channels() {
        let mut frames = FrameSet::default();
        let frame = frames.frame_mut(UniverseId::new(1));
        frame.set_slot(1, 255, true).unwrap();
        frame.set_slot(2, 120, false).unwrap();

        let blacked_out = frames.blackout_copy();
        assert_eq!(
            blacked_out.frame(UniverseId::new(1)).unwrap().slot(1),
            Some(0)
        );
        assert_eq!(
            blacked_out.frame(UniverseId::new(1)).unwrap().slot(2),
            Some(120)
        );
    }

    #[test]
    fn grand_master_scales_only_intensity_channels() {
        let mut frames = FrameSet::default();
        let frame = frames.frame_mut(UniverseId::new(1));
        frame.set_slot(1, 200, true).unwrap();
        frame.set_slot(2, 200, false).unwrap();

        let scaled = frames.intensity_scaled_copy(NormalizedValue::new(0.5).unwrap());
        assert_eq!(scaled.frame(UniverseId::new(1)).unwrap().slot(1), Some(100));
        assert_eq!(scaled.frame(UniverseId::new(1)).unwrap().slot(2), Some(200));
    }
}
