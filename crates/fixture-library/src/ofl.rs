use std::collections::{BTreeMap, BTreeSet};

use lighthouse_domain::{NormalizedValue, ParameterId};
use lighthouse_fixture_model::{
    DmxBinding, FixtureDefinition, FixtureMode, ParameterCapability, ParameterDefinition,
};
use serde_json::{Map, Value};

use crate::FixtureLibraryError;

pub fn import_ofl_fixture(
    manufacturer_key: &str,
    fixture_key: &str,
    manufacturer_name: &str,
    json: &str,
) -> Result<FixtureDefinition, FixtureLibraryError> {
    let root: Value = serde_json::from_str(json)?;
    let object = root
        .as_object()
        .ok_or_else(|| unsupported("root must be an object"))?;
    let model = string(object, "name")?;
    let channels = object
        .get("availableChannels")
        .and_then(Value::as_object)
        .ok_or_else(|| unsupported("availableChannels is missing"))?;
    let source_modes = object
        .get("modes")
        .and_then(Value::as_array)
        .ok_or_else(|| unsupported("modes are missing"))?;
    let revision = object
        .get("meta")
        .and_then(Value::as_object)
        .and_then(|meta| meta.get("lastModifyDate"))
        .and_then(Value::as_str)
        .unwrap_or("ofl-snapshot")
        .to_owned();

    let mut modes = Vec::new();
    let mut mode_ids = BTreeSet::new();
    for (index, source_mode) in source_modes.iter().enumerate() {
        let Some(mode) = import_mode(source_mode, channels, index, &mut mode_ids) else {
            continue;
        };
        modes.push(mode);
    }
    if modes.is_empty() {
        return Err(unsupported(
            "no directly addressable mode could be imported",
        ));
    }
    let definition = FixtureDefinition {
        id: format!("ofl.{}.{}", slug(manufacturer_key), slug(fixture_key)),
        revision,
        manufacturer: manufacturer_name.to_owned(),
        model: model.to_owned(),
        modes,
    };
    definition.validate()?;
    Ok(definition)
}

fn import_mode(
    source: &Value,
    available: &Map<String, Value>,
    index: usize,
    mode_ids: &mut BTreeSet<String>,
) -> Option<FixtureMode> {
    let source = source.as_object()?;
    let mode_channels = source.get("channels")?.as_array()?;
    if mode_channels.is_empty() || mode_channels.len() > 512 {
        return None;
    }
    if mode_channels
        .iter()
        .any(|channel| !channel.is_null() && !channel.is_string())
    {
        return None;
    }
    let positions: BTreeMap<&str, u16> = mode_channels
        .iter()
        .enumerate()
        .filter_map(|(offset, channel)| {
            let channel = channel.as_str()?;
            Some((channel, u16::try_from(offset).ok()?))
        })
        .collect();
    let fine_aliases: BTreeSet<&str> = available
        .values()
        .filter_map(Value::as_object)
        .filter_map(|channel| channel.get("fineChannelAliases"))
        .filter_map(Value::as_array)
        .flatten()
        .filter_map(Value::as_str)
        .collect();
    let mut parameter_ids = BTreeSet::new();
    let mut parameters = Vec::new();
    for channel_key in mode_channels.iter().filter_map(Value::as_str) {
        if fine_aliases.contains(channel_key) {
            continue;
        }
        let Some(channel) = available.get(channel_key).and_then(Value::as_object) else {
            continue;
        };
        let coarse_offset = *positions.get(channel_key)?;
        let first_fine = channel
            .get("fineChannelAliases")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .find_map(|alias| positions.get(alias).copied());
        let (base_id, capability) = parameter_identity(channel_key, channel);
        let parameter_id = unique_parameter_id(base_id, channel_key, &mut parameter_ids);
        let default_value = normalized_default(channel, first_fine.is_some());
        parameters.push(ParameterDefinition {
            id: ParameterId::new(parameter_id),
            name: channel_key.to_owned(),
            capability,
            default_value,
            binding: first_fine.map_or(
                DmxBinding::EightBit {
                    offset: coarse_offset,
                },
                |fine_offset| DmxBinding::SixteenBit {
                    coarse_offset,
                    fine_offset,
                },
            ),
            invert: is_inverted(channel),
        });
    }
    if parameters.is_empty() {
        return None;
    }
    let name = source
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("Imported mode")
        .to_owned();
    let base_mode_id = source
        .get("shortName")
        .and_then(Value::as_str)
        .map(slug)
        .filter(|id| !id.is_empty())
        .unwrap_or_else(|| slug(&name));
    let mut mode_id = base_mode_id;
    if !mode_ids.insert(mode_id.clone()) {
        mode_id = format!("{mode_id}-{}", index + 1);
        mode_ids.insert(mode_id.clone());
    }
    Some(FixtureMode {
        id: mode_id,
        name,
        footprint: u16::try_from(mode_channels.len()).ok()?,
        parameters,
    })
}

