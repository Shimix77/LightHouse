//! DMX patch validation and first-fit auto-patching.

use std::collections::BTreeMap;
use std::error::Error;
use std::fmt::{Display, Formatter};

use lighthouse_domain::{FixtureId, UniverseId};

pub const DMX_SLOTS_PER_UNIVERSE: u16 = 512;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PatchAssignment {
    pub fixture_id: FixtureId,
    pub universe_id: UniverseId,
    pub start_address: u16,
    pub footprint: u16,
}

impl PatchAssignment {
    pub fn new(
        fixture_id: FixtureId,
        universe_id: UniverseId,
        start_address: u16,
        footprint: u16,
    ) -> Result<Self, PatchError> {
        if footprint == 0 || footprint > DMX_SLOTS_PER_UNIVERSE {
            return Err(PatchError::InvalidFootprint(footprint));
        }
        if start_address == 0 || start_address > DMX_SLOTS_PER_UNIVERSE {
            return Err(PatchError::InvalidStartAddress(start_address));
        }
        let end_address = start_address + footprint - 1;
        if end_address > DMX_SLOTS_PER_UNIVERSE {
            return Err(PatchError::OutsideUniverse {
                start_address,
                footprint,
            });
        }
        Ok(Self {
            fixture_id,
            universe_id,
            start_address,
            footprint,
        })
    }

    #[must_use]
    pub const fn end_address(self) -> u16 {
        self.start_address + self.footprint - 1
    }

    #[must_use]
    pub fn overlaps(self, other: Self) -> bool {
        self.universe_id == other.universe_id
            && self.start_address <= other.end_address()
            && other.start_address <= self.end_address()
    }
}

#[derive(Clone, Debug, Default)]
pub struct PatchTable {
    assignments: BTreeMap<FixtureId, PatchAssignment>,
}

impl PatchTable {
    #[must_use]
    pub fn get(&self, fixture_id: FixtureId) -> Option<&PatchAssignment> {
        self.assignments.get(&fixture_id)
    }

    pub fn insert(&mut self, assignment: PatchAssignment) -> Result<(), PatchError> {
        if self.assignments.contains_key(&assignment.fixture_id) {
            return Err(PatchError::FixtureAlreadyPatched(assignment.fixture_id));
        }
        if let Some(conflict) = self
            .assignments
            .values()
            .copied()
            .find(|existing| existing.overlaps(assignment))
        {
            return Err(PatchError::AddressConflict {
                requested: assignment,
                existing: conflict,
            });
        }
        self.assignments.insert(assignment.fixture_id, assignment);
        Ok(())
    }

    pub fn remove(&mut self, fixture_id: FixtureId) -> Option<PatchAssignment> {
        self.assignments.remove(&fixture_id)
    }

    pub fn auto_patch(
        &mut self,
        fixture_id: FixtureId,
        footprint: u16,
        candidate_universes: &[UniverseId],
    ) -> Result<PatchAssignment, PatchError> {
        if footprint == 0 || footprint > DMX_SLOTS_PER_UNIVERSE {
            return Err(PatchError::InvalidFootprint(footprint));
        }
        if self.assignments.contains_key(&fixture_id) {
            return Err(PatchError::FixtureAlreadyPatched(fixture_id));
        }

        let last_start = DMX_SLOTS_PER_UNIVERSE - footprint + 1;
        for universe_id in candidate_universes {
            for start_address in 1..=last_start {
                let candidate =
                    PatchAssignment::new(fixture_id, *universe_id, start_address, footprint)?;
                let is_free = self
                    .assignments
                    .values()
                    .copied()
                    .all(|existing| !existing.overlaps(candidate));
                if is_free {
                    self.insert(candidate)?;
                    return Ok(candidate);
                }
            }
        }
        Err(PatchError::NoContiguousSpace { footprint })
    }

    pub fn iter(&self) -> impl Iterator<Item = &PatchAssignment> {
        self.assignments.values()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PatchError {
    InvalidFootprint(u16),
    InvalidStartAddress(u16),
    OutsideUniverse {
        start_address: u16,
        footprint: u16,
    },
    FixtureAlreadyPatched(FixtureId),
    AddressConflict {
        requested: PatchAssignment,
        existing: PatchAssignment,
    },
    NoContiguousSpace {
        footprint: u16,
    },
}

impl Display for PatchError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidFootprint(footprint) => {
                write!(formatter, "invalid DMX footprint {footprint}")
            }
            Self::InvalidStartAddress(address) => {
                write!(formatter, "invalid DMX start address {address}")
            }
            Self::OutsideUniverse {
                start_address,
                footprint,
            } => write!(
                formatter,
                "patch at address {start_address} with footprint {footprint} exceeds 512 slots"
            ),
            Self::FixtureAlreadyPatched(fixture_id) => {
                write!(formatter, "fixture {} is already patched", fixture_id.0)
            }
            Self::AddressConflict {
                requested,
                existing,
            } => write!(
                formatter,
                "fixture {} conflicts with fixture {} in universe {}",
                requested.fixture_id.0, existing.fixture_id.0, requested.universe_id.0
            ),
            Self::NoContiguousSpace { footprint } => {
                write!(formatter, "no contiguous patch space for {footprint} slots")
            }
        }
    }
}

impl Error for PatchError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_address_conflicts() {
        let universe = UniverseId::new(1);
        let mut patch = PatchTable::default();
        patch
            .insert(PatchAssignment::new(FixtureId::new(1), universe, 10, 10).unwrap())
            .unwrap();

        let error = patch
            .insert(PatchAssignment::new(FixtureId::new(2), universe, 19, 2).unwrap())
            .unwrap_err();
        assert!(matches!(error, PatchError::AddressConflict { .. }));
    }

    #[test]
    fn accepts_the_last_slot_in_a_universe() {
        let assignment =
            PatchAssignment::new(FixtureId::new(1), UniverseId::new(1), 512, 1).unwrap();
        assert_eq!(assignment.end_address(), 512);
    }

    #[test]
    fn auto_patch_uses_the_next_available_universe() {
        let mut patch = PatchTable::default();
        patch
            .insert(PatchAssignment::new(FixtureId::new(1), UniverseId::new(10), 1, 512).unwrap())
            .unwrap();

        let assignment = patch
            .auto_patch(
                FixtureId::new(2),
                4,
                &[UniverseId::new(10), UniverseId::new(5000)],
            )
            .unwrap();
        assert_eq!(assignment.universe_id, UniverseId::new(5000));
        assert_eq!(assignment.start_address, 1);
    }
}
