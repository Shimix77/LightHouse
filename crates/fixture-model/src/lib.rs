//! Canonical fixture definition IR used by all library importers and the engine.

use std::collections::BTreeSet;
use std::error::Error;
use std::fmt::{Display, Formatter};

use lighthouse_domain::{NormalizedValue, ParameterId};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ParameterCapability {
    Intensity,
    Color,
    Position,
    Beam,
    Shutter,
    Gobo,
    Custom(String),
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "resolution")]
pub enum DmxBinding {
    EightBit {
        offset: u16,
    },
    SixteenBit {
        coarse_offset: u16,
        fine_offset: u16,
    },
}

impl DmxBinding {
    fn offsets(self) -> [Option<u16>; 2] {
        match self {
            Self::EightBit { offset } => [Some(offset), None],
            Self::SixteenBit {
                coarse_offset,
                fine_offset,
            } => [Some(coarse_offset), Some(fine_offset)],
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParameterDefinition {
    pub id: ParameterId,
    pub name: String,
    pub capability: ParameterCapability,
    pub default_value: NormalizedValue,
    pub binding: DmxBinding,
    pub invert: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixtureMode {
    pub id: String,
    pub name: String,
    pub footprint: u16,
    pub parameters: Vec<ParameterDefinition>,
}

impl FixtureMode {
    pub fn validate(&self) -> Result<(), FixtureModelError> {
        if self.id.trim().is_empty() {
            return Err(FixtureModelError::EmptyModeId);
        }
        if !(1..=512).contains(&self.footprint) {
            return Err(FixtureModelError::InvalidFootprint(self.footprint));
        }

        let mut parameter_ids = BTreeSet::new();
        let mut occupied_offsets = BTreeSet::new();
        for parameter in &self.parameters {
            if !parameter_ids.insert(parameter.id.clone()) {
                return Err(FixtureModelError::DuplicateParameter(parameter.id.clone()));
            }
            for offset in parameter.binding.offsets().into_iter().flatten() {
                if offset >= self.footprint {
                    return Err(FixtureModelError::OffsetOutsideFootprint {
                        parameter: parameter.id.clone(),
                        offset,
                        footprint: self.footprint,
                    });
                }
                if !occupied_offsets.insert(offset) {
                    return Err(FixtureModelError::DuplicateDmxOffset(offset));
                }
            }
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixtureDefinition {
    pub id: String,
    pub revision: String,
    pub manufacturer: String,
    pub model: String,
    pub modes: Vec<FixtureMode>,
}

impl FixtureDefinition {
    pub fn validate(&self) -> Result<(), FixtureModelError> {
        if self.id.trim().is_empty() {
            return Err(FixtureModelError::EmptyDefinitionId);
        }
        if self.modes.is_empty() {
            return Err(FixtureModelError::MissingModes);
        }

        let mut mode_ids = BTreeSet::new();
        for mode in &self.modes {
            if !mode_ids.insert(mode.id.clone()) {
                return Err(FixtureModelError::DuplicateMode(mode.id.clone()));
            }
            mode.validate()?;
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum FixtureModelError {
    EmptyDefinitionId,
    EmptyModeId,
    MissingModes,
    InvalidFootprint(u16),
    DuplicateMode(String),
    DuplicateParameter(ParameterId),
    DuplicateDmxOffset(u16),
    OffsetOutsideFootprint {
        parameter: ParameterId,
        offset: u16,
        footprint: u16,
    },
}

impl Display for FixtureModelError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmptyDefinitionId => formatter.write_str("fixture definition id is empty"),
            Self::EmptyModeId => formatter.write_str("fixture mode id is empty"),
            Self::MissingModes => formatter.write_str("fixture definition has no modes"),
            Self::InvalidFootprint(footprint) => {
                write!(
                    formatter,
                    "fixture footprint {footprint} must be between 1 and 512"
                )
            }
            Self::DuplicateMode(mode) => write!(formatter, "duplicate fixture mode {mode}"),
            Self::DuplicateParameter(parameter) => {
                write!(formatter, "duplicate parameter {}", parameter.as_str())
            }
            Self::DuplicateDmxOffset(offset) => write!(formatter, "duplicate DMX offset {offset}"),
            Self::OffsetOutsideFootprint {
                parameter,
                offset,
                footprint,
            } => write!(
                formatter,
                "parameter {} uses offset {offset} outside footprint {footprint}",
                parameter.as_str()
            ),
        }
    }
}

impl Error for FixtureModelError {}

#[cfg(test)]
mod tests {
    use super::*;

    fn intensity(offset: u16) -> ParameterDefinition {
        ParameterDefinition {
            id: ParameterId::from("intensity"),
            name: "Intensity".into(),
            capability: ParameterCapability::Intensity,
            default_value: NormalizedValue::ZERO,
            binding: DmxBinding::EightBit { offset },
            invert: false,
        }
    }

    #[test]
    fn validates_a_basic_mode() {
        let mode = FixtureMode {
            id: "basic".into(),
            name: "Basic".into(),
            footprint: 1,
            parameters: vec![intensity(0)],
        };
        assert_eq!(mode.validate(), Ok(()));
    }

    #[test]
    fn rejects_offsets_outside_the_footprint() {
        let mode = FixtureMode {
            id: "bad".into(),
            name: "Bad".into(),
            footprint: 1,
            parameters: vec![intensity(1)],
        };
        assert!(matches!(
            mode.validate(),
            Err(FixtureModelError::OffsetOutsideFootprint { offset: 1, .. })
        ));
    }
}