fn parameter_identity(
    channel_key: &str,
    channel: &Map<String, Value>,
) -> (String, ParameterCapability) {
    let capability = primary_capability(channel);
    let capability_type = capability
        .and_then(|value| value.get("type"))
        .and_then(Value::as_str)
        .unwrap_or("Custom");
    match capability_type {
        "Intensity" => ("intensity".into(), ParameterCapability::Intensity),
        "ColorIntensity" => {
            let color = capability
                .and_then(|value| value.get("color"))
                .and_then(Value::as_str)
                .unwrap_or(channel_key);
            (format!("color.{}", slug(color)), ParameterCapability::Color)
        }
        "ColorPreset" | "ColorTemperature" => (
            format!("color.{}", slug(channel_key)),
            ParameterCapability::Color,
        ),
        "Pan" | "PanContinuous" => ("position.pan".into(), ParameterCapability::Position),
        "Tilt" | "TiltContinuous" => ("position.tilt".into(), ParameterCapability::Position),
        "Zoom" | "BeamAngle" => ("beam.zoom".into(), ParameterCapability::Beam),
        "Focus" => ("beam.focus".into(), ParameterCapability::Beam),
        "Iris" => ("beam.iris".into(), ParameterCapability::Beam),
        "Frost" => ("beam.frost".into(), ParameterCapability::Beam),
        value if value.starts_with("Shutter") || value.contains("Strobe") => {
            ("shutter".into(), ParameterCapability::Shutter)
        }
        "WheelSlot" | "WheelRotation" | "WheelShake" => {
            let lower = channel_key.to_ascii_lowercase();
            if lower.contains("gobo") {
                ("gobo.wheel".into(), ParameterCapability::Gobo)
            } else if lower.contains("color") || lower.contains("colour") {
                ("color.wheel".into(), ParameterCapability::Color)
            } else {
                (
                    format!("beam.{}", slug(channel_key)),
                    ParameterCapability::Beam,
                )
            }
        }
        value => (
            format!("custom.{}", slug(channel_key)),
            ParameterCapability::Custom(value.to_owned()),
        ),
    }
}

fn primary_capability(channel: &Map<String, Value>) -> Option<&Map<String, Value>> {
    channel
        .get("capability")
        .and_then(Value::as_object)
        .or_else(|| {
            let capabilities = channel.get("capabilities")?.as_array()?;
            capabilities
                .iter()
                .filter_map(Value::as_object)
                .find(|capability| {
                    capability.get("type").and_then(Value::as_str) != Some("NoFunction")
                })
                .or_else(|| capabilities.first().and_then(Value::as_object))
        })
}

fn unique_parameter_id(base: String, channel_key: &str, used: &mut BTreeSet<String>) -> String {
    if used.insert(base.clone()) {
        return base;
    }
    let suffix = slug(channel_key);
    let mut candidate = format!("{base}.{suffix}");
    let mut index = 2;
    while !used.insert(candidate.clone()) {
        candidate = format!("{base}.{suffix}-{index}");
        index += 1;
    }
    candidate
}

