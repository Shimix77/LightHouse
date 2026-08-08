//! Translation from logical fixture parameters to protocol-independent DMX frames.

use std::collections::BTreeMap;
use std::error::Error;
use std::fmt::{Display, Formatter};

use lighthouse_domain::{FixtureId, NormalizedValue, ParameterId};
use lighthouse_fixture_model::{DmxBinding, FixtureMode, ParameterCapability};
use lighthouse_output_api::{FrameError, FrameSet};
use lighthouse_patch::PatchAssignment;

pub struct FixtureRenderState<'a> {
    pub fixture_id: FixtureId,
    pub mode: &'a FixtureMode,
    pub patch: &'a PatchAssignment,
    pub values: &'a BTreeMap<ParameterId, NormalizedValue>,
}

pub fn resolve(states: &[FixtureRenderState<'_>]) -> Result<FrameSet, ResolverError> {
    let mut output = FrameSet::default();
    for state in states {
        resolve_fixture(&mut output, state)?;
    }
    Ok(output)
}

pub fn resolve_fixture(
    output: &mut FrameSet,
    state: &FixtureRenderState<'_>,
) -> Result<(), ResolverError> {
    if state.fixture_id != state.patch.fixture_id {
        return Err(ResolverError::PatchFixtureMismatch {
            fixture: state.fixture_id,
            patch_fixture: state.patch.fixture_id,
        });
    }
    if state.mode.footprint != state.patch.footprint {
        return Err(ResolverError::FootprintMismatch {
            mode: state.mode.footprint,
            patch: state.patch.footprint,
        });
    }

    let frame = output.frame_mut(state.patch.universe_id);
    for parameter in &state.mode.parameters {
        let mut value = state
            .values
            .get(&parameter.id)
            .copied()
            .unwrap_or(parameter.default_value);
        if parameter.invert {
            value = value.inverted();
        }
        let is_intensity = parameter.capability == ParameterCapability::Intensity;

        match parameter.binding {
            DmxBinding::EightBit { offset } => {
                let address = state.patch.start_address + offset;
                frame.set_slot(address, to_u8(value), is_intensity)?;
            }
            DmxBinding::SixteenBit {
                coarse_offset,
                fine_offset,
            } => {
                let raw = to_u16(value);
                let [coarse, fine] = raw.to_be_bytes();
                frame.set_slot(
                    state.patch.start_address + coarse_offset,
                    coarse,
                    is_intensity,
                )?;
                frame.set_slot(state.patch.start_address + fine_offset, fine, is_intensity)?;
            }
        }
    }
    Ok(())
}

#[must_use]
pub fn to_u8(value: NormalizedValue) -> u8 {
    (value.get() * f64::from(u8::MAX)).round() as u8
}

#[must_use]
pub fn to_u16(value: NormalizedValue) -> u16 {
    (value.get() * f64::from(u16::MAX)).round() as u16
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ResolverError {
    PatchFixtureMismatch {
        fixture: FixtureId,
        patch_fixture: FixtureId,
    },
    FootprintMismatch {
        mode: u16,
        patch: u16,
    },
    Frame(FrameError),
}

impl From<FrameError> for ResolverError {
    fn from(value: FrameError) -> Self {
        Self::Frame(value)
    }
}

impl Display for ResolverError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PatchFixtureMismatch {
                fixture,
                patch_fixture,
            } => write!(
                formatter,
                "fixture {} does not match patch fixture {}",
                fixture.0, patch_fixture.0
            ),
            Self::FootprintMismatch { mode, patch } => {
                write!(
                    formatter,
                    "mode footprint {mode} does not match patch footprint {patch}"
                )
            }
            Self::Frame(error) => Display::fmt(error, formatter),
        }
    }
}

impl Error for ResolverError {}

#[cfg(test)]
mod tests {
    use super::*;
    use lighthouse_domain::UniverseId;
    use lighthouse_fixture_model::{DmxBinding, ParameterDefinition};

