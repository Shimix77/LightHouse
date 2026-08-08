//! Versioned `.lightshow` project container, migrations and crash-recovery journal.

use std::collections::{BTreeMap, BTreeSet};
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Seek, Write};
use std::net::{IpAddr, SocketAddr};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use lighthouse_commands::{CommandEnvelope, CueListData, SceneData};
use lighthouse_domain::{
    FixtureId, GroupId, LayoutObjectId, NormalizedValue, ProjectId, UniverseId,
};
use lighthouse_effects::EffectDefinition;
use lighthouse_fixture_model::FixtureDefinition;
use lighthouse_patch::{PatchAssignment, PatchTable};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use zip::result::ZipError;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub const CURRENT_SCHEMA_VERSION: u32 = 1;
const MANIFEST_ENTRY: &str = "manifest.json";
const PROJECT_ENTRY: &str = "project.json";
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifest {
    pub schema_version: u32,
    pub application_version: String,
    pub project_id: ProjectId,
    pub project_name: String,
    pub fixture_entries: Vec<FixtureManifestEntry>,
    pub asset_entries: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixtureManifestEntry {
    pub definition_id: String,
    pub revision: String,
    pub path: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DisconnectPolicy {
    HoldLastLook,
    BlackoutAfterTimeout,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    pub dmx_refresh_hz: u32,
    pub disconnect_policy: DisconnectPolicy,
    pub disconnect_timeout_ms: u64,
    pub autosave_interval_ms: u64,
}

impl Default for ProjectSettings {
    fn default() -> Self {
        Self {
            dmx_refresh_hz: 44,
            disconnect_policy: DisconnectPolicy::HoldLastLook,
            disconnect_timeout_ms: 10_000,
            autosave_interval_ms: 30_000,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UniverseRecord {
    pub id: UniverseId,
    pub name: String,
    pub enabled: bool,
    pub routes: Vec<OutputRouteRecord>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "protocol", content = "settings")]
pub enum OutputRouteRecord {
    ArtNet {
        port_address: u16,
        destination: String,
        interface: Option<String>,
        broadcast: bool,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixtureRecord {
    pub id: FixtureId,
    pub name: String,
    pub definition_id: String,
    pub definition_revision: String,
    pub mode_id: String,
    pub enabled: bool,
    pub invert_pan: bool,
    pub invert_tilt: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchRecord {
    pub fixture_id: FixtureId,
    pub universe_id: UniverseId,
    pub start_address: u16,
    pub footprint: u16,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutTransform {
    pub x_meters: f64,
    pub y_meters: f64,
    pub width_meters: f64,
    pub height_meters: f64,
    pub rotation_degrees: f64,
    pub z_index: i32,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "data")]
pub enum LayoutObjectKind {
    Fixture { fixture_id: FixtureId },
    Truss,
    Speaker,
    Stage,
    Person,
    BackgroundImage { asset_path: String },
    Shape,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutObjectRecord {
    pub id: LayoutObjectId,
    pub name: String,
    pub kind: LayoutObjectKind,
    pub transform: LayoutTransform,
    pub layer: String,
    pub locked: bool,
    pub hidden: bool,
    pub opacity: NormalizedValue,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupRecord {
    pub id: GroupId,
    pub name: String,
    pub fixture_ids: Vec<FixtureId>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveControlRecord {
    pub id: u128,
    pub label: String,
    pub scene_id: Option<lighthouse_domain::SceneId>,
    pub effect_id: Option<lighthouse_domain::EffectId>,
    pub page: u16,
    pub position: u16,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDataV1 {
    pub project_id: ProjectId,
    pub name: String,
    pub settings: ProjectSettings,
    pub universes: Vec<UniverseRecord>,
    pub fixtures: Vec<FixtureRecord>,
    pub patch: Vec<PatchRecord>,
    pub layout_objects: Vec<LayoutObjectRecord>,
    pub groups: Vec<GroupRecord>,
    pub scenes: Vec<SceneData>,
    pub cue_lists: Vec<CueListData>,
    pub effects: Vec<EffectDefinition>,
    pub live_controls: Vec<LiveControlRecord>,
}

impl ProjectDataV1 {
    #[must_use]
    pub fn empty(project_id: ProjectId, name: impl Into<String>) -> Self {
        Self {
            project_id,
            name: name.into(),
            settings: ProjectSettings::default(),
            universes: Vec::new(),
            fixtures: Vec::new(),
            patch: Vec::new(),
            layout_objects: Vec::new(),
            groups: Vec::new(),
            scenes: Vec::new(),
            cue_lists: Vec::new(),
            effects: Vec::new(),
            live_controls: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ProjectBundle {
    pub manifest: ProjectManifest,
    pub project: ProjectDataV1,
    pub fixture_definitions: Vec<FixtureDefinition>,
    pub assets: BTreeMap<String, Vec<u8>>,
}

impl ProjectBundle {
    #[must_use]
    pub fn empty(project_id: ProjectId, name: impl Into<String>) -> Self {
        let name = name.into();
        Self {
            manifest: ProjectManifest {
                schema_version: CURRENT_SCHEMA_VERSION,
                application_version: env!("CARGO_PKG_VERSION").into(),
                project_id,
                project_name: name.clone(),
                fixture_entries: Vec::new(),
                asset_entries: Vec::new(),
            },
            project: ProjectDataV1::empty(project_id, name),
            fixture_definitions: Vec::new(),
            assets: BTreeMap::new(),
        }
    }

    pub fn validate(&self) -> Result<(), PersistenceError> {
        if self.manifest.schema_version != CURRENT_SCHEMA_VERSION {
            return Err(PersistenceError::UnsupportedSchema(
                self.manifest.schema_version,
            ));
        }
        if self.project.project_id != self.manifest.project_id {
            return Err(PersistenceError::InvalidProject(
                "manifest and project IDs do not match".into(),
            ));
        }
        if self.project.name.trim().is_empty() {
            return Err(PersistenceError::InvalidProject(
                "project name cannot be empty".into(),
            ));
        }

        let definition_keys: BTreeSet<_> = self
            .fixture_definitions
            .iter()
            .map(|definition| (definition.id.as_str(), definition.revision.as_str()))
            .collect();
        if definition_keys.len() != self.fixture_definitions.len() {
            return Err(PersistenceError::InvalidProject(
                "fixture definition revisions must be unique".into(),
            ));
        }
        for definition in &self.fixture_definitions {
            definition
                .validate()
                .map_err(|error| PersistenceError::InvalidProject(error.to_string()))?;
        }

        let fixture_ids: BTreeSet<_> = self
            .project
            .fixtures
            .iter()
            .map(|fixture| fixture.id)
            .collect();
        if fixture_ids.len() != self.project.fixtures.len() {
            return Err(PersistenceError::InvalidProject(
                "fixture IDs must be unique".into(),
            ));
        }
        for fixture in &self.project.fixtures {
            if !definition_keys.contains(&(
                fixture.definition_id.as_str(),
                fixture.definition_revision.as_str(),
            )) {
                return Err(PersistenceError::InvalidProject(format!(
                    "fixture {} references a missing definition revision",
                    fixture.id.0
                )));
            }
        }

        let universe_ids: BTreeSet<_> = self
            .project
            .universes
            .iter()
            .map(|universe| universe.id)
            .collect();
        if universe_ids.len() != self.project.universes.len() {
            return Err(PersistenceError::InvalidProject(
                "universe IDs must be unique".into(),
            ));
        }
        for universe in &self.project.universes {
            if universe.id.0 == 0 || universe.name.trim().is_empty() {
                return Err(PersistenceError::InvalidProject(
                    "universe ID must be positive and its name cannot be empty".into(),
                ));
            }
            if universe.routes.len() > 1 {
                return Err(PersistenceError::InvalidProject(format!(
                    "universe {} has more than one output route",
                    universe.id.0
                )));
            }
            for route in &universe.routes {
                match route {
                    OutputRouteRecord::ArtNet {
                        port_address,
                        destination,
                        interface,
                        ..
                    } => {
                        if *port_address > 0x7fff {
                            return Err(PersistenceError::InvalidProject(format!(
                                "universe {} has an invalid Art-Net port-address",
                                universe.id.0
                            )));
                        }
                        let destination = destination.parse::<SocketAddr>().map_err(|_| {
                            PersistenceError::InvalidProject(format!(
                                "universe {} has an invalid Art-Net destination",
                                universe.id.0
                            ))
                        })?;
                        if destination.is_ipv6() {
                            return Err(PersistenceError::InvalidProject(
                                "Art-Net MVP output supports IPv4 destinations only".into(),
                            ));
                        }
                        if let Some(interface) = interface {
                            let interface = interface.parse::<IpAddr>().map_err(|_| {
                                PersistenceError::InvalidProject(format!(
                                    "universe {} has an invalid output interface",
                                    universe.id.0
                                ))
                            })?;
                            if interface.is_ipv6() {
                                return Err(PersistenceError::InvalidProject(
                                    "Art-Net MVP output supports IPv4 interfaces only".into(),
                                ));
                            }
                        }
                    }
                }
            }
        }
        let mut patch_table = PatchTable::default();
        for record in &self.project.patch {
            if !fixture_ids.contains(&record.fixture_id)
                || !universe_ids.contains(&record.universe_id)
            {
                return Err(PersistenceError::InvalidProject(
                    "patch references an unknown fixture or universe".into(),
                ));
            }
            let assignment = PatchAssignment::new(
                record.fixture_id,
                record.universe_id,
                record.start_address,
                record.footprint,
            )
            .map_err(|error| PersistenceError::InvalidProject(error.to_string()))?;
            patch_table
                .insert(assignment)
                .map_err(|error| PersistenceError::InvalidProject(error.to_string()))?;
        }

        for object in &self.project.layout_objects {
            if let LayoutObjectKind::Fixture { fixture_id } = object.kind
                && !fixture_ids.contains(&fixture_id)
            {
                return Err(PersistenceError::InvalidProject(format!(
                    "layout object references unknown fixture {}",
                    fixture_id.0
                )));
            }
        }
        for asset_path in self.assets.keys() {
            validate_asset_path(asset_path)?;
        }
        Ok(())
    }

    fn prepared_manifest(&self) -> ProjectManifest {
        let fixture_entries = self
            .fixture_definitions
            .iter()
            .enumerate()
            .map(|(index, definition)| FixtureManifestEntry {
                definition_id: definition.id.clone(),
                revision: definition.revision.clone(),
                path: format!("fixtures/{index}.json"),
            })
            .collect();
        ProjectManifest {
            schema_version: CURRENT_SCHEMA_VERSION,
            application_version: self.manifest.application_version.clone(),
            project_id: self.project.project_id,
            project_name: self.project.name.clone(),
            fixture_entries,
            asset_entries: self.assets.keys().cloned().collect(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MigrationReport {
    pub from_version: u32,
    pub to_version: u32,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct LoadedProject {
    pub bundle: ProjectBundle,
    pub migration: Option<MigrationReport>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecoveryReport {
    pub backup_path: PathBuf,
    pub corrupt_path: PathBuf,
}

pub struct ProjectStore;

impl ProjectStore {
    pub fn save_atomic(path: &Path, bundle: &ProjectBundle) -> Result<(), PersistenceError> {
        bundle.validate()?;
        let temp_path = temporary_sibling(path)?;
        let result = write_bundle(&temp_path, bundle);
        if let Err(error) = result {
            let _ = fs::remove_file(&temp_path);
            return Err(error);
        }

        if path.exists() {
            fs::copy(path, backup_path(path))?;
        }
        fs::rename(&temp_path, path)?;
        Ok(())
    }

    pub fn load(path: &Path) -> Result<LoadedProject, PersistenceError> {
        let file = File::open(path)?;
        let mut archive = ZipArchive::new(file)?;
        let raw_manifest: RawManifest = read_json_entry(&mut archive, MANIFEST_ENTRY)?;
        match raw_manifest.schema_version {
            CURRENT_SCHEMA_VERSION => load_v1(&mut archive),
            0 => load_v0(&mut archive),
            version => Err(PersistenceError::UnsupportedSchema(version)),
        }
    }

    pub fn load_recovering(
        path: &Path,
    ) -> Result<(LoadedProject, Option<RecoveryReport>), PersistenceError> {
        match Self::load(path) {
            Ok(project) => Ok((project, None)),
            Err(primary_error) => {
                let backup_path = backup_path(path);
                if !backup_path.exists() {
                    return Err(primary_error);
                }
                let project = Self::load(&backup_path)?;
                let recovery_temp = temporary_sibling(path)?;
                fs::copy(&backup_path, &recovery_temp)?;
                let corrupt_path = corrupt_sibling(path)?;
                if path.exists() {
                    fs::rename(path, &corrupt_path)?;
                }
                if let Err(error) = fs::rename(&recovery_temp, path) {
                    let _ = fs::rename(&corrupt_path, path);
                    let _ = fs::remove_file(&recovery_temp);
                    return Err(error.into());
                }
                Ok((
                    project,
                    Some(RecoveryReport {
                        backup_path,
                        corrupt_path,
                    }),
                ))
            }
        }
    }
}

fn write_bundle(path: &Path, bundle: &ProjectBundle) -> Result<(), PersistenceError> {
    let file = OpenOptions::new().write(true).create_new(true).open(path)?;
    let mut writer = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    let manifest = bundle.prepared_manifest();
    write_json_entry(&mut writer, MANIFEST_ENTRY, &manifest, options)?;
    write_json_entry(&mut writer, PROJECT_ENTRY, &bundle.project, options)?;
    for (entry, definition) in manifest
        .fixture_entries
        .iter()
        .zip(&bundle.fixture_definitions)
    {
        write_json_entry(&mut writer, &entry.path, definition, options)?;
    }
    for (path, bytes) in &bundle.assets {
        writer.start_file(path, options)?;
        writer.write_all(bytes)?;
    }
    let file = writer.finish()?;
    file.sync_all()?;
    Ok(())
}

fn write_json_entry<W: Write + Seek, T: Serialize>(
    writer: &mut ZipWriter<W>,
    path: &str,
    value: &T,
    options: SimpleFileOptions,
) -> Result<(), PersistenceError> {
    writer.start_file(path, options)?;
    serde_json::to_writer_pretty(writer, value)?;
    Ok(())
}

fn load_v1<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Result<LoadedProject, PersistenceError> {
    let manifest: ProjectManifest = read_json_entry(archive, MANIFEST_ENTRY)?;
    let project: ProjectDataV1 = read_json_entry(archive, PROJECT_ENTRY)?;
    let mut fixture_definitions = Vec::with_capacity(manifest.fixture_entries.len());
    for entry in &manifest.fixture_entries {
        validate_archive_entry_path(&entry.path)?;
        fixture_definitions.push(read_json_entry(archive, &entry.path)?);
    }
    let mut assets = BTreeMap::new();
    for path in &manifest.asset_entries {
        validate_asset_path(path)?;
        assets.insert(path.clone(), read_binary_entry(archive, path)?);
    }
    let bundle = ProjectBundle {
        manifest,
        project,
        fixture_definitions,
        assets,
    };
    bundle.validate()?;
    Ok(LoadedProject {
        bundle,
        migration: None,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawManifest {
    schema_version: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyProjectV0 {
    project_id: ProjectId,
    project_name: String,
    universe_count: u32,
}

fn load_v0<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Result<LoadedProject, PersistenceError> {
    let legacy: LegacyProjectV0 = read_json_entry(archive, PROJECT_ENTRY)?;
    Ok(migrate_v0(legacy))
}

fn migrate_v0(legacy: LegacyProjectV0) -> LoadedProject {
    let mut bundle = ProjectBundle::empty(legacy.project_id, legacy.project_name);
    bundle.project.universes = (1..=legacy.universe_count)
        .map(|index| UniverseRecord {
            id: UniverseId::new(index),
            name: format!("Universe {index}"),
            enabled: true,
            routes: Vec::new(),
        })
        .collect();
    LoadedProject {
        bundle,
        migration: Some(MigrationReport {
            from_version: 0,
            to_version: CURRENT_SCHEMA_VERSION,
            warnings: vec![
                "Legacy universes were migrated without output routes; configure Art-Net destinations."
                    .into(),
            ],
        }),
    }
}

fn read_json_entry<R: Read + Seek, T: DeserializeOwned>(
    archive: &mut ZipArchive<R>,
    path: &str,
) -> Result<T, PersistenceError> {
    let bytes = read_binary_entry(archive, path)?;
    Ok(serde_json::from_slice(&bytes)?)
}

fn read_binary_entry<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    path: &str,
) -> Result<Vec<u8>, PersistenceError> {
    validate_archive_entry_path(path)?;
    let mut entry = archive.by_name(path)?;
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn validate_asset_path(path: &str) -> Result<(), PersistenceError> {
    if !path.starts_with("assets/") {
        return Err(PersistenceError::InvalidArchivePath(path.into()));
    }
    validate_archive_entry_path(path)
}

fn validate_archive_entry_path(path: &str) -> Result<(), PersistenceError> {
    let candidate = Path::new(path);
    if path.contains('\\')
        || candidate.is_absolute()
        || candidate.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(PersistenceError::InvalidArchivePath(path.into()));
    }
    Ok(())
}

fn temporary_sibling(path: &Path) -> Result<PathBuf, PersistenceError> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| PersistenceError::InvalidProject("project path has no file name".into()))?;
    let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    Ok(path.with_file_name(format!(
        ".{file_name}.tmp-{}-{sequence}",
        std::process::id()
    )))
}

fn corrupt_sibling(path: &Path) -> Result<PathBuf, PersistenceError> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| PersistenceError::InvalidProject("project path has no file name".into()))?;
    loop {
        let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let candidate = path.with_file_name(format!("{file_name}.corrupt-{sequence}"));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
}

#[must_use]
pub fn backup_path(path: &Path) -> PathBuf {
    let mut value = path.as_os_str().to_owned();
    value.push(".bak");
    PathBuf::from(value)
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub sequence: u64,
    pub command: CommandEnvelope,
}

#[derive(Clone, Debug, PartialEq)]
pub struct JournalRead {
    pub entries: Vec<JournalEntry>,
    pub truncated_tail_ignored: bool,
}

#[derive(Clone, Debug)]
pub struct RecoveryJournal {
    path: PathBuf,
}

impl RecoveryJournal {
    #[must_use]
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn append(&self, entry: &JournalEntry) -> Result<(), PersistenceError> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        serde_json::to_writer(&mut file, entry)?;
        file.write_all(b"\n")?;
        file.sync_data()?;
        Ok(())
    }

    pub fn read(&self) -> Result<JournalRead, PersistenceError> {
        if !self.path.exists() {
            return Ok(JournalRead {
                entries: Vec::new(),
                truncated_tail_ignored: false,
            });
        }
        let contents = fs::read_to_string(&self.path)?;
        let mut entries = Vec::new();
        let mut truncated_tail_ignored = false;
        let segments: Vec<_> = contents.split_inclusive('\n').collect();
        for (index, segment) in segments.iter().enumerate() {
            let line = segment.trim();
            if line.is_empty() {
                continue;
            }
            match serde_json::from_str(line) {
                Ok(entry) => entries.push(entry),
                Err(_error) if index + 1 == segments.len() && !segment.ends_with('\n') => {
                    truncated_tail_ignored = true;
                }
                Err(error) => {
                    return Err(PersistenceError::CorruptJournal {
                        line: index + 1,
                        source: error,
                    });
                }
            }
        }
        Ok(JournalRead {
            entries,
            truncated_tail_ignored,
        })
    }

    pub fn truncate(&self) -> Result<(), PersistenceError> {
        let file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&self.path)?;
        file.sync_all()?;
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AutosavePolicy {
    pub interval: Duration,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct AutosaveTracker {
    last_saved_at: Option<Duration>,
}

impl AutosaveTracker {
    #[must_use]
    pub fn should_save(self, policy: AutosavePolicy, now: Duration, dirty: bool) -> bool {
        dirty
            && self
                .last_saved_at
                .is_none_or(|last_saved| now.saturating_sub(last_saved) >= policy.interval)
    }

    pub fn mark_saved(&mut self, now: Duration) {
        self.last_saved_at = Some(now);
    }
}

#[derive(Debug)]
pub enum PersistenceError {
    Io(io::Error),
    Json(serde_json::Error),
    Zip(ZipError),
    UnsupportedSchema(u32),
    InvalidProject(String),
    InvalidArchivePath(String),
    CorruptJournal {
        line: usize,
        source: serde_json::Error,
    },
}

impl From<io::Error> for PersistenceError {
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<serde_json::Error> for PersistenceError {
    fn from(value: serde_json::Error) -> Self {
        Self::Json(value)
    }
}

impl From<ZipError> for PersistenceError {
    fn from(value: ZipError) -> Self {
        Self::Zip(value)
    }
}

impl Display for PersistenceError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "project I/O failed: {error}"),
            Self::Json(error) => write!(formatter, "project JSON is invalid: {error}"),
            Self::Zip(error) => write!(formatter, "project ZIP is invalid: {error}"),
            Self::UnsupportedSchema(version) => {
                write!(
                    formatter,
                    "project schema version {version} is not supported"
                )
            }
            Self::InvalidProject(message) => write!(formatter, "project is invalid: {message}"),
            Self::InvalidArchivePath(path) => write!(formatter, "unsafe archive path: {path}"),
            Self::CorruptJournal { line, source } => {
                write!(
                    formatter,
                    "recovery journal is corrupt at line {line}: {source}"
                )
            }
        }
    }
}

impl Error for PersistenceError {}

#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicU64;

    use lighthouse_commands::{Command, PriorityLane};
    use lighthouse_fixture_library::FixtureLibrary;

    use super::*;

    static TEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    fn test_directory() -> PathBuf {
        let sequence = TEST_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "lighthouse-persistence-test-{}-{sequence}",
            std::process::id()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn sample_bundle() -> ProjectBundle {
        let project_id = ProjectId::new(1);
        let fixture_id = FixtureId::new(10);
        let universe_id = UniverseId::new(1);
        let definition = FixtureLibrary::with_generic_pack()
            .unwrap()
            .get("generic.dimmer", "1")
            .unwrap()
            .clone();
        let mut bundle = ProjectBundle::empty(project_id, "Sample");
        bundle.fixture_definitions.push(definition);
        bundle.project.universes.push(UniverseRecord {
            id: universe_id,
            name: "Main".into(),
            enabled: true,
            routes: vec![OutputRouteRecord::ArtNet {
                port_address: 0,
                destination: "127.0.0.1:6454".into(),
                interface: None,
                broadcast: false,
            }],
        });
        bundle.project.fixtures.push(FixtureRecord {
            id: fixture_id,
            name: "Front".into(),
            definition_id: "generic.dimmer".into(),
            definition_revision: "1".into(),
            mode_id: "1ch".into(),
            enabled: true,
            invert_pan: false,
            invert_tilt: false,
        });
        bundle.project.patch.push(PatchRecord {
            fixture_id,
            universe_id,
            start_address: 1,
            footprint: 1,
        });
        bundle
            .assets
            .insert("assets/background/floor.png".into(), vec![1, 2, 3, 4]);
        bundle
    }

    #[test]
    fn lightshow_container_round_trips_and_creates_a_backup() {
        let directory = test_directory();
        let path = directory.join("sample.lightshow");
        let bundle = sample_bundle();
        ProjectStore::save_atomic(&path, &bundle).unwrap();
        let loaded = ProjectStore::load(&path).unwrap();
        assert_eq!(loaded.bundle.project, bundle.project);
        assert_eq!(
            loaded.bundle.fixture_definitions,
            bundle.fixture_definitions
        );
        assert_eq!(loaded.bundle.assets, bundle.assets);

        ProjectStore::save_atomic(&path, &bundle).unwrap();
        assert!(backup_path(&path).exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn corrupted_primary_is_recovered_without_destroying_the_evidence() {
        let directory = test_directory();
        let path = directory.join("recover.lightshow");
        let bundle = sample_bundle();
        ProjectStore::save_atomic(&path, &bundle).unwrap();
        ProjectStore::save_atomic(&path, &bundle).unwrap();
        fs::write(&path, b"not a zip archive").unwrap();

        let (loaded, recovery) = ProjectStore::load_recovering(&path).unwrap();
        let recovery = recovery.unwrap();
        assert_eq!(loaded.bundle.project.name, "Sample");
        assert!(recovery.backup_path.exists());
        assert!(recovery.corrupt_path.exists());
        assert_eq!(
            fs::read(&recovery.corrupt_path).unwrap(),
            b"not a zip archive"
        );
        assert!(ProjectStore::load(&path).is_ok());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn validation_rejects_patch_conflicts_before_saving() {
        let mut bundle = sample_bundle();
        let second_id = FixtureId::new(11);
        bundle.project.fixtures.push(FixtureRecord {
            id: second_id,
            name: "Second".into(),
            definition_id: "generic.dimmer".into(),
            definition_revision: "1".into(),
            mode_id: "1ch".into(),
            enabled: true,
            invert_pan: false,
            invert_tilt: false,
        });
        bundle.project.patch.push(PatchRecord {
            fixture_id: second_id,
            universe_id: UniverseId::new(1),
            start_address: 1,
            footprint: 1,
        });
        assert!(matches!(
            bundle.validate(),
            Err(PersistenceError::InvalidProject(_))
        ));
    }

    #[test]
    fn validation_rejects_invalid_artnet_routes_before_saving() {
        let mut bundle = sample_bundle();
        bundle.project.universes[0].routes = vec![OutputRouteRecord::ArtNet {
            port_address: 0x8000,
            destination: "lighting-node-without-a-port".into(),
            interface: Some("not-an-ip".into()),
            broadcast: true,
        }];
        assert!(matches!(
            bundle.validate(),
            Err(PersistenceError::InvalidProject(_))
        ));

        bundle.project.universes[0].routes = vec![OutputRouteRecord::ArtNet {
            port_address: 0,
            destination: "127.0.0.1:6454".into(),
            interface: Some("127.0.0.1".into()),
            broadcast: false,
        }];
        assert!(bundle.validate().is_ok());
    }

    #[test]
    fn recovery_journal_ignores_only_a_truncated_tail() {
        let directory = test_directory();
        let path = directory.join("recovery.jsonl");
        let journal = RecoveryJournal::new(&path);
        let mut command = CommandEnvelope::new(
            1,
            "test",
            ProjectId::new(1),
            Command::SetBlackout { enabled: true },
        );
        command.priority_lane = PriorityLane::Safety;
        journal
            .append(&JournalEntry {
                sequence: 1,
                command,
            })
            .unwrap();
        OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(b"{\"sequence\":2")
            .unwrap();

        let read = journal.read().unwrap();
        assert_eq!(read.entries.len(), 1);
        assert!(read.truncated_tail_ignored);
        journal.truncate().unwrap();
        assert!(journal.read().unwrap().entries.is_empty());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn autosave_only_runs_when_dirty_and_due() {
        let policy = AutosavePolicy {
            interval: Duration::from_secs(30),
        };
        let mut tracker = AutosaveTracker::default();
        assert!(!tracker.should_save(policy, Duration::ZERO, false));
        assert!(tracker.should_save(policy, Duration::ZERO, true));
        tracker.mark_saved(Duration::ZERO);
        assert!(!tracker.should_save(policy, Duration::from_secs(29), true));
        assert!(tracker.should_save(policy, Duration::from_secs(30), true));
    }

    #[test]
    fn v0_migration_creates_universes_and_a_warning() {
        let loaded = migrate_v0(LegacyProjectV0 {
            project_id: ProjectId::new(7),
            project_name: "Legacy".into(),
            universe_count: 3,
        });
        assert_eq!(loaded.bundle.project.universes.len(), 3);
        assert_eq!(loaded.migration.unwrap().from_version, 0);
    }
}
