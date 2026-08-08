//! Versioned command and domain-event contracts shared by every input adapter.

use std::collections::BTreeMap;

use lighthouse_domain::{
    CueListId, EffectId, FixtureId, NormalizedValue, ParameterId, ProjectId, SceneId,
};
use lighthouse_effects::EffectDefinition;
use serde::{Deserialize, Serialize};

pub type FixtureParameterValues = BTreeMap<FixtureId, BTreeMap<ParameterId, NormalizedValue>>;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PriorityLane {
    Safety,
    Live,
    Edit,
    Background,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OperationMode {
    Edit,
    Live,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneData {
    pub id: SceneId,
    pub name: String,
    pub values: FixtureParameterValues,
    pub default_fade_ms: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CueEntryData {
    pub number: String,
    pub name: String,
    pub scene_id: SceneId,
    pub fade_ms: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CueListData {
    pub id: CueListId,
    pub name: String,
    pub entries: Vec<CueEntryData>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "data")]
pub enum Command {
    SetFixtureParameter {
        fixture_id: FixtureId,
        parameter_id: ParameterId,
        value: NormalizedValue,
    },
    ClearProgrammer {
        fixture_id: Option<FixtureId>,
    },
    PutScene {
        scene: SceneData,
    },
    RemoveScene {
        scene_id: SceneId,
    },
    ActivateScene {
        scene_id: SceneId,
        fade_ms: Option<u64>,
    },
    ReleaseScene {
        scene_id: SceneId,
        fade_ms: Option<u64>,
    },
    PutCueList {
        cue_list: CueListData,
    },
    GoNextCue {
        cue_list_id: CueListId,
    },
    BackCue {
        cue_list_id: CueListId,
    },
    PauseCueList {
        cue_list_id: CueListId,
    },
    ResumeCueList {
        cue_list_id: CueListId,
    },
    PutEffect {
        effect: EffectDefinition,
    },
    StartEffect {
        effect_id: EffectId,
        fixture_ids: Vec<FixtureId>,
        layout_positions: BTreeMap<FixtureId, (f64, f64)>,
    },
    StopEffect {
        effect_id: EffectId,
    },
    SetGrandMaster {
        value: NormalizedValue,
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
}

impl Command {
    #[must_use]
    pub const fn requires_edit_mode(&self) -> bool {
        matches!(
            self,
            Self::PutScene { .. }
                | Self::RemoveScene { .. }
                | Self::PutCueList { .. }
                | Self::PutEffect { .. }
        )
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandEnvelope {
    pub contract_version: u16,
    pub command_id: u128,
    pub correlation_id: Option<u128>,
    pub source_id: String,
    pub project_id: ProjectId,
    pub expected_revision: Option<u64>,
    pub client_sequence: u64,
    pub issued_at_micros: u64,
    pub priority_lane: PriorityLane,
    pub payload: Command,
}

impl CommandEnvelope {
    pub const CONTRACT_VERSION: u16 = 1;

    #[must_use]
    pub fn new(
        command_id: u128,
        source_id: impl Into<String>,
        project_id: ProjectId,
        payload: Command,
    ) -> Self {
        Self {
            contract_version: Self::CONTRACT_VERSION,
            command_id,
            correlation_id: None,
            source_id: source_id.into(),
            project_id,
            expected_revision: None,
            client_sequence: 0,
            issued_at_micros: 0,
            priority_lane: PriorityLane::Edit,
            payload,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "data")]
pub enum DomainEvent {
    FixtureParameterChanged {
        fixture_id: FixtureId,
        parameter_id: ParameterId,
        value: NormalizedValue,
        blind: bool,
    },
    ProgrammerCleared,
    SceneStored {
        scene_id: SceneId,
    },
    SceneRemoved {
        scene_id: SceneId,
    },
    SceneActivated {
        scene_id: SceneId,
        activation_id: u64,
    },
    SceneReleased {
        scene_id: SceneId,
    },
    CueListStored {
        cue_list_id: CueListId,
    },
    CueChanged {
        cue_list_id: CueListId,
        index: Option<usize>,
    },
    CueListPaused {
        cue_list_id: CueListId,
        paused: bool,
    },
    EffectStored {
        effect_id: EffectId,
    },
    EffectStarted {
        effect_id: EffectId,
    },
    EffectStopped {
        effect_id: EffectId,
    },
    GrandMasterChanged {
        value: NormalizedValue,
    },
    BlackoutChanged {
        enabled: bool,
    },
    BlindChanged {
        enabled: bool,
    },
    BlindCommitted,
    FreezeChanged {
        enabled: bool,
    },
    OperationModeChanged {
        mode: OperationMode,
    },
    TempoChanged {
        bpm: f64,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RejectionCode {
    UnsupportedContractVersion,
    WrongProject,
    RevisionConflict,
    EditCommandInLiveMode,
    NotFound,
    AlreadyExists,
    InvalidCommand,
    EndOfCueList,
    StartOfCueList,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandRejection {
    pub code: RejectionCode,
    pub message: String,
}

impl CommandRejection {
    #[must_use]
    pub fn new(code: RejectionCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandOutcome {
    pub command_id: u128,
    pub revision: u64,
    pub result: Result<Vec<DomainEvent>, CommandRejection>,
}

impl CommandOutcome {
    #[must_use]
    pub fn accepted(command_id: u128, revision: u64, events: Vec<DomainEvent>) -> Self {
        Self {
            command_id,
            revision,
            result: Ok(events),
        }
    }

    #[must_use]
    pub fn rejected(command_id: u128, revision: u64, rejection: CommandRejection) -> Self {
        Self {
            command_id,
            revision,
            result: Err(rejection),
        }
    }
}
