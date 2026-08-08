//! Stable identifiers and logical values shared by the headless engine.

use std::error::Error;
use std::fmt::{Display, Formatter};

use serde::{Deserialize, Serialize};

macro_rules! typed_id {
    ($name:ident) => {
        #[derive(
            Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize,
        )]
        #[serde(transparent)]
        pub struct $name(pub u128);

        impl $name {
            #[must_use]
            pub const fn new(value: u128) -> Self {
                Self(value)
            }
        }
    };
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(transparent)]
pub struct FixtureId(pub u128);

impl FixtureId {
    #[must_use]
    pub const fn new(value: u128) -> Self {
        Self(value)
    }
}

typed_id!(ProjectId);
typed_id!(SceneId);
typed_id!(CueListId);
typed_id!(EffectId);
typed_id!(GroupId);
typed_id!(LayoutObjectId);

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(transparent)]
pub struct UniverseId(pub u32);

impl UniverseId {
    #[must_use]
    pub const fn new(value: u32) -> Self {
        Self(value)
    }
}

#[derive(Clone, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(transparent)]
pub struct ParameterId(String);

impl ParameterId {
    #[must_use]
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<&str> for ParameterId {
    fn from(value: &str) -> Self {
        Self::new(value)
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(try_from = "f64", into = "f64")]
pub struct NormalizedValue(f64);

impl NormalizedValue {
    pub const ZERO: Self = Self(0.0);
    pub const FULL: Self = Self(1.0);

    pub fn new(value: f64) -> Result<Self, ValueError> {
        if !value.is_finite() {
            return Err(ValueError::NotFinite);
        }
        if !(0.0..=1.0).contains(&value) {
            return Err(ValueError::OutsideNormalizedRange(value));
        }
        Ok(Self(value))
    }

    #[must_use]
    pub fn clamped(value: f64) -> Self {
        if value.is_nan() {
            return Self::ZERO;
        }
        Self(value.clamp(0.0, 1.0))
    }

    #[must_use]
    pub const fn get(self) -> f64 {
        self.0
    }

    #[must_use]
    pub fn inverted(self) -> Self {
        Self(1.0 - self.0)
    }
}

impl TryFrom<f64> for NormalizedValue {
    type Error = ValueError;

    fn try_from(value: f64) -> Result<Self, Self::Error> {
        Self::new(value)
    }
}

impl From<NormalizedValue> for f64 {
    fn from(value: NormalizedValue) -> Self {
        value.get()
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "value")]
pub enum LogicalValue {
    Scalar(NormalizedValue),
    ColorRgb {
        red: NormalizedValue,
        green: NormalizedValue,
        blue: NormalizedValue,
    },
    AngleDegrees(f64),
    Boolean(bool),
    Discrete(u16),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ValueError {
    NotFinite,
    OutsideNormalizedRange(f64),
}

impl Display for ValueError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFinite => formatter.write_str("value must be finite"),
            Self::OutsideNormalizedRange(value) => {
                write!(
                    formatter,
                    "value {value} is outside the normalized range 0..=1"
                )
            }
        }
    }
}

impl Error for ValueError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalized_values_reject_invalid_input() {
        assert_eq!(
            NormalizedValue::new(-0.1),
            Err(ValueError::OutsideNormalizedRange(-0.1))
        );
        assert_eq!(NormalizedValue::new(f64::NAN), Err(ValueError::NotFinite));
    }

    #[test]
    fn clamped_values_are_safe_for_engine_boundaries() {
        assert_eq!(NormalizedValue::clamped(-1.0), NormalizedValue::ZERO);
        assert_eq!(NormalizedValue::clamped(2.0), NormalizedValue::FULL);
        assert_eq!(NormalizedValue::clamped(f64::NAN), NormalizedValue::ZERO);
    }
}
