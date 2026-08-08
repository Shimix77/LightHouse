use std::collections::BTreeMap;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command as ProcessCommand, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use lighthouse_commands::{
    Command, CommandEnvelope, CueEntryData, CueListData, FixtureParameterValues, OperationMode,
    PriorityLane, SceneData,
};
use lighthouse_domain::{
    CueListId, EffectId, FixtureId, GroupId, LayoutObjectId, NormalizedValue, ParameterId,
    ProjectId, SceneId, UniverseId,
};
use lighthouse_effects::{
    EffectBlend, EffectDefinition, EffectDirection, EffectOrder, EffectTemplate,
};
use lighthouse_fixture_library::FixtureLibrary;
use lighthouse_ipc::{
    ClientMessage, EngineTelemetry, IPC_CONTRACT_VERSION, ServerMessage, read_message,
    write_message,
};
use lighthouse_persistence::{
    FixtureRecord, GroupRecord, LayoutObjectKind, LayoutObjectRecord, LayoutTransform,
    LiveControlRecord, OutputRouteRecord, PatchRecord, ProjectBundle, ProjectStore, UniverseRecord,
};
use lighthouse_show_engine::ShowSnapshot;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const DEFAULT_PROJECT_FILE: &str = "LightHouse Demo.lightshow";
const SESSION_FILE: &str = "engine-session.json";
const ENGINE_LOG_FILE: &str = "engine.log";
const IPC_TIMEOUT: Duration = Duration::from_secs(2);

pub struct DesktopBackend {
    app_data_dir: PathBuf,
    project_path: PathBuf,
    bundle: ProjectBundle,
    session: EngineSession,
    next_sequence: u64,
}

impl DesktopBackend {
    pub fn open(app_data_dir: PathBuf) -> Result<Self, BackendError> {
        fs::create_dir_all(&app_data_dir)?;
        let project_dir = app_data_dir.join("Projects");
        fs::create_dir_all(&project_dir)?;
        let project_path = project_dir.join(DEFAULT_PROJECT_FILE);
        if !project_path.exists() {
            ProjectStore::save_atomic(&project_path, &demo_project()?)?;
        }
        let bundle = ProjectStore::load(&project_path)?.bundle;
        let session = EngineSession::connect_or_spawn(&app_data_dir, &project_path)?;
        Ok(Self {
            app_data_dir,
            project_path,
            bundle,
            session,
            next_sequence: 1,
        })
    }

    pub fn bootstrap(&mut self) -> Result<UiBootstrap, BackendError> {
        let (snapshot, telemetry) = self.request_snapshot_with_restart()?;
        Ok(UiBootstrap {
            project: project_view(&self.bundle, &snapshot),
            engine: engine_view(snapshot, telemetry),
            project_path: self.project_path.to_string_lossy().into_owned(),
        })
    }

    pub fn refresh(&mut self) -> Result<UiEngineView, BackendError> {
        let (snapshot, telemetry) = self.request_snapshot_with_restart()?;
        Ok(engine_view(snapshot, telemetry))
    }

    pub fn command(&mut self, command: UiEngineCommand) -> Result<UiEngineView, BackendError> {
        let priority_lane = command.priority_lane();
        let retryable = command.is_retryable();
        let command = command.into_domain(&self.bundle)?;
        let mut envelope = CommandEnvelope::new(
            Uuid::new_v4().as_u128(),
            "desktop-ui",
            self.bundle.project.project_id,
            command.clone(),
        );
        envelope.client_sequence = self.next_sequence;
        envelope.priority_lane = priority_lane;
        self.next_sequence = self.next_sequence.saturating_add(1);
        let response = self.session.request(ClientMessage::Command {
            envelope: Box::new(envelope),
        });
        let response = match response {
            Ok(response) => response,
            Err(_) if retryable => {
                self.restart_engine()?;
                let mut retry = CommandEnvelope::new(
                    Uuid::new_v4().as_u128(),
                    "desktop-ui-retry",
                    self.bundle.project.project_id,
                    command,
                );
                retry.client_sequence = self.next_sequence;
                retry.priority_lane = priority_lane;
                self.next_sequence = self.next_sequence.saturating_add(1);
                self.session.request(ClientMessage::Command {
                    envelope: Box::new(retry),
                })?
            }
            Err(error) => return Err(error),
        };
        match response {
            ServerMessage::CommandOutcome { outcome } => {
                if let Err(rejection) = outcome.result {
                    return Err(BackendError::CommandRejected(rejection.message));
                }
            }
            ServerMessage::EngineError { message } => {
                return Err(BackendError::Engine(message));
            }
            other => return Err(BackendError::UnexpectedMessage(format!("{other:?}"))),
        }
        self.refresh()
    }

    pub fn project_command(
        &mut self,
        command: UiProjectCommand,
    ) -> Result<UiBootstrap, BackendError> {
        let (snapshot, _) = self.request_snapshot_with_restart()?;
        if snapshot.operation_mode != OperationMode::Edit {
            return Err(BackendError::InvalidCommand(
                "project structure can only be changed in EDIT mode".into(),
            ));
        }
        let mut next = self.bundle.clone();
        let restart_required = apply_project_command(&mut next, command, Some(&snapshot))?;
        next.validate()?;
        ProjectStore::save_atomic(&self.project_path, &next)?;
        self.bundle = next;
        if restart_required {
            self.restart_engine()?;
        }
        self.bootstrap()
    }

    fn request_snapshot_with_restart(
        &mut self,
    ) -> Result<(ShowSnapshot, EngineTelemetry), BackendError> {
        match self.session.snapshot() {
            Ok(snapshot) => Ok(snapshot),
            Err(_) => {
                self.restart_engine()?;
                self.session.snapshot()
            }
        }
    }

