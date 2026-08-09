//! Validated immutable fixture library with embedded generic and OFL profiles.

mod ofl;

use std::collections::BTreeMap;
use std::error::Error;
use std::fmt::{Display, Formatter};

use lighthouse_fixture_model::{FixtureDefinition, FixtureModelError};

pub use ofl::import_ofl_fixture;

const GENERIC_FIXTURE_JSON: &[&str] = &[
    include_str!("../../../assets/generic-fixtures/generic-dimmer.json"),
    include_str!("../../../assets/generic-fixtures/generic-led-par-rgb-4ch.json"),
    include_str!("../../../assets/generic-fixtures/generic-rgbw-par.json"),
    include_str!("../../../assets/generic-fixtures/generic-moving-head-16bit.json"),
];
const OFL_FIXTURE_PACK_JSON: &str = include_str!("../../../assets/ofl/ofl-mvp-pack.json");

#[derive(Clone, Debug, Default)]
pub struct FixtureLibrary {
    definitions: BTreeMap<(String, String), FixtureDefinition>,
}

impl FixtureLibrary {
    pub fn with_generic_pack() -> Result<Self, FixtureLibraryError> {
        let mut library = Self::default();
        for json in GENERIC_FIXTURE_JSON {
            let definition: FixtureDefinition = serde_json::from_str(json)?;
            library.insert(definition)?;
        }
        Ok(library)
    }

    pub fn with_embedded_pack() -> Result<Self, FixtureLibraryError> {
        let mut library = Self::with_generic_pack()?;
        for definition in serde_json::from_str::<Vec<FixtureDefinition>>(OFL_FIXTURE_PACK_JSON)? {
            library.insert(definition)?;
        }
        Ok(library)
    }

    pub fn insert(&mut self, definition: FixtureDefinition) -> Result<(), FixtureLibraryError> {
        definition.validate()?;
        let key = (definition.id.clone(), definition.revision.clone());
        if self.definitions.contains_key(&key) {
            return Err(FixtureLibraryError::DuplicateRevision {
                id: key.0,
                revision: key.1,
            });
        }
        self.definitions.insert(key, definition);
        Ok(())
    }

    #[must_use]
    pub fn get(&self, id: &str, revision: &str) -> Option<&FixtureDefinition> {
        self.definitions.get(&(id.to_owned(), revision.to_owned()))
    }

    pub fn iter(&self) -> impl Iterator<Item = &FixtureDefinition> {
        self.definitions.values()
    }

    #[must_use]
    pub fn find_latest(&self, id: &str) -> Option<&FixtureDefinition> {
        self.definitions
            .iter()
            .rev()
            .find_map(|((definition_id, _), definition)| {
                (definition_id == id).then_some(definition)
            })
    }

    #[must_use]
    pub fn clone_as_custom(
        &self,
        id: &str,
        revision: &str,
        custom_id: impl Into<String>,
        custom_model: impl Into<String>,
    ) -> Option<FixtureDefinition> {
        self.get(id, revision).cloned().map(|mut definition| {
            definition.id = custom_id.into();
            definition.revision = "custom-1".into();
            definition.manufacturer = "Custom".into();
            definition.model = custom_model.into();
            definition
        })
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.definitions.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.definitions.is_empty()
    }
}

#[derive(Debug)]
pub enum FixtureLibraryError {
    Json(serde_json::Error),
    InvalidDefinition(FixtureModelError),
    DuplicateRevision { id: String, revision: String },
    UnsupportedOfl(String),
}

impl From<serde_json::Error> for FixtureLibraryError {
    fn from(value: serde_json::Error) -> Self {
        Self::Json(value)
    }
}

impl From<FixtureModelError> for FixtureLibraryError {
    fn from(value: FixtureModelError) -> Self {
        Self::InvalidDefinition(value)
    }
}

impl Display for FixtureLibraryError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Json(error) => write!(formatter, "fixture JSON is invalid: {error}"),
            Self::InvalidDefinition(error) => {
                write!(formatter, "fixture definition is invalid: {error}")
            }
            Self::DuplicateRevision { id, revision } => {
                write!(formatter, "fixture {id} revision {revision} already exists")
            }
            Self::UnsupportedOfl(message) => {
                write!(formatter, "unsupported OFL fixture: {message}")
            }
        }
    }
}

impl Error for FixtureLibraryError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_generic_pack_is_parseable_and_semantically_valid() {
        let library = FixtureLibrary::with_generic_pack().unwrap();
        assert_eq!(library.len(), 4);
        assert!(
            library
                .iter()
                .all(|definition| definition.validate().is_ok())
        );
    }

    #[test]
    fn imported_profiles_are_cloned_before_custom_editing() {
        let library = FixtureLibrary::with_generic_pack().unwrap();
        let custom = library
            .clone_as_custom("generic.rgbw-par", "1", "custom.my-par", "My House PAR")
            .unwrap();
        assert_eq!(custom.id, "custom.my-par");
        assert_eq!(custom.manufacturer, "Custom");
        assert_eq!(
            library.get("generic.rgbw-par", "1").unwrap().manufacturer,
            "LightHouse"
        );
    }

    #[test]
    fn embedded_ofl_pack_is_valid_and_searchable() {
        let library = FixtureLibrary::with_embedded_pack().unwrap();
        assert!(library.len() > 500);
        assert!(
            library
                .iter()
                .any(|definition| definition.id.starts_with("ofl."))
        );
        assert!(
            library
                .iter()
                .all(|definition| definition.validate().is_ok())
        );
    }
}