fn normalized_default(channel: &Map<String, Value>, sixteen_bit_binding: bool) -> NormalizedValue {
    let raw = channel.get("defaultValue").and_then(|value| match value {
        Value::Number(number) => number.as_f64(),
        Value::String(value) if value.ends_with('%') => value
            .trim_end_matches('%')
            .parse::<f64>()
            .ok()
            .map(|value| value * 2.55),
        _ => None,
    });
    let resolution = channel
        .get("dmxValueResolution")
        .and_then(Value::as_str)
        .unwrap_or(if sixteen_bit_binding { "16bit" } else { "8bit" });
    let maximum = match resolution {
        "16bit" => 65_535.0,
        "24bit" => 16_777_215.0,
        "32bit" => 4_294_967_295.0,
        _ => 255.0,
    };
    NormalizedValue::clamped(raw.unwrap_or(0.0) / maximum)
}

fn is_inverted(channel: &Map<String, Value>) -> bool {
    let Some(capability) = primary_capability(channel) else {
        return false;
    };
    let start = capability
        .iter()
        .find(|(key, _)| {
            key.ends_with("Start") && (key.starts_with("angle") || key.starts_with("percent"))
        })
        .and_then(|(_, value)| scalar(value));
    let end = capability
        .iter()
        .find(|(key, _)| {
            key.ends_with("End") && (key.starts_with("angle") || key.starts_with("percent"))
        })
        .and_then(|(_, value)| scalar(value));
    matches!((start, end), (Some(start), Some(end)) if start > end)
}

fn scalar(value: &Value) -> Option<f64> {
    value.as_f64().or_else(|| {
        let text = value.as_str()?;
        let number: String = text
            .chars()
            .take_while(|character| character.is_ascii_digit() || matches!(character, '-' | '.'))
            .collect();
        number.parse().ok()
    })
}

fn string<'a>(object: &'a Map<String, Value>, key: &str) -> Result<&'a str, FixtureLibraryError> {
    object
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| unsupported(format!("{key} is missing")))
}

fn slug(value: &str) -> String {
    let mut slug = String::new();
    let mut separator = false;
    for character in value.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            if separator && !slug.is_empty() {
                slug.push('-');
            }
            separator = false;
            slug.push(character);
        } else {
            separator = true;
        }
    }
    slug
}

fn unsupported(message: impl Into<String>) -> FixtureLibraryError {
    FixtureLibraryError::UnsupportedOfl(message.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_logical_color_and_sixteen_bit_position() {
        let json = r#"{
          "name":"Test Head",
          "meta":{"lastModifyDate":"2026-01-02"},
          "availableChannels":{
            "Dimmer":{"capability":{"type":"Intensity"}},
            "Red":{"capability":{"type":"ColorIntensity","color":"Red"}},
            "Pan":{"fineChannelAliases":["Pan fine"],"defaultValue":32768,"capability":{"type":"Pan","angleStart":"0deg","angleEnd":"540deg"}}
          },
          "modes":[{"name":"Fine","shortName":"4ch","channels":["Dimmer","Red","Pan","Pan fine"]}]
        }"#;
        let definition = import_ofl_fixture("maker", "head", "Maker", json).unwrap();
        let mode = &definition.modes[0];
        assert_eq!(mode.footprint, 4);
        assert_eq!(mode.parameters[0].id.as_str(), "intensity");
        assert_eq!(mode.parameters[1].id.as_str(), "color.red");
        assert!(matches!(
            mode.parameters[2].binding,
            DmxBinding::SixteenBit {
                coarse_offset: 2,
                fine_offset: 3
            }
        ));
        assert!((mode.parameters[2].default_value.get() - 0.5).abs() < 0.001);
    }

    #[test]
    fn skips_matrix_modes_but_keeps_direct_modes() {
        let json = r#"{
          "name":"Hybrid",
          "availableChannels":{"Dimmer":{"capability":{"type":"Intensity"}}},
          "modes":[
            {"name":"Matrix","channels":[{"insert":"matrixChannels"}]},
            {"name":"Basic","channels":["Dimmer"]}
          ]
        }"#;
        let definition = import_ofl_fixture("maker", "hybrid", "Maker", json).unwrap();
        assert_eq!(definition.modes.len(), 1);
        assert_eq!(definition.modes[0].name, "Basic");
    }
}