    fn restart_engine(&mut self) -> Result<(), BackendError> {
        let _ = self.session.shutdown();
        self.session = EngineSession::spawn(&self.app_data_dir, &self.project_path)?;
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "data")]
pub enum UiEngineCommand {
    SetFixtureParameter {
        fixture_id: String,
        parameter_id: String,
        value: f64,
    },
    ClearProgrammer {
        fixture_id: Option<String>,
    },
    ActivateScene {
        scene_id: String,
        fade_ms: Option<u64>,
    },
    ReleaseScene {
        scene_id: String,
        fade_ms: Option<u64>,
    },
    GoNextCue {
        cue_list_id: String,
    },
    BackCue {
        cue_list_id: String,
    },
    PauseCueList {
        cue_list_id: String,
    },
    ResumeCueList {
        cue_list_id: String,
    },
    SetGrandMaster {
        value: f64,
    },
    SetBlackout {
        enabled: bool,
    },
    SetBlind {
        enabled: bool,
    },
    CommitBlind,
    SetFreeze {
        enabled: bool,
    },
    SetOperationMode {
        mode: OperationMode,
    },
    SetTempo {
        bpm: f64,
    },
    TapTempo,
    StartEffect {
        effect_id: String,
        fixture_ids: Vec<String>,
    },
    StopEffect {
        effect_id: String,
    },
    ApplyFan {
        fixture_ids: Vec<String>,
        parameter_id: String,
        base: f64,
        spread: f64,
    },
    ApplyColorFan {
        fixture_ids: Vec<String>,
        start_rgb: [f64; 3],
        end_rgb: [f64; 3],
    },
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "data")]
pub enum UiProjectCommand {
    UpdateLayouts {
        layouts: Vec<UiLayoutUpdate>,
    },
    PatchFixture {
        fixture_id: String,
        universe: u32,
        address: u16,
    },
    AddFixture {
        name: String,
        definition_id: String,
        mode_id: String,
        x: f64,
        y: f64,
    },
    DuplicateFixtures {
        fixture_ids: Vec<String>,
    },
    DeleteFixtures {
        fixture_ids: Vec<String>,
    },
    AddUniverse,
    PutBackground {
        name: String,
        mime: String,
        bytes: Vec<u8>,
    },
    RemoveBackground,
    AddStageObject {
        kind: String,
        name: String,
        x: f64,
        y: f64,
    },
    UpdateStageObjects {
        objects: Vec<UiStageObjectUpdate>,
    },
    DuplicateStageObjects {
        object_ids: Vec<String>,
    },
    DeleteStageObjects {
        object_ids: Vec<String>,
    },
    PutGroup {
        group_id: Option<String>,
        name: String,
        fixture_ids: Vec<String>,
    },
    DeleteGroup {
        group_id: String,
    },
    CaptureScene {
        name: String,
        fixture_ids: Vec<String>,
        fade_ms: u64,
    },
    UpdateScene {
        scene_id: String,
        name: String,
        fade_ms: u64,
    },
    DeleteScene {
        scene_id: String,
    },
    AddCue {
        cue_list_id: Option<String>,
        scene_id: String,
    },
    DeleteCue {
        cue_list_id: String,
        index: usize,
    },
    PutEffect {
        effect_id: Option<String>,
        name: String,
        template: EffectTemplate,
        target_parameter: String,
        amplitude: f64,
        offset: f64,
        speed_hz: f64,
        beat_multiplier: f64,
        beat_sync: bool,
        spatial_phase: f64,
        direction: EffectDirection,
        blend: EffectBlend,
        order: EffectOrder,
    },
    DeleteEffect {
        effect_id: String,
    },
    PutLiveControl {
        control_id: Option<String>,
        label: String,
        scene_id: Option<String>,
        effect_id: Option<String>,
        page: u16,
        position: u16,
    },
    DeleteLiveControl {
        control_id: String,
    },
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiLayoutUpdate {
    fixture_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    rotation: f64,
    locked: bool,
    hidden: bool,
    layer: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiStageObjectUpdate {
    object_id: String,
    name: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    rotation: f64,
    locked: bool,
    hidden: bool,
    layer: String,
    opacity: f64,
}

impl UiEngineCommand {
    fn priority_lane(&self) -> PriorityLane {
        match self {
            Self::SetBlackout { .. } | Self::SetGrandMaster { .. } => PriorityLane::Safety,
            Self::ActivateScene { .. }
            | Self::ReleaseScene { .. }
            | Self::GoNextCue { .. }
            | Self::BackCue { .. }
            | Self::PauseCueList { .. }
            | Self::ResumeCueList { .. }
            | Self::SetFreeze { .. }
            | Self::StartEffect { .. }
            | Self::StopEffect { .. }
            | Self::TapTempo => PriorityLane::Live,
            _ => PriorityLane::Edit,
        }
    }

    fn into_domain(self, bundle: &ProjectBundle) -> Result<Command, BackendError> {
        Ok(match self {
            Self::SetFixtureParameter {
                fixture_id,
                parameter_id,
                value,
            } => Command::SetFixtureParameter {
                fixture_id: FixtureId::new(parse_id(&fixture_id)?),
                parameter_id: ParameterId::new(parameter_id),
                value: NormalizedValue::new(value)
                    .map_err(|error| BackendError::InvalidCommand(error.to_string()))?,
            },
            Self::ClearProgrammer { fixture_id } => Command::ClearProgrammer {
                fixture_id: fixture_id
                    .as_deref()
                    .map(parse_id)
                    .transpose()?
                    .map(FixtureId::new),
            },
            Self::ActivateScene { scene_id, fade_ms } => Command::ActivateScene {
                scene_id: SceneId::new(parse_id(&scene_id)?),
                fade_ms,
            },
            Self::ReleaseScene { scene_id, fade_ms } => Command::ReleaseScene {
                scene_id: SceneId::new(parse_id(&scene_id)?),
                fade_ms,
            },
            Self::GoNextCue { cue_list_id } => Command::GoNextCue {
                cue_list_id: CueListId::new(parse_id(&cue_list_id)?),
            },
            Self::BackCue { cue_list_id } => Command::BackCue {
                cue_list_id: CueListId::new(parse_id(&cue_list_id)?),
            },
            Self::PauseCueList { cue_list_id } => Command::PauseCueList {
                cue_list_id: CueListId::new(parse_id(&cue_list_id)?),
            },
            Self::ResumeCueList { cue_list_id } => Command::ResumeCueList {
                cue_list_id: CueListId::new(parse_id(&cue_list_id)?),
            },
            Self::SetGrandMaster { value } => Command::SetGrandMaster {
                value: NormalizedValue::new(value)
                    .map_err(|error| BackendError::InvalidCommand(error.to_string()))?,
            },
            Self::SetBlackout { enabled } => Command::SetBlackout { enabled },
            Self::SetBlind { enabled } => Command::SetBlind { enabled },
            Self::CommitBlind => Command::CommitBlind,
            Self::SetFreeze { enabled } => Command::SetFreeze { enabled },
            Self::SetOperationMode { mode } => Command::SetOperationMode { mode },
            Self::SetTempo { bpm } => Command::SetTempo { bpm },
            Self::TapTempo => Command::TapTempo,
            Self::StartEffect {
                effect_id,
                fixture_ids,
            } => {
                let fixture_ids = validated_fixture_ids(bundle, &fixture_ids, true)?;
                let layout_positions = effect_layout_positions(bundle, &fixture_ids);
                Command::StartEffect {
                    effect_id: EffectId::new(parse_id(&effect_id)?),
                    fixture_ids,
                    layout_positions,
                }
            }
            Self::StopEffect { effect_id } => Command::StopEffect {
                effect_id: EffectId::new(parse_id(&effect_id)?),
            },
            Self::ApplyFan {
                fixture_ids,
                parameter_id,
                base,
                spread,
            } => Command::ApplyFan {
                fixture_ids: validated_fixture_ids(bundle, &fixture_ids, false)?,
                parameter_id: ParameterId::new(parameter_id),
                base: NormalizedValue::new(base)
                    .map_err(|error| BackendError::InvalidCommand(error.to_string()))?,
                spread,
            },
            Self::ApplyColorFan {
                fixture_ids,
                start_rgb,
                end_rgb,
            } => Command::ApplyColorFan {
                fixture_ids: validated_fixture_ids(bundle, &fixture_ids, false)?,
                start_rgb: normalized_rgb(start_rgb)?,
                end_rgb: normalized_rgb(end_rgb)?,
            },
        })
    }

    fn is_retryable(&self) -> bool {
        matches!(
            self,
            Self::SetFixtureParameter { .. }
                | Self::ClearProgrammer { .. }
                | Self::SetGrandMaster { .. }
                | Self::SetBlackout { .. }
                | Self::SetBlind { .. }
                | Self::CommitBlind
                | Self::SetFreeze { .. }
                | Self::SetOperationMode { .. }
                | Self::SetTempo { .. }
                | Self::ApplyFan { .. }
                | Self::ApplyColorFan { .. }
        )
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiBootstrap {
    project: UiProjectView,
    engine: UiEngineView,
    project_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiProjectView {
    name: String,
    fixtures: Vec<UiFixtureView>,
    stage_objects: Vec<UiStageObjectView>,
    groups: Vec<UiGroupView>,
    scenes: Vec<UiSceneView>,
    cue_lists: Vec<UiCueListView>,
    effects: Vec<UiEffectView>,
    live_controls: Vec<UiLiveControlView>,
    fixture_definitions: Vec<UiFixtureDefinitionView>,
    background: Option<UiBackgroundView>,
    universe_count: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiStageObjectView {
    id: String,
    name: String,
    kind: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    rotation: f64,
    locked: bool,
    hidden: bool,
    layer: String,
    opacity: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiGroupView {
    id: String,
    name: String,
    fixture_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiBackgroundView {
    name: String,
    data_url: String,
    opacity: f64,
    locked: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiFixtureView {
    id: String,
    name: String,
    kind: String,
    definition_id: String,
    mode_id: String,
    footprint: u16,
    universe: u32,
    address: u16,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    rotation: f64,
    intensity: f64,
    color: String,
    pan: f64,
    tilt: f64,
    zoom: f64,
    locked: bool,
    hidden: bool,
    layer: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiFixtureDefinitionView {
    id: String,
    manufacturer: String,
    model: String,
    modes: Vec<UiFixtureModeView>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiFixtureModeView {
    id: String,
    name: String,
    footprint: u16,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiSceneView {
    id: String,
    number: String,
    name: String,
    color: String,
    active: bool,
    fade_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiCueListView {
    id: String,
    name: String,
    entries: Vec<UiCueEntryView>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiCueEntryView {
    number: String,
    name: String,
    scene_id: String,
    fade_ms: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiEffectView {
    id: String,
    name: String,
    template: EffectTemplate,
    target_parameter: String,
    amplitude: f64,
    offset: f64,
    speed_hz: f64,
    beat_multiplier: f64,
    beat_sync: bool,
    spatial_phase: f64,
    direction: EffectDirection,
    blend: EffectBlend,
    order: EffectOrder,
    active: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiLiveControlView {
    id: String,
    label: String,
    scene_id: Option<String>,
    effect_id: Option<String>,
    page: u16,
    position: u16,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiEngineView {
    revision: u64,
    operation_mode: OperationMode,
    fixture_values: Vec<UiFixtureValues>,
    active_scene_ids: Vec<String>,
    active_effect_ids: Vec<String>,
    cue_runtime: Vec<UiCueRuntime>,
    grand_master: f64,
    blackout: bool,
    blind: bool,
    freeze: bool,
    bpm: f64,
    telemetry: EngineTelemetry,
    connected: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiFixtureValues {
    fixture_id: String,
    parameters: BTreeMap<String, f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UiCueRuntime {
    cue_list_id: String,
    cursor: Option<usize>,
    paused: bool,
}

fn project_view(bundle: &ProjectBundle, snapshot: &ShowSnapshot) -> UiProjectView {
    let patch: BTreeMap<_, _> = bundle
        .project
        .patch
        .iter()
        .map(|record| (record.fixture_id, record))
        .collect();
    let layout: BTreeMap<_, _> = bundle
        .project
        .layout_objects
        .iter()
        .filter_map(|record| match record.kind {
            LayoutObjectKind::Fixture { fixture_id } => Some((fixture_id, record)),
            _ => None,
        })
        .collect();
    let fixtures = bundle
        .project
        .fixtures
        .iter()
        .map(|fixture| {
            let patch_record = patch.get(&fixture.id).copied();
            let layout_record = layout.get(&fixture.id).copied();
            let values = snapshot.resolved_values.get(&fixture.id);
            UiFixtureView {
                id: fixture.id.0.to_string(),
                name: fixture.name.clone(),
                kind: fixture_kind(fixture),
                definition_id: fixture.definition_id.clone(),
                mode_id: fixture.mode_id.clone(),
                footprint: patch_record.map_or_else(
                    || fixture_mode_footprint(bundle, fixture).unwrap_or(1),
                    |record| record.footprint,
                ),
                universe: patch_record.map_or(0, |record| record.universe_id.0),
                address: patch_record.map_or(0, |record| record.start_address),
                x: layout_record.map_or(0.0, |record| record.transform.x_meters),
                y: layout_record.map_or(0.0, |record| record.transform.y_meters),
                width: layout_record.map_or(0.65, |record| record.transform.width_meters),
                height: layout_record.map_or(0.65, |record| record.transform.height_meters),
                rotation: layout_record.map_or(0.0, |record| record.transform.rotation_degrees),
                intensity: parameter(values, "intensity", 0.0),
                color: rgb_hex(values),
                pan: parameter(values, "position.pan", 0.5),
                tilt: parameter(values, "position.tilt", 0.5),
                zoom: parameter(values, "beam.zoom", 0.5),
                locked: layout_record.is_some_and(|record| record.locked),
                hidden: layout_record.is_some_and(|record| record.hidden),
                layer: layout_record
                    .map_or_else(|| "Fixtures".into(), |record| record.layer.clone()),
            }
        })
        .collect();
    let stage_objects = bundle
        .project
        .layout_objects
        .iter()
        .filter_map(|record| {
            let kind = stage_object_kind(&record.kind)?;
            Some(UiStageObjectView {
                id: record.id.0.to_string(),
                name: record.name.clone(),
                kind: kind.into(),
                x: record.transform.x_meters,
                y: record.transform.y_meters,
                width: record.transform.width_meters,
                height: record.transform.height_meters,
                rotation: record.transform.rotation_degrees,
                locked: record.locked,
                hidden: record.hidden,
                layer: record.layer.clone(),
                opacity: record.opacity.get(),
            })
        })
        .collect();
    let groups = bundle
        .project
        .groups
        .iter()
        .map(|group| UiGroupView {
            id: group.id.0.to_string(),
            name: group.name.clone(),
            fixture_ids: group
                .fixture_ids
                .iter()
                .map(|fixture_id| fixture_id.0.to_string())
                .collect(),
        })
        .collect();
    let palette = ["#ff9f43", "#4da3ff", "#a970ff", "#ff4d6d", "#48d597"];
    let scenes = bundle
        .project
        .scenes
        .iter()
        .enumerate()
        .map(|(index, scene)| UiSceneView {
            id: scene.id.0.to_string(),
            number: (index + 1).to_string(),
            name: scene.name.clone(),
            color: palette[index % palette.len()].into(),
            active: snapshot.active_scene_ids.contains(&scene.id),
            fade_ms: scene.default_fade_ms,
        })
        .collect();
    let cue_lists = bundle
        .project
        .cue_lists
        .iter()
        .map(|cue_list| UiCueListView {
            id: cue_list.id.0.to_string(),
            name: cue_list.name.clone(),
            entries: cue_list
                .entries
                .iter()
                .map(|entry| UiCueEntryView {
                    number: entry.number.clone(),
                    name: entry.name.clone(),
                    scene_id: entry.scene_id.0.to_string(),
                    fade_ms: entry.fade_ms,
                })
                .collect(),
        })
        .collect();
    let effects = bundle
        .project
        .effects
        .iter()
        .map(|effect| UiEffectView {
            id: effect.id.0.to_string(),
            name: effect.name.clone(),
            template: effect.template,
            target_parameter: effect.target_parameter.as_str().into(),
            amplitude: effect.amplitude.get(),
            offset: effect.offset.get(),
            speed_hz: effect.speed_hz,
            beat_multiplier: effect.beat_multiplier,
            beat_sync: effect.beat_sync,
            spatial_phase: effect.spatial_phase,
            direction: effect.direction,
            blend: effect.blend,
            order: effect.order,
            active: snapshot.active_effect_ids.contains(&effect.id),
        })
        .collect();
    let live_controls = bundle
        .project
        .live_controls
        .iter()
        .map(|control| UiLiveControlView {
            id: control.id.to_string(),
            label: control.label.clone(),
            scene_id: control.scene_id.map(|id| id.0.to_string()),
            effect_id: control.effect_id.map(|id| id.0.to_string()),
            page: control.page,
            position: control.position,
        })
        .collect();
    let fixture_definitions = bundle
        .fixture_definitions
        .iter()
        .map(|definition| UiFixtureDefinitionView {
            id: definition.id.clone(),
            manufacturer: definition.manufacturer.clone(),
            model: definition.model.clone(),
            modes: definition
                .modes
                .iter()
                .map(|mode| UiFixtureModeView {
                    id: mode.id.clone(),
                    name: mode.name.clone(),
                    footprint: mode.footprint,
                })
                .collect(),
        })
        .collect();
    UiProjectView {
        name: bundle.project.name.clone(),
        fixtures,
        stage_objects,
        groups,
        scenes,
        cue_lists,
        effects,
        live_controls,
        fixture_definitions,
        background: background_view(bundle),
        universe_count: bundle.project.universes.len(),
    }
}

fn stage_object_kind(kind: &LayoutObjectKind) -> Option<&'static str> {
    match kind {
        LayoutObjectKind::Truss => Some("truss"),
        LayoutObjectKind::Speaker => Some("speaker"),
        LayoutObjectKind::Stage => Some("stage"),
        LayoutObjectKind::Person => Some("person"),
        LayoutObjectKind::Shape => Some("shape"),
        LayoutObjectKind::Fixture { .. } | LayoutObjectKind::BackgroundImage { .. } => None,
    }
}

fn background_view(bundle: &ProjectBundle) -> Option<UiBackgroundView> {
    bundle.project.layout_objects.iter().find_map(|record| {
        let LayoutObjectKind::BackgroundImage { asset_path } = &record.kind else {
            return None;
        };
        let bytes = bundle.assets.get(asset_path)?;
        let mime = if asset_path.ends_with(".png") {
            "image/png"
        } else if asset_path.ends_with(".jpg") || asset_path.ends_with(".jpeg") {
            "image/jpeg"
        } else {
            return None;
        };
        Some(UiBackgroundView {
            name: record.name.clone(),
            data_url: format!("data:{mime};base64,{}", BASE64_STANDARD.encode(bytes)),
            opacity: record.opacity.get(),
            locked: record.locked,
        })
    })
}

fn engine_view(snapshot: ShowSnapshot, telemetry: EngineTelemetry) -> UiEngineView {
    UiEngineView {
        revision: snapshot.revision,
        operation_mode: snapshot.operation_mode,
        fixture_values: snapshot
            .resolved_values
            .into_iter()
            .map(|(fixture_id, values)| UiFixtureValues {
                fixture_id: fixture_id.0.to_string(),
                parameters: values
                    .into_iter()
                    .map(|(parameter_id, value)| (parameter_id.as_str().into(), value.get()))
                    .collect(),
            })
            .collect(),
        active_scene_ids: snapshot
            .active_scene_ids
            .into_iter()
            .map(|id| id.0.to_string())
            .collect(),
        active_effect_ids: snapshot
            .active_effect_ids
            .into_iter()
            .map(|id| id.0.to_string())
            .collect(),
        cue_runtime: snapshot
            .cue_runtime
            .into_iter()
            .map(|(id, runtime)| UiCueRuntime {
                cue_list_id: id.0.to_string(),
                cursor: runtime.cursor,
                paused: runtime.paused,
            })
            .collect(),
        grand_master: snapshot.grand_master.get(),
        blackout: snapshot.blackout,
        blind: snapshot.blind,
        freeze: snapshot.freeze,
        bpm: snapshot.bpm,
        telemetry,
        connected: true,
    }
}

fn fixture_kind(fixture: &FixtureRecord) -> String {
    if fixture.name.to_ascii_lowercase().contains("strobe") {
        "strobe"
    } else if fixture.definition_id.contains("moving-head") {
        "moving-head"
    } else if fixture.definition_id.contains("par") {
        "par"
    } else {
        "dimmer"
    }
    .into()
}

fn fixture_mode_footprint(bundle: &ProjectBundle, fixture: &FixtureRecord) -> Option<u16> {
    bundle
        .fixture_definitions
        .iter()
        .find(|definition| {
            definition.id == fixture.definition_id
                && definition.revision == fixture.definition_revision
        })
        .and_then(|definition| {
            definition
                .modes
                .iter()
                .find(|mode| mode.id == fixture.mode_id)
        })
        .map(|mode| mode.footprint)
}

fn parameter(
    values: Option<&BTreeMap<ParameterId, NormalizedValue>>,
    id: &str,
    default: f64,
) -> f64 {
    values
        .and_then(|values| values.get(&ParameterId::new(id)))
        .map_or(default, |value| value.get())
}

fn rgb_hex(values: Option<&BTreeMap<ParameterId, NormalizedValue>>) -> String {
    let red = (parameter(values, "color.red", 1.0) * 255.0).round() as u8;
    let green = (parameter(values, "color.green", 1.0) * 255.0).round() as u8;
    let blue = (parameter(values, "color.blue", 1.0) * 255.0).round() as u8;
    format!("#{red:02x}{green:02x}{blue:02x}")
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionRecord {
    address: String,
    auth_token: String,
    project_path: String,
    process_id: u32,
}

struct EngineSession {
    record: SessionRecord,
    #[allow(dead_code)]
    child: Option<Child>,
}

impl EngineSession {
    fn connect_or_spawn(app_data_dir: &Path, project_path: &Path) -> Result<Self, BackendError> {
        let session_path = app_data_dir.join(SESSION_FILE);
        if let Ok(bytes) = fs::read(&session_path)
            && let Ok(record) = serde_json::from_slice::<SessionRecord>(&bytes)
            && record.project_path == project_path.to_string_lossy()
        {
            let session = Self {
                record,
                child: None,
            };
            if session.snapshot().is_ok() {
                return Ok(session);
            }
        }
        Self::spawn(app_data_dir, project_path)
    }

    fn spawn(app_data_dir: &Path, project_path: &Path) -> Result<Self, BackendError> {
        let engine_path = locate_engine_binary()?;
        let auth_token = Uuid::new_v4().simple().to_string();
        let log_path = app_data_dir.join(ENGINE_LOG_FILE);
        let log_file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)?;
        let mut child = ProcessCommand::new(&engine_path)
            .args([
                "serve",
                &project_path.to_string_lossy(),
                &auth_token,
                "127.0.0.1:0",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::from(log_file))
            .spawn()
            .map_err(|source| BackendError::Spawn {
                path: engine_path,
                source,
            })?;
        let stdout = child
            .stdout
            .take()
            .ok_or(BackendError::MissingEngineStdout)?;
        let (sender, receiver) = mpsc::sync_channel(1);
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            let result = reader.read_line(&mut line).map(|_| line);
            let _ = sender.send(result);
        });
        let startup_line = match receiver.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(line)) if !line.trim().is_empty() => line,
            Ok(Ok(_)) => {
                let _ = child.kill();
                return Err(BackendError::EmptyEngineStartup);
            }
            Ok(Err(error)) => {
                let _ = child.kill();
                return Err(error.into());
            }
            Err(_) => {
                let _ = child.kill();
                return Err(BackendError::EngineStartupTimeout);
            }
        };
        let startup: EngineStartup = serde_json::from_str(&startup_line)?;
        if startup.contract_version != IPC_CONTRACT_VERSION {
            let _ = child.kill();
            return Err(BackendError::ContractMismatch(startup.contract_version));
        }
        let record = SessionRecord {
            address: startup.address,
            auth_token,
            project_path: project_path.to_string_lossy().into_owned(),
            process_id: child.id(),
        };
        write_private_session_file(
            &app_data_dir.join(SESSION_FILE),
            &serde_json::to_vec_pretty(&record)?,
        )?;
        Ok(Self {
            record,
            child: Some(child),
        })
    }

    fn request(&self, message: ClientMessage) -> Result<ServerMessage, BackendError> {
        let mut stream = self.connect()?;
        write_message(&mut stream, &message)?;
        read_message(&mut stream)?
            .ok_or_else(|| BackendError::Engine("engine closed the IPC stream".into()))
    }

    fn snapshot(&self) -> Result<(ShowSnapshot, EngineTelemetry), BackendError> {
        match self.request(ClientMessage::RequestSnapshot)? {
            ServerMessage::Snapshot {
                snapshot,
                telemetry,
            } => Ok((snapshot, telemetry)),
            ServerMessage::EngineError { message } => Err(BackendError::Engine(message)),
            other => Err(BackendError::UnexpectedMessage(format!("{other:?}"))),
        }
    }

    fn shutdown(&mut self) -> Result<(), BackendError> {
        match self.request(ClientMessage::Shutdown)? {
            ServerMessage::ShuttingDown => {}
            other => return Err(BackendError::UnexpectedMessage(format!("{other:?}"))),
        }
        if let Some(child) = self.child.as_mut() {
            for _ in 0..50 {
                if child.try_wait()?.is_some() {
                    return Ok(());
                }
                thread::sleep(Duration::from_millis(20));
            }
            return Err(BackendError::Engine(
                "engine did not stop within one second".into(),
            ));
        }
        thread::sleep(Duration::from_millis(40));
        Ok(())
    }

    fn connect(&self) -> Result<TcpStream, BackendError> {
        let address: SocketAddr = self
            .record
            .address
            .parse()
            .map_err(|_| BackendError::InvalidEngineAddress(self.record.address.clone()))?;
        let mut stream = TcpStream::connect_timeout(&address, IPC_TIMEOUT)?;
        stream.set_nodelay(true)?;
        stream.set_read_timeout(Some(IPC_TIMEOUT))?;
        stream.set_write_timeout(Some(IPC_TIMEOUT))?;
        write_message(
            &mut stream,
            &ClientMessage::Hello {
                contract_version: IPC_CONTRACT_VERSION,
                auth_token: self.record.auth_token.clone(),
                client_id: "lighthouse-desktop".into(),
            },
        )?;
        match read_message::<_, ServerMessage>(&mut stream)? {
            Some(ServerMessage::Welcome {
                contract_version, ..
            }) if contract_version == IPC_CONTRACT_VERSION => Ok(stream),
            Some(ServerMessage::AuthenticationRejected) => Err(BackendError::Authentication),
            Some(ServerMessage::ContractRejected { supported_version }) => {
                Err(BackendError::ContractMismatch(supported_version))
            }
            Some(other) => Err(BackendError::UnexpectedMessage(format!("{other:?}"))),
            None => Err(BackendError::Engine(
                "engine closed the IPC stream during handshake".into(),
            )),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EngineStartup {
    address: String,
    contract_version: u16,
}

fn locate_engine_binary() -> Result<PathBuf, BackendError> {
    if let Some(path) = std::env::var_os("LIGHTHOUSE_ENGINE_PATH") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
    }
    let binary_name = format!("lighthouse-show-engine-app{}", std::env::consts::EXE_SUFFIX);
    if let Ok(current_executable) = std::env::current_exe()
        && let Some(directory) = current_executable.parent()
    {
        let sibling = directory.join(&binary_name);
        if sibling.is_file() {
            return Ok(sibling);
        }
    }
    let profile = if cfg!(debug_assertions) {
        "debug"
    } else {
        "release"
    };
    let workspace_binary = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("target")
        .join(profile)
        .join(binary_name);
    if workspace_binary.is_file() {
        return Ok(workspace_binary);
    }
    Err(BackendError::EngineBinaryNotFound(workspace_binary))
}

fn apply_project_command(
    bundle: &mut ProjectBundle,
    command: UiProjectCommand,
    snapshot: Option<&ShowSnapshot>,
) -> Result<bool, BackendError> {
    match command {
        UiProjectCommand::UpdateLayouts { layouts } => {
            for update in layouts {
                if ![
                    update.x,
                    update.y,
                    update.width,
                    update.height,
                    update.rotation,
                ]
                .into_iter()
                .all(f64::is_finite)
                    || update.width <= 0.0
                    || update.height <= 0.0
                {
                    return Err(BackendError::InvalidCommand(
                        "layout transform must contain finite values and positive size".into(),
                    ));
                }
                let fixture_id = FixtureId::new(parse_id(&update.fixture_id)?);
                let layout = bundle
                    .project
                    .layout_objects
                    .iter_mut()
                    .find(|record| {
                        matches!(record.kind, LayoutObjectKind::Fixture { fixture_id: id } if id == fixture_id)
                    })
                    .ok_or_else(|| {
                        BackendError::InvalidCommand(format!(
                            "layout object for fixture {} was not found",
                            update.fixture_id
                        ))
                    })?;
                layout.transform.x_meters = update.x;
                layout.transform.y_meters = update.y;
                layout.transform.width_meters = update.width;
                layout.transform.height_meters = update.height;
                layout.transform.rotation_degrees = update.rotation.rem_euclid(360.0);
                layout.locked = update.locked;
                layout.hidden = update.hidden;
                layout.layer = update.layer.trim().to_owned();
                if layout.layer.is_empty() {
                    layout.layer = "Fixtures".into();
                }
            }
            Ok(false)
        }
        UiProjectCommand::PatchFixture {
            fixture_id,
            universe,
            address,
        } => {
            let fixture_id = FixtureId::new(parse_id(&fixture_id)?);
            if !bundle
                .project
                .fixtures
                .iter()
                .any(|fixture| fixture.id == fixture_id)
            {
                return Err(BackendError::InvalidCommand(
                    "patched fixture was not found".into(),
                ));
            }
            let existing = bundle
                .project
                .patch
                .iter()
                .find(|record| record.fixture_id == fixture_id)
                .copied();
            bundle
                .project
                .patch
                .retain(|record| record.fixture_id != fixture_id);
            if universe == 0 || address == 0 {
                return Ok(true);
            }
            let universe_id = UniverseId::new(universe);
            if !bundle
                .project
                .universes
                .iter()
                .any(|record| record.id == universe_id)
            {
                return Err(BackendError::InvalidCommand(format!(
                    "universe {universe} does not exist"
                )));
            }
            let footprint = existing
                .map(|record| record.footprint)
                .unwrap_or(mode_footprint(bundle, fixture_id)?);
            bundle.project.patch.push(PatchRecord {
                fixture_id,
                universe_id,
                start_address: address,
                footprint,
            });
            Ok(true)
        }
        UiProjectCommand::AddFixture {
            name,
            definition_id,
            mode_id,
            x,
            y,
        } => {
            if !x.is_finite() || !y.is_finite() {
                return Err(BackendError::InvalidCommand(
                    "fixture position must be finite".into(),
                ));
            }
            let definition = bundle
                .fixture_definitions
                .iter()
                .find(|definition| definition.id == definition_id)
                .ok_or_else(|| {
                    BackendError::InvalidCommand("fixture definition was not found".into())
                })?;
            let mode = definition
                .modes
                .iter()
                .find(|mode| mode.id == mode_id)
                .ok_or_else(|| BackendError::InvalidCommand("fixture mode was not found".into()))?;
            let revision = definition.revision.clone();
            let model = definition.model.clone();
            let footprint = mode.footprint;
            let fixture_id = FixtureId::new(Uuid::new_v4().as_u128());
            let (universe_id, start_address) = auto_patch(bundle, footprint)?;
            bundle.project.fixtures.push(FixtureRecord {
                id: fixture_id,
                name: non_empty_name(name, &model),
                definition_id,
                definition_revision: revision,
                mode_id,
                enabled: true,
                invert_pan: false,
                invert_tilt: false,
            });
            bundle.project.patch.push(PatchRecord {
                fixture_id,
                universe_id,
                start_address,
                footprint,
            });
            bundle.project.layout_objects.push(fixture_layout(
                fixture_id,
                bundle.project.fixtures.last().unwrap().name.clone(),
                x,
                y,
                bundle.project.layout_objects.len() as i32,
            ));
            Ok(true)
        }
        UiProjectCommand::DuplicateFixtures { fixture_ids } => {
            let ids = parse_fixture_ids(&fixture_ids)?;
            for source_id in ids {
                let source = bundle
                    .project
                    .fixtures
                    .iter()
                    .find(|fixture| fixture.id == source_id)
                    .cloned()
                    .ok_or_else(|| {
                        BackendError::InvalidCommand("fixture to duplicate was not found".into())
                    })?;
                let source_layout = bundle
                    .project
                    .layout_objects
                    .iter()
                    .find(|record| matches!(record.kind, LayoutObjectKind::Fixture { fixture_id } if fixture_id == source_id))
                    .cloned();
                let footprint = mode_footprint(bundle, source_id)?;
                let (universe_id, start_address) = auto_patch(bundle, footprint)?;
                let fixture_id = FixtureId::new(Uuid::new_v4().as_u128());
                let mut duplicate = source;
                duplicate.id = fixture_id;
                duplicate.name = format!("{} Copy", duplicate.name);
                bundle.project.fixtures.push(duplicate.clone());
                bundle.project.patch.push(PatchRecord {
                    fixture_id,
                    universe_id,
                    start_address,
                    footprint,
                });
                let mut layout = source_layout.unwrap_or_else(|| {
                    fixture_layout(fixture_id, duplicate.name.clone(), 0.0, 0.0, 0)
                });
                layout.id = LayoutObjectId::new(Uuid::new_v4().as_u128());
                layout.name = duplicate.name;
                layout.kind = LayoutObjectKind::Fixture { fixture_id };
                layout.transform.x_meters += 0.6;
                layout.transform.y_meters += 0.6;
                layout.transform.z_index = bundle.project.layout_objects.len() as i32;
                bundle.project.layout_objects.push(layout);
            }
            Ok(true)
        }
        UiProjectCommand::DeleteFixtures { fixture_ids } => {
            let ids = parse_fixture_ids(&fixture_ids)?;
            bundle
                .project
                .fixtures
                .retain(|fixture| !ids.contains(&fixture.id));
            bundle
                .project
                .patch
                .retain(|patch| !ids.contains(&patch.fixture_id));
            bundle.project.layout_objects.retain(|layout| {
                !matches!(layout.kind, LayoutObjectKind::Fixture { fixture_id } if ids.contains(&fixture_id))
            });
            for group in &mut bundle.project.groups {
                group
                    .fixture_ids
                    .retain(|fixture_id| !ids.contains(fixture_id));
            }
            for scene in &mut bundle.project.scenes {
                scene
                    .values
                    .retain(|fixture_id, _| !ids.contains(fixture_id));
            }
            Ok(true)
        }
        UiProjectCommand::AddUniverse => {
            add_universe(bundle);
            Ok(false)
        }
        UiProjectCommand::AddStageObject { kind, name, x, y } => {
            if !x.is_finite() || !y.is_finite() {
                return Err(BackendError::InvalidCommand(
                    "stage object position must be finite".into(),
                ));
            }
            let (kind, fallback_name, width, height) = new_stage_object(&kind)?;
            bundle.project.layout_objects.push(LayoutObjectRecord {
                id: LayoutObjectId::new(Uuid::new_v4().as_u128()),
                name: non_empty_name(name, fallback_name),
                kind,
                transform: LayoutTransform {
                    x_meters: x,
                    y_meters: y,
                    width_meters: width,
                    height_meters: height,
                    rotation_degrees: 0.0,
                    z_index: bundle.project.layout_objects.len() as i32,
                },
                layer: "Stage Objects".into(),
                locked: false,
                hidden: false,
                opacity: NormalizedValue::FULL,
            });
            Ok(false)
        }
        UiProjectCommand::UpdateStageObjects { objects } => {
            for update in objects {
                validate_stage_object_update(&update)?;
                let object_id = LayoutObjectId::new(parse_id(&update.object_id)?);
                let record = bundle
                    .project
                    .layout_objects
                    .iter_mut()
                    .find(|record| {
                        record.id == object_id && stage_object_kind(&record.kind).is_some()
                    })
                    .ok_or_else(|| {
                        BackendError::InvalidCommand("stage object was not found".into())
                    })?;
                record.name = non_empty_name(update.name, "Stage Object");
                record.transform.x_meters = update.x;
                record.transform.y_meters = update.y;
                record.transform.width_meters = update.width;
                record.transform.height_meters = update.height;
                record.transform.rotation_degrees = update.rotation.rem_euclid(360.0);
                record.locked = update.locked;
                record.hidden = update.hidden;
                record.layer = non_empty_name(update.layer, "Stage Objects");
                record.opacity = NormalizedValue::new(update.opacity).map_err(|_| {
                    BackendError::InvalidCommand(
                        "stage object opacity must be between 0 and 1".into(),
                    )
                })?;
            }
            Ok(false)
        }
        UiProjectCommand::DuplicateStageObjects { object_ids } => {
            for value in object_ids {
                let object_id = LayoutObjectId::new(parse_id(&value)?);
                let source = bundle
                    .project
                    .layout_objects
                    .iter()
                    .find(|record| {
                        record.id == object_id && stage_object_kind(&record.kind).is_some()
                    })
                    .cloned()
                    .ok_or_else(|| {
                        BackendError::InvalidCommand(
                            "stage object to duplicate was not found".into(),
                        )
                    })?;
                let mut duplicate = source;
                duplicate.id = LayoutObjectId::new(Uuid::new_v4().as_u128());
                duplicate.name = format!("{} Copy", duplicate.name);
                duplicate.transform.x_meters += 0.6;
                duplicate.transform.y_meters += 0.6;
                duplicate.transform.z_index = bundle.project.layout_objects.len() as i32;
                bundle.project.layout_objects.push(duplicate);
            }
            Ok(false)
        }
        UiProjectCommand::DeleteStageObjects { object_ids } => {
            let ids = object_ids
                .iter()
                .map(|value| parse_id(value).map(LayoutObjectId::new))
                .collect::<Result<Vec<_>, _>>()?;
            bundle.project.layout_objects.retain(|record| {
                !ids.contains(&record.id) || stage_object_kind(&record.kind).is_none()
            });
            Ok(false)
        }
        UiProjectCommand::PutGroup {
            group_id,
            name,
            fixture_ids,
        } => {
            let fixture_ids = validated_fixture_ids(bundle, &fixture_ids, false)?;
            let name = non_empty_name(name, "Fixture Group");
            if let Some(group_id) = group_id {
                let group_id = GroupId::new(parse_id(&group_id)?);
                let group = bundle
                    .project
                    .groups
                    .iter_mut()
                    .find(|group| group.id == group_id)
                    .ok_or_else(|| {
                        BackendError::InvalidCommand("fixture group was not found".into())
                    })?;
                group.name = name;
                group.fixture_ids = fixture_ids;
            } else {
                bundle.project.groups.push(GroupRecord {
                    id: GroupId::new(Uuid::new_v4().as_u128()),
                    name,
                    fixture_ids,
                });
            }
            Ok(false)
        }
        UiProjectCommand::DeleteGroup { group_id } => {
            let group_id = GroupId::new(parse_id(&group_id)?);
            let before = bundle.project.groups.len();
            bundle.project.groups.retain(|group| group.id != group_id);
            if bundle.project.groups.len() == before {
                return Err(BackendError::InvalidCommand(
                    "fixture group was not found".into(),
                ));
            }
            Ok(false)
        }
        UiProjectCommand::CaptureScene {
            name,
            fixture_ids,
            fade_ms,
        } => {
            validate_fade(fade_ms)?;
            let snapshot = snapshot.ok_or_else(|| {
                BackendError::InvalidCommand("scene capture requires the running show state".into())
            })?;
            let fixture_ids = validated_fixture_ids(bundle, &fixture_ids, true)?;
            let mut capture_values = snapshot.resolved_values.clone();
            if snapshot.blind {
                for (fixture_id, parameters) in &snapshot.blind_values {
                    capture_values
                        .entry(*fixture_id)
                        .or_default()
                        .extend(parameters.clone());
                }
            }
            let values = fixture_ids
                .into_iter()
                .filter_map(|fixture_id| {
                    capture_values
                        .get(&fixture_id)
                        .cloned()
                        .map(|values| (fixture_id, values))
                })
                .collect();
            let fallback = format!("Scene {}", bundle.project.scenes.len() + 1);
            bundle.project.scenes.push(SceneData {
                id: SceneId::new(Uuid::new_v4().as_u128()),
                name: non_empty_name(name, &fallback),
                values,
                default_fade_ms: fade_ms,
            });
            Ok(true)
        }
        UiProjectCommand::UpdateScene {
            scene_id,
            name,
            fade_ms,
        } => {
            validate_fade(fade_ms)?;
            let scene_id = SceneId::new(parse_id(&scene_id)?);
            let scene = bundle
                .project
                .scenes
                .iter_mut()
                .find(|scene| scene.id == scene_id)
                .ok_or_else(|| BackendError::InvalidCommand("scene was not found".into()))?;
            scene.name = non_empty_name(name, "Scene");
            scene.default_fade_ms = fade_ms;
            Ok(true)
        }
        UiProjectCommand::DeleteScene { scene_id } => {
            let scene_id = SceneId::new(parse_id(&scene_id)?);
            let before = bundle.project.scenes.len();
            bundle.project.scenes.retain(|scene| scene.id != scene_id);
            if bundle.project.scenes.len() == before {
                return Err(BackendError::InvalidCommand("scene was not found".into()));
            }
            for cue_list in &mut bundle.project.cue_lists {
                cue_list.entries.retain(|entry| entry.scene_id != scene_id);
                renumber_cues(cue_list);
            }
            bundle
                .project
                .live_controls
                .retain(|control| control.scene_id != Some(scene_id));
            Ok(true)
        }
        UiProjectCommand::AddCue {
            cue_list_id,
            scene_id,
        } => {
            let scene_id = SceneId::new(parse_id(&scene_id)?);
            let scene_name = bundle
                .project
                .scenes
                .iter()
                .find(|scene| scene.id == scene_id)
                .map(|scene| scene.name.clone())
                .ok_or_else(|| BackendError::InvalidCommand("cue scene was not found".into()))?;
            let cue_list_id = if let Some(value) = cue_list_id {
                CueListId::new(parse_id(&value)?)
            } else if let Some(cue_list) = bundle.project.cue_lists.first() {
                cue_list.id
            } else {
                let id = CueListId::new(Uuid::new_v4().as_u128());
                bundle.project.cue_lists.push(CueListData {
                    id,
                    name: "Main Show".into(),
                    entries: Vec::new(),
                });
                id
            };
            let cue_list = bundle
                .project
                .cue_lists
                .iter_mut()
                .find(|cue_list| cue_list.id == cue_list_id)
                .ok_or_else(|| BackendError::InvalidCommand("cue list was not found".into()))?;
            cue_list.entries.push(CueEntryData {
                number: (cue_list.entries.len() + 1).to_string(),
                name: scene_name,
                scene_id,
                fade_ms: None,
            });
            Ok(true)
        }
        UiProjectCommand::DeleteCue { cue_list_id, index } => {
            let cue_list_id = CueListId::new(parse_id(&cue_list_id)?);
            let cue_list = bundle
                .project
                .cue_lists
                .iter_mut()
                .find(|cue_list| cue_list.id == cue_list_id)
                .ok_or_else(|| BackendError::InvalidCommand("cue list was not found".into()))?;
            if index >= cue_list.entries.len() {
                return Err(BackendError::InvalidCommand("cue was not found".into()));
            }
            cue_list.entries.remove(index);
            renumber_cues(cue_list);
            Ok(true)
        }
        UiProjectCommand::PutEffect {
            effect_id,
            name,
            template,
            target_parameter,
            amplitude,
            offset,
            speed_hz,
            beat_multiplier,
            beat_sync,
            spatial_phase,
            direction,
            blend,
            order,
        } => {
            let target_parameter = target_parameter.trim();
            if target_parameter.is_empty() {
                return Err(BackendError::InvalidCommand(
                    "effect target parameter cannot be empty".into(),
                ));
            }
            let (effect_id, seed, existing_index) = if let Some(value) = effect_id {
                let effect_id = EffectId::new(parse_id(&value)?);
                let index = bundle
                    .project
                    .effects
                    .iter()
                    .position(|effect| effect.id == effect_id)
                    .ok_or_else(|| BackendError::InvalidCommand("effect was not found".into()))?;
                (effect_id, bundle.project.effects[index].seed, Some(index))
            } else {
                let raw = Uuid::new_v4().as_u128();
                (EffectId::new(raw), raw as u64, None)
            };
            let definition = EffectDefinition {
                id: effect_id,
                name: non_empty_name(name, "Effect"),
                target_parameter: ParameterId::new(target_parameter),
                template,
                amplitude: NormalizedValue::new(amplitude)
                    .map_err(|error| BackendError::InvalidCommand(error.to_string()))?,
                offset: NormalizedValue::new(offset)
                    .map_err(|error| BackendError::InvalidCommand(error.to_string()))?,
                speed_hz,
                beat_multiplier,
                beat_sync,
                spatial_phase,
                direction,
                blend,
                order,
                seed,
            };
            definition
                .validate()
                .map_err(|error| BackendError::InvalidCommand(error.to_string()))?;
            if let Some(index) = existing_index {
                bundle.project.effects[index] = definition;
            } else {
                bundle.project.effects.push(definition);
            }
            Ok(true)
        }
        UiProjectCommand::DeleteEffect { effect_id } => {
            let effect_id = EffectId::new(parse_id(&effect_id)?);
            let before = bundle.project.effects.len();
            bundle
                .project
                .effects
                .retain(|effect| effect.id != effect_id);
            if bundle.project.effects.len() == before {
                return Err(BackendError::InvalidCommand("effect was not found".into()));
            }
            bundle
                .project
                .live_controls
                .retain(|control| control.effect_id != Some(effect_id));
            Ok(true)
        }
        UiProjectCommand::PutLiveControl {
            control_id,
            label,
            scene_id,
            effect_id,
            page,
            position,
        } => {
            if page == 0 {
                return Err(BackendError::InvalidCommand(
                    "live control page starts at 1".into(),
                ));
            }
            let scene_id = scene_id
                .as_deref()
                .map(parse_id)
                .transpose()?
                .map(SceneId::new);
            let effect_id = effect_id
                .as_deref()
                .map(parse_id)
                .transpose()?
                .map(EffectId::new);
            if scene_id.is_some() == effect_id.is_some() {
                return Err(BackendError::InvalidCommand(
                    "live control must reference exactly one scene or effect".into(),
                ));
            }
            if scene_id.is_some_and(|id| !bundle.project.scenes.iter().any(|scene| scene.id == id))
                || effect_id
                    .is_some_and(|id| !bundle.project.effects.iter().any(|effect| effect.id == id))
            {
                return Err(BackendError::InvalidCommand(
                    "live control target was not found".into(),
                ));
            }
            let record = LiveControlRecord {
                id: control_id
                    .as_deref()
                    .map(parse_id)
                    .transpose()?
                    .unwrap_or_else(|| Uuid::new_v4().as_u128()),
                label: non_empty_name(label, "Live Control"),
                scene_id,
                effect_id,
                page,
                position,
            };
            if let Some(index) = bundle
                .project
                .live_controls
                .iter()
                .position(|control| control.id == record.id)
            {
                bundle.project.live_controls[index] = record;
            } else {
                bundle.project.live_controls.push(record);
            }
            Ok(false)
        }
        UiProjectCommand::DeleteLiveControl { control_id } => {
            let control_id = parse_id(&control_id)?;
            let before = bundle.project.live_controls.len();
            bundle
                .project
                .live_controls
                .retain(|control| control.id != control_id);
            if bundle.project.live_controls.len() == before {
                return Err(BackendError::InvalidCommand(
                    "live control was not found".into(),
                ));
            }
            Ok(false)
        }
        UiProjectCommand::PutBackground { name, mime, bytes } => {
            if bytes.len() > 12 * 1024 * 1024 {
                return Err(BackendError::InvalidCommand(
                    "floor plan image must be 12 MB or smaller".into(),
                ));
            }
            let extension = validated_image_extension(&mime, &bytes)?;
            remove_background(bundle);
            let asset_path = format!("assets/floor-plan.{extension}");
            bundle.assets.insert(asset_path.clone(), bytes);
            bundle.project.layout_objects.push(LayoutObjectRecord {
                id: LayoutObjectId::new(Uuid::new_v4().as_u128()),
                name: non_empty_name(name, "Floor Plan"),
                kind: LayoutObjectKind::BackgroundImage { asset_path },
                transform: LayoutTransform {
                    x_meters: 0.0,
                    y_meters: 0.0,
                    width_meters: 10.0,
                    height_meters: 10.0,
                    rotation_degrees: 0.0,
                    z_index: i32::MIN,
                },
                layer: "Floor Plan".into(),
                locked: true,
                hidden: false,
                opacity: NormalizedValue::clamped(0.55),
            });
            Ok(false)
        }
        UiProjectCommand::RemoveBackground => {
            remove_background(bundle);
            Ok(false)
        }
    }
}

fn validated_image_extension(mime: &str, bytes: &[u8]) -> Result<&'static str, BackendError> {
    match mime {
        "image/png" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => Ok("png"),
        "image/jpeg" if bytes.starts_with(&[0xff, 0xd8, 0xff]) => Ok("jpg"),
        "image/png" | "image/jpeg" => Err(BackendError::InvalidCommand(
            "floor plan contents do not match the selected image type".into(),
        )),
        _ => Err(BackendError::InvalidCommand(
            "floor plan must be a PNG or JPEG image".into(),
        )),
    }
}

fn remove_background(bundle: &mut ProjectBundle) {
    let paths: Vec<_> = bundle
        .project
        .layout_objects
        .iter()
        .filter_map(|record| match &record.kind {
            LayoutObjectKind::BackgroundImage { asset_path } => Some(asset_path.clone()),
            _ => None,
        })
        .collect();
    bundle
        .project
        .layout_objects
        .retain(|record| !matches!(&record.kind, LayoutObjectKind::BackgroundImage { .. }));
    for path in paths {
        bundle.assets.remove(&path);
    }
}

fn new_stage_object(
    value: &str,
) -> Result<(LayoutObjectKind, &'static str, f64, f64), BackendError> {
    match value {
        "truss" => Ok((LayoutObjectKind::Truss, "Truss", 4.0, 0.35)),
        "speaker" => Ok((LayoutObjectKind::Speaker, "Speaker", 0.7, 0.7)),
        "stage" => Ok((LayoutObjectKind::Stage, "Stage", 4.0, 3.0)),
        "person" => Ok((LayoutObjectKind::Person, "Person", 0.55, 0.55)),
        "shape" => Ok((LayoutObjectKind::Shape, "Shape", 1.0, 1.0)),
        _ => Err(BackendError::InvalidCommand(format!(
            "unsupported stage object kind {value}"
        ))),
    }
}

fn validate_stage_object_update(update: &UiStageObjectUpdate) -> Result<(), BackendError> {
    if ![
        update.x,
        update.y,
        update.width,
        update.height,
        update.rotation,
        update.opacity,
    ]
    .into_iter()
    .all(f64::is_finite)
        || update.width <= 0.0
        || update.height <= 0.0
    {
        return Err(BackendError::InvalidCommand(
            "stage object transform must contain finite values and positive size".into(),
        ));
    }
    Ok(())
}

fn validated_fixture_ids(
    bundle: &ProjectBundle,
    values: &[String],
    default_to_all: bool,
) -> Result<Vec<FixtureId>, BackendError> {
    let ids = if values.is_empty() && default_to_all {
        bundle
            .project
            .fixtures
            .iter()
            .map(|fixture| fixture.id)
            .collect()
    } else {
        parse_fixture_ids(values)?
    };
    if ids.is_empty() {
        return Err(BackendError::InvalidCommand(
            "select at least one fixture".into(),
        ));
    }
    if ids.iter().any(|fixture_id| {
        !bundle
            .project
            .fixtures
            .iter()
            .any(|fixture| fixture.id == *fixture_id)
    }) {
        return Err(BackendError::InvalidCommand(
            "fixture selection contains an unknown fixture".into(),
        ));
    }
    let mut unique = Vec::new();
    for fixture_id in ids {
        if !unique.contains(&fixture_id) {
            unique.push(fixture_id);
        }
    }
    Ok(unique)
}

fn effect_layout_positions(
    bundle: &ProjectBundle,
    fixture_ids: &[FixtureId],
) -> BTreeMap<FixtureId, (f64, f64)> {
    bundle
        .project
        .layout_objects
        .iter()
        .filter_map(|record| {
            let LayoutObjectKind::Fixture { fixture_id } = record.kind else {
                return None;
            };
            fixture_ids.contains(&fixture_id).then_some((
                fixture_id,
                (record.transform.x_meters, record.transform.y_meters),
            ))
        })
        .collect()
}

fn normalized_rgb(values: [f64; 3]) -> Result<[NormalizedValue; 3], BackendError> {
    let channel = |value| {
        NormalizedValue::new(value).map_err(|error| BackendError::InvalidCommand(error.to_string()))
    };
    Ok([
        channel(values[0])?,
        channel(values[1])?,
        channel(values[2])?,
    ])
}

fn validate_fade(fade_ms: u64) -> Result<(), BackendError> {
    if fade_ms > 10 * 60 * 1_000 {
        return Err(BackendError::InvalidCommand(
            "scene fade must be ten minutes or shorter".into(),
        ));
    }
    Ok(())
}

fn renumber_cues(cue_list: &mut CueListData) {
    for (index, entry) in cue_list.entries.iter_mut().enumerate() {
        entry.number = (index + 1).to_string();
    }
}

fn parse_fixture_ids(values: &[String]) -> Result<Vec<FixtureId>, BackendError> {
    values
        .iter()
        .map(|value| parse_id(value).map(FixtureId::new))
        .collect()
}

fn non_empty_name(value: String, fallback: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        fallback.into()
    } else {
        value.into()
    }
}

fn fixture_layout(
    fixture_id: FixtureId,
    name: String,
    x: f64,
    y: f64,
    z_index: i32,
) -> LayoutObjectRecord {
    LayoutObjectRecord {
        id: LayoutObjectId::new(Uuid::new_v4().as_u128()),
        name,
        kind: LayoutObjectKind::Fixture { fixture_id },
        transform: LayoutTransform {
            x_meters: x,
            y_meters: y,
            width_meters: 0.65,
            height_meters: 0.65,
            rotation_degrees: 0.0,
            z_index,
        },
        layer: "Fixtures".into(),
        locked: false,
        hidden: false,
        opacity: NormalizedValue::FULL,
    }
}

fn mode_footprint(bundle: &ProjectBundle, fixture_id: FixtureId) -> Result<u16, BackendError> {
    let fixture = bundle
        .project
        .fixtures
        .iter()
        .find(|fixture| fixture.id == fixture_id)
        .ok_or_else(|| BackendError::InvalidCommand("fixture was not found".into()))?;
    bundle
        .fixture_definitions
        .iter()
        .find(|definition| {
            definition.id == fixture.definition_id
                && definition.revision == fixture.definition_revision
        })
        .and_then(|definition| {
            definition
                .modes
                .iter()
                .find(|mode| mode.id == fixture.mode_id)
        })
        .map(|mode| mode.footprint)
        .ok_or_else(|| BackendError::InvalidCommand("fixture mode was not found".into()))
}

fn auto_patch(
    bundle: &mut ProjectBundle,
    footprint: u16,
) -> Result<(UniverseId, u16), BackendError> {
    let mut universes: Vec<_> = bundle
        .project
        .universes
        .iter()
        .map(|record| record.id)
        .collect();
    universes.sort_unstable();
    for universe_id in universes {
        for address in 1..=513_u16.saturating_sub(footprint) {
            if slots_available(bundle, universe_id, address, footprint) {
                return Ok((universe_id, address));
            }
        }
    }
    let universe_id = add_universe(bundle);
    Ok((universe_id, 1))
}

fn slots_available(
    bundle: &ProjectBundle,
    universe_id: UniverseId,
    address: u16,
    footprint: u16,
) -> bool {
    let end = address.saturating_add(footprint.saturating_sub(1));
    end <= 512
        && bundle.project.patch.iter().all(|record| {
            if record.universe_id != universe_id {
                return true;
            }
            let record_end = record
                .start_address
                .saturating_add(record.footprint.saturating_sub(1));
            end < record.start_address || address > record_end
        })
}

fn add_universe(bundle: &mut ProjectBundle) -> UniverseId {
    let next = bundle
        .project
        .universes
        .iter()
        .map(|record| record.id.0)
        .max()
        .unwrap_or(0)
        .saturating_add(1);
    let id = UniverseId::new(next);
    bundle.project.universes.push(UniverseRecord {
        id,
        name: format!("Universe {next}"),
        enabled: true,
        routes: Vec::new(),
    });
    id
}

fn parse_id(value: &str) -> Result<u128, BackendError> {
    value
        .parse()
        .map_err(|_| BackendError::InvalidCommand(format!("invalid object id {value}")))
}

fn write_private_session_file(path: &Path, contents: &[u8]) -> Result<(), BackendError> {
    fs::write(path, contents)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

fn demo_project() -> Result<ProjectBundle, BackendError> {
    let project_id = ProjectId::new(1);
    let mut bundle = ProjectBundle::empty(project_id, "Main Stage — Demo");
    bundle.fixture_definitions = FixtureLibrary::with_generic_pack()?
        .iter()
        .cloned()
        .collect();
    bundle.project.universes = vec![UniverseRecord {
        id: UniverseId::new(1),
        name: "Universe 1".into(),
        enabled: true,
        routes: vec![OutputRouteRecord::ArtNet {
            port_address: 0,
            destination: "127.0.0.1:6454".into(),
            interface: None,
            broadcast: false,
        }],
    }];
    let fixture_specs = [
        (
            101,
            "Front PAR L",
            "generic.rgbw-par",
            "5ch",
            1,
            5,
            -4.2,
            -2.6,
        ),
        (
            102,
            "Front PAR R",
            "generic.rgbw-par",
            "5ch",
            6,
            5,
            4.2,
            -2.6,
        ),
        (
            103,
            "Wash Left",
            "generic.moving-head-16bit",
            "10ch",
            11,
            10,
            -5.5,
            1.2,
        ),
        (
            104,
            "Wash Right",
            "generic.moving-head-16bit",
            "10ch",
            21,
            10,
            5.5,
            1.2,
        ),
        (
            105,
            "Back Center",
            "generic.moving-head-16bit",
            "10ch",
            31,
            10,
            0.0,
            4.2,
        ),
        (106, "Strobe", "generic.dimmer", "1ch", 41, 1, 0.0, -0.2),
    ];
    for (index, (id, name, definition_id, mode_id, address, footprint, x, y)) in
        fixture_specs.into_iter().enumerate()
    {
        let fixture_id = FixtureId::new(id);
        bundle.project.fixtures.push(FixtureRecord {
            id: fixture_id,
            name: name.into(),
            definition_id: definition_id.into(),
            definition_revision: "1".into(),
            mode_id: mode_id.into(),
            enabled: true,
            invert_pan: false,
            invert_tilt: false,
        });
        bundle.project.patch.push(PatchRecord {
            fixture_id,
            universe_id: UniverseId::new(1),
            start_address: address,
            footprint,
        });
        bundle.project.layout_objects.push(LayoutObjectRecord {
            id: LayoutObjectId::new(1001 + index as u128),
            name: name.into(),
            kind: LayoutObjectKind::Fixture { fixture_id },
            transform: LayoutTransform {
                x_meters: x,
                y_meters: y,
                width_meters: 0.65,
                height_meters: 0.65,
                rotation_degrees: 0.0,
                z_index: index as i32,
            },
            layer: "Fixtures".into(),
            locked: false,
            hidden: false,
            opacity: NormalizedValue::FULL,
        });
    }

    bundle.project.scenes = vec![
        scene(201, "Warm Welcome", 1_200, 0.72, (1.0, 0.48, 0.16)),
        scene(202, "Blue Air", 1_800, 0.64, (0.08, 0.35, 1.0)),
        scene(203, "Violet Motion", 900, 0.78, (0.55, 0.16, 1.0)),
        scene(204, "Full Energy", 300, 1.0, (1.0, 0.92, 0.82)),
    ];
    bundle.project.cue_lists = vec![CueListData {
        id: CueListId::new(301),
        name: "Main Show".into(),
        entries: bundle
            .project
            .scenes
            .iter()
            .enumerate()
            .map(|(index, scene)| CueEntryData {
                number: (index + 1).to_string(),
                name: scene.name.clone(),
                scene_id: scene.id,
                fade_ms: None,
            })
            .collect(),
    }];
    bundle.project.effects = vec![
        effect(
            401,
            "Intensity Chase",
            EffectTemplate::Chase,
            "intensity",
            true,
        ),
        effect(
            402,
            "Stage Wave",
            EffectTemplate::SineWave,
            "intensity",
            true,
        ),
        effect(
            403,
            "Pan Sweep",
            EffectTemplate::PanSweep,
            "position.pan",
            false,
        ),
        effect(
            404,
            "Candle Flicker",
            EffectTemplate::FireCandleFlicker,
            "intensity",
            false,
        ),
    ];
    bundle.project.live_controls = bundle
        .project
        .scenes
        .iter()
        .enumerate()
        .map(|(index, scene)| LiveControlRecord {
            id: 500 + index as u128,
            label: scene.name.clone(),
            scene_id: Some(scene.id),
            effect_id: None,
            page: 1,
            position: index as u16,
        })
        .collect();
    bundle.validate()?;
    Ok(bundle)
}

fn scene(id: u128, name: &str, fade_ms: u64, intensity: f64, rgb: (f64, f64, f64)) -> SceneData {
    let mut values = FixtureParameterValues::new();
    for fixture_id in 101..=106 {
        values
            .entry(FixtureId::new(fixture_id))
            .or_default()
            .insert(
                ParameterId::new("intensity"),
                NormalizedValue::clamped(intensity),
            );
    }
    for fixture_id in 101..=105 {
        let fixture_values = values.entry(FixtureId::new(fixture_id)).or_default();
        fixture_values.insert(
            ParameterId::new("color.red"),
            NormalizedValue::clamped(rgb.0),
        );
        fixture_values.insert(
            ParameterId::new("color.green"),
            NormalizedValue::clamped(rgb.1),
        );
        fixture_values.insert(
            ParameterId::new("color.blue"),
            NormalizedValue::clamped(rgb.2),
        );
    }
    SceneData {
        id: SceneId::new(id),
        name: name.into(),
        values,
        default_fade_ms: fade_ms,
    }
}

fn effect(
    id: u128,
    name: &str,
    template: EffectTemplate,
    target_parameter: &str,
    beat_sync: bool,
) -> EffectDefinition {
    EffectDefinition {
        id: EffectId::new(id),
        name: name.into(),
        target_parameter: ParameterId::new(target_parameter),
        template,
        amplitude: NormalizedValue::clamped(0.75),
        offset: NormalizedValue::clamped(0.15),
        speed_hz: 1.0,
        beat_multiplier: 1.0,
        beat_sync,
        spatial_phase: 1.0,
        direction: EffectDirection::Forward,
        blend: EffectBlend::Replace,
        order: EffectOrder::LayoutX,
        seed: id as u64,
    }
}

#[derive(Debug)]
pub enum BackendError {
    Io(std::io::Error),
    Json(serde_json::Error),
    Ipc(lighthouse_ipc::IpcError),
    Persistence(lighthouse_persistence::PersistenceError),
    FixtureLibrary(lighthouse_fixture_library::FixtureLibraryError),
    Engine(String),
    InvalidCommand(String),
    CommandRejected(String),
    Authentication,
    ContractMismatch(u16),
    InvalidEngineAddress(String),
    UnexpectedMessage(String),
    EngineBinaryNotFound(PathBuf),
    Spawn {
        path: PathBuf,
        source: std::io::Error,
    },
    MissingEngineStdout,
    EmptyEngineStartup,
    EngineStartupTimeout,
}

impl Display for BackendError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "desktop I/O failed: {error}"),
            Self::Json(error) => write!(formatter, "desktop JSON failed: {error}"),
            Self::Ipc(error) => write!(formatter, "engine IPC failed: {error}"),
            Self::Persistence(error) => write!(formatter, "project failed: {error}"),
            Self::FixtureLibrary(error) => write!(formatter, "fixture library failed: {error}"),
            Self::Engine(message) => write!(formatter, "engine failed: {message}"),
            Self::InvalidCommand(message) => write!(formatter, "invalid command: {message}"),
            Self::CommandRejected(message) => write!(formatter, "command rejected: {message}"),
            Self::Authentication => formatter.write_str("engine authentication was rejected"),
            Self::ContractMismatch(version) => {
                write!(formatter, "engine IPC contract {version} is not supported")
            }
            Self::InvalidEngineAddress(address) => {
                write!(formatter, "invalid engine address {address}")
            }
            Self::UnexpectedMessage(message) => {
                write!(formatter, "unexpected engine response: {message}")
            }
            Self::EngineBinaryNotFound(path) => write!(
                formatter,
                "engine executable was not found at {}",
                path.display()
            ),
            Self::Spawn { path, source } => write!(
                formatter,
                "could not start engine {}: {source}",
                path.display()
            ),
            Self::MissingEngineStdout => {
                formatter.write_str("engine startup channel is unavailable")
            }
            Self::EmptyEngineStartup => {
                formatter.write_str("engine exited before announcing its IPC address")
            }
            Self::EngineStartupTimeout => {
                formatter.write_str("engine did not start within five seconds")
            }
        }
    }
}

impl Error for BackendError {}

impl From<std::io::Error> for BackendError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<serde_json::Error> for BackendError {
    fn from(value: serde_json::Error) -> Self {
        Self::Json(value)
    }
}

impl From<lighthouse_ipc::IpcError> for BackendError {
    fn from(value: lighthouse_ipc::IpcError) -> Self {
        Self::Ipc(value)
    }
}

impl From<lighthouse_persistence::PersistenceError> for BackendError {
    fn from(value: lighthouse_persistence::PersistenceError) -> Self {
        Self::Persistence(value)
    }
}

impl From<lighthouse_fixture_library::FixtureLibraryError> for BackendError {
    fn from(value: lighthouse_fixture_library::FixtureLibraryError) -> Self {
        Self::FixtureLibrary(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory() -> PathBuf {
        std::env::temp_dir().join(format!("lighthouse-desktop-test-{}", Uuid::new_v4()))
    }

    #[test]
    fn demo_project_is_valid_and_ready_for_the_engine() {
        let bundle = demo_project().unwrap();
        assert_eq!(bundle.project.fixtures.len(), 6);
        assert_eq!(bundle.project.scenes.len(), 4);
        assert_eq!(bundle.project.effects.len(), 4);
        assert!(bundle.validate().is_ok());
    }

    #[test]
    fn ui_commands_reject_values_outside_normalized_range() {
        let command = UiEngineCommand::SetGrandMaster { value: 1.2 };
        let bundle = demo_project().unwrap();
        assert!(matches!(
            command.into_domain(&bundle),
            Err(BackendError::InvalidCommand(_))
        ));
    }

    #[test]
    fn project_editor_auto_patches_and_validates_new_fixtures() {
        let mut bundle = demo_project().unwrap();
        let restart = apply_project_command(
            &mut bundle,
            UiProjectCommand::AddFixture {
                name: "House Dimmer".into(),
                definition_id: "generic.dimmer".into(),
                mode_id: "1ch".into(),
                x: 2.0,
                y: 3.0,
            },
            None,
        )
        .unwrap();
        assert!(restart);
        assert_eq!(bundle.project.fixtures.len(), 7);
        assert_eq!(bundle.project.patch.len(), 7);
        assert!(bundle.validate().is_ok());
        let patch = bundle.project.patch.last().unwrap();
        assert_eq!(patch.universe_id, UniverseId::new(1));
        assert_eq!(patch.start_address, 42);
    }

    #[test]
    fn project_editor_rejects_patch_conflicts_before_save() {
        let mut bundle = demo_project().unwrap();
        apply_project_command(
            &mut bundle,
            UiProjectCommand::PatchFixture {
                fixture_id: "102".into(),
                universe: 1,
                address: 1,
            },
            None,
        )
        .unwrap();
        assert!(bundle.validate().is_err());
    }

    #[test]
    fn layout_updates_are_persistent_without_engine_restart() {
        let mut bundle = demo_project().unwrap();
        let restart = apply_project_command(
            &mut bundle,
            UiProjectCommand::UpdateLayouts {
                layouts: vec![UiLayoutUpdate {
                    fixture_id: "101".into(),
                    x: 8.0,
                    y: -2.0,
                    width: 1.2,
                    height: 0.8,
                    rotation: 450.0,
                    locked: true,
                    hidden: false,
                    layer: "Front Truss".into(),
                }],
            },
            None,
        )
        .unwrap();
        assert!(!restart);
        let layout = &bundle.project.layout_objects[0];
        assert_eq!(layout.transform.x_meters, 8.0);
        assert_eq!(layout.transform.rotation_degrees, 90.0);
        assert_eq!(layout.layer, "Front Truss");
        assert!(layout.locked);
    }

    #[test]
    fn stage_objects_and_fixture_groups_are_persistent_project_data() {
        let mut bundle = demo_project().unwrap();
        let restart = apply_project_command(
            &mut bundle,
            UiProjectCommand::AddStageObject {
                kind: "truss".into(),
                name: "Front Truss".into(),
                x: 0.0,
                y: -3.0,
            },
            None,
        )
        .unwrap();
        assert!(!restart);
        let object = bundle.project.layout_objects.last().unwrap();
        assert!(matches!(object.kind, LayoutObjectKind::Truss));
        assert_eq!(object.transform.width_meters, 4.0);

        apply_project_command(
            &mut bundle,
            UiProjectCommand::PutGroup {
                group_id: None,
                name: "Front Lights".into(),
                fixture_ids: vec!["101".into(), "102".into(), "101".into()],
            },
            None,
        )
        .unwrap();
        assert_eq!(bundle.project.groups.len(), 1);
        assert_eq!(bundle.project.groups[0].fixture_ids.len(), 2);
        assert!(bundle.validate().is_ok());
    }

    #[test]
    fn scene_capture_stores_selected_logical_values_and_can_join_the_cue_list() {
        let mut bundle = demo_project().unwrap();
        let fixture_id = FixtureId::new(101);
        let mut resolved_values = FixtureParameterValues::new();
        resolved_values.entry(fixture_id).or_default().insert(
            ParameterId::new("intensity"),
            NormalizedValue::clamped(0.33),
        );
        let snapshot = ShowSnapshot {
            project_id: bundle.project.project_id,
            revision: 1,
            operation_mode: OperationMode::Edit,
            resolved_values,
            programmer_values: FixtureParameterValues::new(),
            blind_values: FixtureParameterValues::new(),
            active_scene_ids: Vec::new(),
            active_effect_ids: Vec::new(),
            cue_runtime: BTreeMap::new(),
            grand_master: NormalizedValue::FULL,
            blackout: false,
            blind: false,
            freeze: false,
            bpm: 120.0,
        };
        let restart = apply_project_command(
            &mut bundle,
            UiProjectCommand::CaptureScene {
                name: "Front Third".into(),
                fixture_ids: vec!["101".into()],
                fade_ms: 750,
            },
            Some(&snapshot),
        )
        .unwrap();
        assert!(restart);
        let captured = bundle.project.scenes.last().unwrap();
        assert_eq!(captured.values.len(), 1);
        assert_eq!(captured.default_fade_ms, 750);
        let scene_id = captured.id;

        apply_project_command(
            &mut bundle,
            UiProjectCommand::AddCue {
                cue_list_id: None,
                scene_id: scene_id.0.to_string(),
            },
            None,
        )
        .unwrap();
        assert_eq!(bundle.project.cue_lists[0].entries.len(), 5);
        assert_eq!(bundle.project.cue_lists[0].entries[4].scene_id, scene_id);
        assert!(bundle.validate().is_ok());
    }

    #[test]
    fn effects_and_live_controls_are_validated_project_content() {
        let mut bundle = demo_project().unwrap();
        apply_project_command(
            &mut bundle,
            UiProjectCommand::PutEffect {
                effect_id: None,
                name: "Left Right Pulse".into(),
                template: EffectTemplate::Pulse,
                target_parameter: "intensity".into(),
                amplitude: 0.8,
                offset: 0.1,
                speed_hz: 2.0,
                beat_multiplier: 0.5,
                beat_sync: true,
                spatial_phase: 1.0,
                direction: EffectDirection::Forward,
                blend: EffectBlend::Replace,
                order: EffectOrder::LayoutX,
            },
            None,
        )
        .unwrap();
        let effect = bundle.project.effects.last().unwrap();
        let effect_id = effect.id;
        let effect_name = effect.name.clone();
        apply_project_command(
            &mut bundle,
            UiProjectCommand::PutLiveControl {
                control_id: None,
                label: effect_name,
                scene_id: None,
                effect_id: Some(effect_id.0.to_string()),
                page: 1,
                position: 9,
            },
            None,
        )
        .unwrap();
        assert_eq!(
            bundle.project.live_controls.last().unwrap().effect_id,
            Some(effect_id)
        );
        assert!(bundle.validate().is_ok());
    }

    #[test]
    fn floor_plan_image_round_trips_inside_the_project_file() {
        let mut bundle = demo_project().unwrap();
        let png = b"\x89PNG\r\n\x1a\nminimal-test-image".to_vec();
        let restart = apply_project_command(
            &mut bundle,
            UiProjectCommand::PutBackground {
                name: "Venue plan.png".into(),
                mime: "image/png".into(),
                bytes: png.clone(),
            },
            None,
        )
        .unwrap();
        assert!(!restart);
        assert_eq!(bundle.assets.get("assets/floor-plan.png"), Some(&png));
        let background = background_view(&bundle).unwrap();
        assert_eq!(background.name, "Venue plan.png");
        assert!(background.data_url.starts_with("data:image/png;base64,"));

        let directory = test_directory();
        fs::create_dir_all(&directory).unwrap();
        let project_path = directory.join("background.lightshow");
        ProjectStore::save_atomic(&project_path, &bundle).unwrap();
        let loaded = ProjectStore::load(&project_path).unwrap().bundle;
        assert_eq!(loaded.assets.get("assets/floor-plan.png"), Some(&png));
        assert!(background_view(&loaded).is_some());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn floor_plan_rejects_invalid_or_oversized_images_and_can_be_removed() {
        let mut bundle = demo_project().unwrap();
        let invalid = apply_project_command(
            &mut bundle,
            UiProjectCommand::PutBackground {
                name: "not-really.png".into(),
                mime: "image/png".into(),
                bytes: b"not a png".to_vec(),
            },
            None,
        );
        assert!(matches!(invalid, Err(BackendError::InvalidCommand(_))));

        let oversized = apply_project_command(
            &mut bundle,
            UiProjectCommand::PutBackground {
                name: "large.jpg".into(),
                mime: "image/jpeg".into(),
                bytes: vec![0xff; 12 * 1024 * 1024 + 1],
            },
            None,
        );
        assert!(matches!(oversized, Err(BackendError::InvalidCommand(_))));

        apply_project_command(
            &mut bundle,
            UiProjectCommand::PutBackground {
                name: "plan.jpg".into(),
                mime: "image/jpeg".into(),
                bytes: vec![0xff, 0xd8, 0xff, 0xd9],
            },
            None,
        )
        .unwrap();
        apply_project_command(&mut bundle, UiProjectCommand::RemoveBackground, None).unwrap();
        assert!(background_view(&bundle).is_none());
        assert!(bundle.assets.is_empty());
    }

    #[test]
    fn desktop_backend_round_trips_commands_through_the_sidecar() {
        let directory = test_directory();
        let mut backend = DesktopBackend::open(directory.clone()).unwrap();
        let first = backend.bootstrap().unwrap().engine;
        thread::sleep(Duration::from_millis(100));
        let later = backend.refresh().unwrap();
        assert!(later.telemetry.frames_sent > first.telemetry.frames_sent);

        let blackout = backend
            .command(UiEngineCommand::SetBlackout { enabled: true })
            .unwrap();
        assert!(blackout.blackout);
        let scene = backend
            .command(UiEngineCommand::ActivateScene {
                scene_id: "201".into(),
                fade_ms: Some(0),
            })
            .unwrap();
        assert_eq!(scene.active_scene_ids, vec!["201"]);

        let effect = backend
            .command(UiEngineCommand::StartEffect {
                effect_id: "401".into(),
                fixture_ids: vec!["101".into(), "102".into()],
            })
            .unwrap();
        assert_eq!(effect.active_effect_ids, vec!["401"]);
        let fanned = backend
            .command(UiEngineCommand::ApplyFan {
                fixture_ids: vec!["101".into(), "102".into()],
                parameter_id: "position.pan".into(),
                base: 0.5,
                spread: 0.6,
            })
            .unwrap();
        let values: BTreeMap<_, _> = fanned
            .fixture_values
            .into_iter()
            .map(|entry| (entry.fixture_id, entry.parameters))
            .collect();
        assert_eq!(values["101"]["position.pan"], 0.2);
        assert_eq!(values["102"]["position.pan"], 0.8);
        let stopped = backend
            .command(UiEngineCommand::StopEffect {
                effect_id: "401".into(),
            })
            .unwrap();
        assert!(stopped.active_effect_ids.is_empty());

        let updated = backend
            .project_command(UiProjectCommand::UpdateLayouts {
                layouts: vec![UiLayoutUpdate {
                    fixture_id: "101".into(),
                    x: 7.5,
                    y: -1.0,
                    width: 0.9,
                    height: 0.7,
                    rotation: 30.0,
                    locked: false,
                    hidden: false,
                    layer: "Front".into(),
                }],
            })
            .unwrap();
        assert_eq!(updated.project.fixtures[0].x, 7.5);
        let repatched = backend
            .project_command(UiProjectCommand::PatchFixture {
                fixture_id: "106".into(),
                universe: 1,
                address: 42,
            })
            .unwrap();
        assert_eq!(repatched.project.fixtures[5].address, 42);
        assert!(backend.refresh().unwrap().connected);

        backend.session.shutdown().unwrap();
        drop(backend);
        fs::remove_dir_all(directory).unwrap();
    }
}