    fn parameter(
        id: &str,
        binding: DmxBinding,
        capability: ParameterCapability,
        invert: bool,
    ) -> ParameterDefinition {
        ParameterDefinition {
            id: ParameterId::from(id),
            name: id.into(),
            capability,
            default_value: NormalizedValue::ZERO,
            binding,
            invert,
        }
    }

    #[test]
    fn resolves_eight_and_sixteen_bit_parameters() {
        let fixture_id = FixtureId::new(1);
        let mode = FixtureMode {
            id: "mode".into(),
            name: "Mode".into(),
            footprint: 3,
            parameters: vec![
                parameter(
                    "intensity",
                    DmxBinding::EightBit { offset: 0 },
                    ParameterCapability::Intensity,
                    false,
                ),
                parameter(
                    "pan",
                    DmxBinding::SixteenBit {
                        coarse_offset: 1,
                        fine_offset: 2,
                    },
                    ParameterCapability::Position,
                    false,
                ),
            ],
        };
        let patch = PatchAssignment::new(fixture_id, UniverseId::new(7), 100, 3).unwrap();
        let values = BTreeMap::from([
            (ParameterId::from("intensity"), NormalizedValue::FULL),
            (ParameterId::from("pan"), NormalizedValue::new(0.5).unwrap()),
        ]);

        let frames = resolve(&[FixtureRenderState {
            fixture_id,
            mode: &mode,
            patch: &patch,
            values: &values,
        }])
        .unwrap();
        let frame = frames.frame(UniverseId::new(7)).unwrap();
        assert_eq!(frame.slot(100), Some(255));
        assert_eq!(frame.slot(101), Some(128));
        assert_eq!(frame.slot(102), Some(0));
    }

    #[test]
    fn applies_axis_inversion_before_dmx_conversion() {
        let fixture_id = FixtureId::new(1);
        let mode = FixtureMode {
            id: "mode".into(),
            name: "Mode".into(),
            footprint: 1,
            parameters: vec![parameter(
                "tilt",
                DmxBinding::EightBit { offset: 0 },
                ParameterCapability::Position,
                true,
            )],
        };
        let patch = PatchAssignment::new(fixture_id, UniverseId::new(1), 1, 1).unwrap();
        let values = BTreeMap::from([(
            ParameterId::from("tilt"),
            NormalizedValue::new(0.25).unwrap(),
        )]);

        let frames = resolve(&[FixtureRenderState {
            fixture_id,
            mode: &mode,
            patch: &patch,
            values: &values,
        }])
        .unwrap();
        assert_eq!(frames.frame(UniverseId::new(1)).unwrap().slot(1), Some(191));
    }

    #[test]
    fn blackout_preserves_non_intensity_parameters() {
        let fixture_id = FixtureId::new(1);
        let mode = FixtureMode {
            id: "mode".into(),
            name: "Mode".into(),
            footprint: 2,
            parameters: vec![
                parameter(
                    "intensity",
                    DmxBinding::EightBit { offset: 0 },
                    ParameterCapability::Intensity,
                    false,
                ),
                parameter(
                    "red",
                    DmxBinding::EightBit { offset: 1 },
                    ParameterCapability::Color,
                    false,
                ),
            ],
        };
        let patch = PatchAssignment::new(fixture_id, UniverseId::new(1), 1, 2).unwrap();
        let values = BTreeMap::from([
            (ParameterId::from("intensity"), NormalizedValue::FULL),
            (ParameterId::from("red"), NormalizedValue::FULL),
        ]);
        let frames = resolve(&[FixtureRenderState {
            fixture_id,
            mode: &mode,
            patch: &patch,
            values: &values,
        }])
        .unwrap()
        .blackout_copy();

        let frame = frames.frame(UniverseId::new(1)).unwrap();
        assert_eq!(frame.slot(1), Some(0));
        assert_eq!(frame.slot(2), Some(255));
    }
}
