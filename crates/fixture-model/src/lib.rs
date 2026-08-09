//! Canonical fixture definition IR used by all library importers and the engine.

use std::collections::BTreeSet;
use std::error::Error;
use std::fmt::{Display, Formatter};

use lighthouse_domain::{NormalizedValue, ParameterId};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FixtureType {
    MovingHead,
    Par,
    Spotlight,
    Blinder,
    Strobe,
    LedBar,
    Bulb,
    Fog,
    #[default]
    Other,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BeamKind {
    Beam,
    Spot,
    Wash,
    #[default]
    None,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixtureProfileMetadata {
    #[serde(default)]
    pub fixture_type: FixtureType,
    #[serde(default = "default_fixture_icon")]
    pub icon: String,
    #[serde(default)]
    pub beam_kind: BeamKind,
    #[serde(default)]
    pub beam_angle_min_degrees: Option<f64>,
    #[serde(default)]
    pub beam_angle_max_degrees: Option<f64>,
    #[serde(default)]
    pub virtual_color: bool,
}

impl Default for FixtureProfileMetadata {
    fn default() -> Self {
        Self {
            fixture_type: FixtureType::Other,
            icon: default_fixture_icon(),
            beam_kind: BeamKind::None,
            beam_angle_min_degrees: None,
            beam_angle_max_degrees: None,
            virtual_color: false,
        }
    }
}

fn default_fixture_icon() -> String {
    "fixture".into()
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DmxRangeDefinition {
    pub start: u8,
    pub end: u8,
    pub label: String,
    pub semantic_min: f64,
    pub semantic_max: f64,
    pub unit: String,
    #[serde(default)]
    pub hazardous: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DmxChannelDefinition {
    pub offset: u16,
    pub name: String,
    pub property: String,
    #[serde(default)]
    pub parameter_id: Option<ParameterId>,
    pub capability: ParameterCapability,
    pub ranges: Vec<DmxRangeDefinition>,
    #[serde(default)]
    pub pixel: Option<u16>,
    #[serde(default)]
    pub hazardous: bool,
}

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
    #[serde(default)]
    pub channels: Vec<DmxChannelDefinition>,
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
        if !self.channels.is_empty() {
            if self.channels.len() != usize::from(self.footprint) {
                return Err(FixtureModelError::IncompleteChannelMetadata {
                    channels: self.channels.len(),
                    footprint: self.footprint,
                });
            }
            let mut channel_offsets = BTreeSet::new();
            for channel in &self.channels {
                if channel.offset >= self.footprint {
                    return Err(FixtureModelError::ChannelOutsideFootprint {
                        offset: channel.offset,
                        footprint: self.footprint,
                    });
                }
                if !channel_offsets.insert(channel.offset) {
                    return Err(FixtureModelError::DuplicateChannelMetadata(channel.offset));
                }
                if channel.name.trim().is_empty() || channel.property.trim().is_empty() {
                    return Err(FixtureModelError::EmptyChannelMetadata(channel.offset));
                }
                validate_ranges(channel.offset, &channel.ranges)?;
            }
        }
        Ok(())
    }
}

fn validate_ranges(offset: u16, ranges: &[DmxRangeDefinition]) -> Result<(), FixtureModelError> {
    if ranges.is_empty() {
        return Err(FixtureModelError::IncompleteDmxRanges(offset));
    }
    let mut next = 0_u16;
    for range in ranges {
        if u16::from(range.start) != next || range.start > range.end {
            return Err(FixtureModelError::IncompleteDmxRanges(offset));
        }
        if range.label.trim().is_empty()
            || !range.semantic_min.is_finite()
            || !range.semantic_max.is_finite()
        {
            return Err(FixtureModelError::InvalidDmxRange(offset));
        }
        next = u16::from(range.end) + 1;
    }
    if next != 256 {
        return Err(FixtureModelError::IncompleteDmxRanges(offset));
    }
    Ok(())
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixtureDefinition {
    pub id: String,
    pub revision: String,
    pub manufacturer: String,
    pub model: String,
    #[serde(default)]
    pub metadata: FixtureProfileMetadata,
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
        if self.metadata.icon.trim().is_empty() {
            return Err(FixtureModelError::EmptyFixtureIcon);
        }
        match (
            self.metadata.beam_angle_min_degrees,
            self.metadata.beam_angle_max_degrees,
        ) {
            (Some(minimum), Some(maximum))
                if minimum.is_finite()
                    && maximum.is_finite()
                    && minimum > 0.0
                    && maximum <= 180.0
                    && minimum <= maximum => {}
            (None, None) => {}
            _ => return Err(FixtureModelError::InvalidBeamAngles),
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
    IncompleteChannelMetadata {
        channels: usize,
        footprint: u16,
    },
    ChannelOutsideFootprint {
        offset: u16,
        footprint: u16,
    },
    DuplicateChannelMetadata(u16),
    EmptyChannelMetadata(u16),
    IncompleteDmxRanges(u16),
    InvalidDmxRange(u16),
    EmptyFixtureIcon,
    InvalidBeamAngles,
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
            Self::IncompleteChannelMetadata {
                channels,
                footprint,
            } => write!(
                formatter,
                "fixture mode has {channels} channel descriptions for a {footprint}-channel footprint"
            ),
            Self::ChannelOutsideFootprint { offset, footprint } => write!(
                formatter,
                "channel metadata offset {offset} is outside footprint {footprint}"
            ),
            Self::DuplicateChannelMetadata(offset) => {
                write!(formatter, "duplicate channel metadata at offset {offset}")
            }
            Self::EmptyChannelMetadata(offset) => {
                write!(
                    formatter,
                    "channel {} needs a name and property",
                    offset + 1
                )
            }
            Self::IncompleteDmxRanges(offset) => write!(
                formatter,
                "channel {} ranges must cover 0 through 255 without gaps or overlaps",
                offset + 1
            ),
            Self::InvalidDmxRange(offset) => {
                write!(formatter, "channel {} has an invalid DMX range", offset + 1)
            }
            Self::EmptyFixtureIcon => formatter.write_str("fixture icon is empty"),
            Self::InvalidBeamAngles => formatter.write_str(
                "beam angles must both be set between 0 and 180 degrees, from narrow to wide",
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
            channels: Vec::new(),
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
            channels: Vec::new(),
        };
        assert!(matches!(
            mode.validate(),
            Err(FixtureModelError::OffsetOutsideFootprint { offset: 1, .. })
        ));
    }

    #[test]
    fn accepts_complete_channel_ranges_and_rejects_gaps() {
        let channel = |ranges: Vec<DmxRangeDefinition>| DmxChannelDefinition {
            offset: 0,
            name: "Shutter".into(),
            property: "shutter".into(),
            parameter_id: Some(ParameterId::from("shutter")),
            capability: ParameterCapability::Shutter,
            ranges,
            pixel: None,
            hazardous: true,
        };
        let range = |start, end, label: &str| DmxRangeDefinition {
            start,
            end,
            label: label.into(),
            semantic_min: f64::from(start),
            semantic_max: f64::from(end),
            unit: "raw".into(),
            hazardous: label == "Open",
        };
        let valid = FixtureMode {
            id: "ranges".into(),
            name: "Ranges".into(),
            footprint: 1,
            parameters: vec![ParameterDefinition {
                id: ParameterId::from("shutter"),
                name: "Shutter".into(),
                capability: ParameterCapability::Shutter,
                default_value: NormalizedValue::ZERO,
                binding: DmxBinding::EightBit { offset: 0 },
                invert: false,
            }],
            channels: vec![channel(vec![
                range(0, 31, "Closed"),
                range(32, 255, "Open"),
            ])],
        };
        assert_eq!(valid.validate(), Ok(()));

        let mut invalid = valid;
        invalid.channels[0].ranges = vec![range(0, 31, "Closed"), range(33, 255, "Open")];
        assert!(matches!(
            invalid.validate(),
            Err(FixtureModelError::IncompleteDmxRanges(0))
        ));
    }
}
