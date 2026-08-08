use std::collections::BTreeMap;
use std::time::Duration;

use lighthouse_commands::{
    Command, CommandEnvelope, CommandOutcome, CommandRejection, CueListData, DomainEvent,
    FixtureParameterValues, OperationMode, RejectionCode, SceneData,
};
use lighthouse_domain::{
    CueListId, EffectId, FixtureId, NormalizedValue, ParameterId, ProjectId, SceneId,
};
use lighthouse_effects::{
    BeatClock, BeatSource, EffectBlend, EffectDefinition, FixtureEffectContext, TapTempo, sample,
};
use serde::{Deserialize, Serialize};

use crate::MonotonicClock;

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CueRuntimeSnapshot {
    pub cursor: Option<usize>,
    pub paused: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowSnapshot {
    pub project_id: ProjectId,
    pub revision: u64,
    pub operation_mode: OperationMode,
    pub resolved_values: FixtureParameterValues,
    pub programmer_values: FixtureParameterValues,
    pub blind_values: FixtureParameterValues,
    pub active_scene_ids: Vec<SceneId>,
    pub active_effect_ids: Vec<EffectId>,
    pub cue_runtime: BTreeMap<CueListId, CueRuntimeSnapshot>,
    pub grand_master: NormalizedValue,
    pub blackout: bool,
    pub blind: bool,
    pub freeze: bool,
    pub bpm: f64,
}

#[derive(Clone, Debug)]
struct ActiveScene {
    activation_id: u64,
    scene_id: SceneId,
    activation_order: u64,
    started_at: Duration,
    duration: Duration,
    from_values: FixtureParameterValues,
    target_values: FixtureParameterValues,
}

impl ActiveScene {
    fn values_at(&self, now: Duration) -> FixtureParameterValues {
        interpolate_values(
            &self.from_values,
            &self.target_values,
            transition_progress(self.started_at, self.duration, now),
        )
    }
}

#[derive(Clone, Debug)]
struct ReleasingScene {
    activation_order: u64,
    started_at: Duration,
    duration: Duration,
    from_values: FixtureParameterValues,
    target_values: FixtureParameterValues,
}

impl ReleasingScene {
    fn values_at(&self, now: Duration) -> FixtureParameterValues {
        interpolate_values(
            &self.from_values,
            &self.target_values,
            transition_progress(self.started_at, self.duration, now),
        )
    }

    fn is_finished(&self, now: Duration) -> bool {
        now >= self.started_at.saturating_add(self.duration)
    }
}

#[derive(Clone, Debug, Default)]
struct CueRuntime {
    cursor: Option<usize>,
    paused: bool,
    activation_ids: Vec<u64>,
}

#[derive(Clone, Debug)]
struct ActiveEffect {
    effect_id: EffectId,
    activation_order: u64,
    started_at: Duration,
    fixture_ids: Vec<FixtureId>,
    layout_positions: BTreeMap<FixtureId, (f64, f64)>,
}

pub struct ShowCore<C: MonotonicClock> {
    project_id: ProjectId,
    clock: C,
    revision: u64,
    operation_mode: OperationMode,
    programmer: FixtureParameterValues,
    blind_programmer: FixtureParameterValues,
    scenes: BTreeMap<SceneId, SceneData>,
    active_scenes: Vec<ActiveScene>,
    releasing_scenes: Vec<ReleasingScene>,
    cue_lists: BTreeMap<CueListId, CueListData>,
    cue_runtime: BTreeMap<CueListId, CueRuntime>,
    effects: BTreeMap<EffectId, EffectDefinition>,
    active_effects: Vec<ActiveEffect>,
    beat_clock: BeatClock,
    tap_tempo: TapTempo,
    grand_master: NormalizedValue,
    blackout: bool,
    blind: bool,
    frozen_at: Option<Duration>,
    next_activation_id: u64,
}

impl<C: MonotonicClock> ShowCore<C> {
    #[must_use]
    pub fn new(project_id: ProjectId, clock: C) -> Self {
        Self {
            project_id,
            clock,
            revision: 0,
            operation_mode: OperationMode::Edit,
            programmer: FixtureParameterValues::new(),
            blind_programmer: FixtureParameterValues::new(),
            scenes: BTreeMap::new(),
            active_scenes: Vec::new(),
            releasing_scenes: Vec::new(),
            cue_lists: BTreeMap::new(),
            cue_runtime: BTreeMap::new(),
            effects: BTreeMap::new(),
            active_effects: Vec::new(),
            beat_clock: BeatClock::default(),
            tap_tempo: TapTempo::default(),
            grand_master: NormalizedValue::FULL,
            blackout: false,
            blind: false,
            frozen_at: None,
            next_activation_id: 1,
        }
    }

    #[must_use]
    pub const fn revision(&self) -> u64 {
        self.revision
    }

    pub fn process(&mut self, envelope: CommandEnvelope) -> CommandOutcome {
        let command_id = envelope.command_id;
        if envelope.contract_version != CommandEnvelope::CONTRACT_VERSION {
            return self.rejected(
                command_id,
                RejectionCode::UnsupportedContractVersion,
                "unsupported command contract version",
            );
        }
        if envelope.project_id != self.project_id {
            return self.rejected(
                command_id,
                RejectionCode::WrongProject,
                "command targets a different project",
            );
        }
        if envelope
            .expected_revision
            .is_some_and(|expected| expected != self.revision)
        {
            return self.rejected(
                command_id,
                RejectionCode::RevisionConflict,
                "project revision changed before the command was applied",
            );
        }
        if self.operation_mode == OperationMode::Live && envelope.payload.requires_edit_mode() {
            return self.rejected(
                command_id,
                RejectionCode::EditCommandInLiveMode,
                "structural edit commands are disabled in LIVE mode",
            );
        }

        let wall_now = self.clock.now();
        self.cleanup_finished_transitions(self.effective_now(wall_now));
        match self.execute(envelope.payload, wall_now) {
            Ok(events) => {
                self.revision = self.revision.saturating_add(1);
                CommandOutcome::accepted(command_id, self.revision, events)
            }
            Err(rejection) => CommandOutcome::rejected(command_id, self.revision, rejection),
        }
    }

    #[must_use]
    pub fn resolved_values(&self) -> FixtureParameterValues {
        let now = self.effective_now(self.clock.now());
        let mut values = self.resolved_scene_layers_at(now);
        self.apply_effect_layers(&mut values, now);
        merge_values(&mut values, &self.programmer);
        values
    }

    #[must_use]
    pub fn snapshot(&self) -> ShowSnapshot {
        ShowSnapshot {
            project_id: self.project_id,
            revision: self.revision,
            operation_mode: self.operation_mode,
            resolved_values: self.resolved_values(),
            programmer_values: self.programmer.clone(),
            blind_values: self.blind_programmer.clone(),
            active_scene_ids: self
                .active_scenes
                .iter()
                .map(|scene| scene.scene_id)
                .collect(),
            active_effect_ids: self
                .active_effects
                .iter()
                .map(|effect| effect.effect_id)
                .collect(),
            cue_runtime: self
                .cue_runtime
                .iter()
                .map(|(id, runtime)| {
                    (
                        *id,
                        CueRuntimeSnapshot {
                            cursor: runtime.cursor,
                            paused: runtime.paused,
                        },
                    )
                })
                .collect(),
            grand_master: self.grand_master,
            blackout: self.blackout,
            blind: self.blind,
            freeze: self.frozen_at.is_some(),
            bpm: self.beat_clock.bpm(),
        }
    }

    fn execute(
        &mut self,
        command: Command,
        wall_now: Duration,
    ) -> Result<Vec<DomainEvent>, CommandRejection> {
        let now = self.effective_now(wall_now);
        match command {
            Command::SetFixtureParameter {
                fixture_id,
                parameter_id,
                value,
            } => {
                let blind = self.blind;
                let target = if blind {
                    &mut self.blind_programmer
                } else {
                    &mut self.programmer
                };
                set_value(target, fixture_id, parameter_id.clone(), value);
                Ok(vec![DomainEvent::FixtureParameterChanged {
                    fixture_id,
                    parameter_id,
                    value,
                    blind,
                }])
            }
            Command::ClearProgrammer { fixture_id } => {
                let target = if self.blind {
                    &mut self.blind_programmer
                } else {
                    &mut self.programmer
                };
                if let Some(fixture_id) = fixture_id {
                    target.remove(&fixture_id);
                } else {
                    target.clear();
                }
                Ok(vec![DomainEvent::ProgrammerCleared])
            }
            Command::PutScene { scene } => {
                let scene_id = scene.id;
                self.scenes.insert(scene_id, scene);
                Ok(vec![DomainEvent::SceneStored { scene_id }])
            }
            Command::RemoveScene { scene_id } => {
                if self
                    .active_scenes
                    .iter()
                    .any(|scene| scene.scene_id == scene_id)
                {
                    return Err(rejection(
                        RejectionCode::InvalidCommand,
                        "an active scene must be released before it can be removed",
                    ));
                }
                self.scenes
                    .remove(&scene_id)
                    .ok_or_else(|| rejection(RejectionCode::NotFound, "scene was not found"))?;
                Ok(vec![DomainEvent::SceneRemoved { scene_id }])
            }
            Command::ActivateScene { scene_id, fade_ms } => {
                let activation_id = self.activate_scene(scene_id, fade_ms, now)?;
                Ok(vec![DomainEvent::SceneActivated {
                    scene_id,
                    activation_id,
                }])
            }
            Command::ReleaseScene { scene_id, fade_ms } => {
                self.release_scene(scene_id, fade_ms, now)?;
                Ok(vec![DomainEvent::SceneReleased { scene_id }])
            }
            Command::PutCueList { cue_list } => {
                if cue_list
                    .entries
                    .iter()
                    .any(|entry| !self.scenes.contains_key(&entry.scene_id))
                {
                    return Err(rejection(
                        RejectionCode::NotFound,
                        "cue list references an unknown scene",
                    ));
                }
                let cue_list_id = cue_list.id;
                self.cue_lists.insert(cue_list_id, cue_list);
                self.cue_runtime.entry(cue_list_id).or_default();
                Ok(vec![DomainEvent::CueListStored { cue_list_id }])
            }
            Command::GoNextCue { cue_list_id } => self.go_next_cue(cue_list_id, now),
            Command::BackCue { cue_list_id } => self.back_cue(cue_list_id, now),
            Command::PauseCueList { cue_list_id } => self.set_cue_paused(cue_list_id, true),
            Command::ResumeCueList { cue_list_id } => self.set_cue_paused(cue_list_id, false),
            Command::PutEffect { effect } => {
                effect
                    .validate()
                    .map_err(|error| rejection(RejectionCode::InvalidCommand, error.to_string()))?;
                let effect_id = effect.id;
                self.effects.insert(effect_id, effect);
                Ok(vec![DomainEvent::EffectStored { effect_id }])
            }
            Command::StartEffect {
                effect_id,
                fixture_ids,
                layout_positions,
            } => {
                if !self.effects.contains_key(&effect_id) {
                    return Err(rejection(RejectionCode::NotFound, "effect was not found"));
                }
                if fixture_ids.is_empty() {
                    return Err(rejection(
                        RejectionCode::InvalidCommand,
                        "effect target cannot be empty",
                    ));
                }
                let activation_order = self.take_activation_id();
                self.active_effects.push(ActiveEffect {
                    effect_id,
                    activation_order,
                    started_at: now,
                    fixture_ids,
                    layout_positions,
                });
                Ok(vec![DomainEvent::EffectStarted { effect_id }])
            }
            Command::StopEffect { effect_id } => {
                let before = self.active_effects.len();
                self.active_effects
                    .retain(|effect| effect.effect_id != effect_id);
                if before == self.active_effects.len() {
                    return Err(rejection(
                        RejectionCode::NotFound,
                        "active effect was not found",
                    ));
                }
                Ok(vec![DomainEvent::EffectStopped { effect_id }])
            }
            Command::SetGrandMaster { value } => {
                self.grand_master = value;
                Ok(vec![DomainEvent::GrandMasterChanged { value }])
            }
            Command::SetBlackout { enabled } => {
                self.blackout = enabled;
                Ok(vec![DomainEvent::BlackoutChanged { enabled }])
            }
            Command::SetBlind { enabled } => {
                self.blind = enabled;
                Ok(vec![DomainEvent::BlindChanged { enabled }])
            }
            Command::CommitBlind => {
                for (fixture_id, parameters) in &self.blind_programmer {
                    for (parameter_id, value) in parameters {
                        set_value(
                            &mut self.programmer,
                            *fixture_id,
                            parameter_id.clone(),
                            *value,
                        );
                    }
                }
                self.blind_programmer.clear();
                Ok(vec![DomainEvent::BlindCommitted])
            }
            Command::SetFreeze { enabled } => {
                self.set_freeze(enabled, wall_now);
                Ok(vec![DomainEvent::FreezeChanged { enabled }])
            }
            Command::SetOperationMode { mode } => {
                self.operation_mode = mode;
                Ok(vec![DomainEvent::OperationModeChanged { mode }])
            }
            Command::SetTempo { bpm } => {
                self.beat_clock
                    .set_bpm(bpm, now, BeatSource::Fixed, NormalizedValue::FULL)
                    .map_err(|error| rejection(RejectionCode::InvalidCommand, error.to_string()))?;
                Ok(vec![DomainEvent::TempoChanged { bpm }])
            }
            Command::TapTempo => {
                let Some(bpm) = self.tap_tempo.tap(now) else {
                    return Ok(Vec::new());
                };
                self.beat_clock
                    .set_bpm(bpm, now, BeatSource::Tap, NormalizedValue::FULL)
                    .map_err(|error| rejection(RejectionCode::InvalidCommand, error.to_string()))?;
                Ok(vec![DomainEvent::TempoChanged { bpm }])
            }
        }
    }

    fn activate_scene(
        &mut self,
        scene_id: SceneId,
        fade_ms: Option<u64>,
        now: Duration,
    ) -> Result<u64, CommandRejection> {
        let scene = self
            .scenes
            .get(&scene_id)
            .cloned()
            .ok_or_else(|| rejection(RejectionCode::NotFound, "scene was not found"))?;
        let current = self.resolved_scene_layers_at(now);
        let from_values = values_for_target_keys(&current, &scene.values);
        let activation_id = self.take_activation_id();
        self.active_scenes.push(ActiveScene {
            activation_id,
            scene_id,
            activation_order: activation_id,
            started_at: now,
            duration: Duration::from_millis(fade_ms.unwrap_or(scene.default_fade_ms)),
            from_values,
            target_values: scene.values,
        });
        Ok(activation_id)
    }

    fn release_scene(
        &mut self,
        scene_id: SceneId,
        fade_ms: Option<u64>,
        now: Duration,
    ) -> Result<(), CommandRejection> {
        let index = self
            .active_scenes
            .iter()
            .rposition(|scene| scene.scene_id == scene_id)
            .ok_or_else(|| rejection(RejectionCode::NotFound, "active scene was not found"))?;
        self.release_scene_at_index(index, fade_ms, now);
        Ok(())
    }

    fn release_activation(
        &mut self,
        activation_id: u64,
        fade_ms: Option<u64>,
        now: Duration,
    ) -> Result<SceneId, CommandRejection> {
        let index = self
            .active_scenes
            .iter()
            .position(|scene| scene.activation_id == activation_id)
            .ok_or_else(|| rejection(RejectionCode::NotFound, "cue activation was not found"))?;
        let scene_id = self.active_scenes[index].scene_id;
        self.release_scene_at_index(index, fade_ms, now);
        Ok(scene_id)
    }

    fn release_scene_at_index(&mut self, index: usize, fade_ms: Option<u64>, now: Duration) {
        let before = self.resolved_scene_layers_at(now);
        let removed = self.active_scenes.remove(index);
        let duration = Duration::from_millis(fade_ms.unwrap_or_else(|| {
            self.scenes
                .get(&removed.scene_id)
                .map_or(0, |scene| scene.default_fade_ms)
        }));
        if duration.is_zero() {
            return;
        }
        let underlying = self.resolved_scene_layers_at(now);
        let from_values = values_for_target_keys(&before, &removed.target_values);
        let target_values = values_for_target_keys(&underlying, &removed.target_values);
        self.releasing_scenes.push(ReleasingScene {
            activation_order: removed.activation_order,
            started_at: now,
            duration,
            from_values,
            target_values,
        });
    }

    fn go_next_cue(
        &mut self,
        cue_list_id: CueListId,
        now: Duration,
    ) -> Result<Vec<DomainEvent>, CommandRejection> {
        let (next_index, scene_id, fade_ms) = {
            let cue_list = self
                .cue_lists
                .get(&cue_list_id)
                .ok_or_else(|| rejection(RejectionCode::NotFound, "cue list was not found"))?;
            let runtime = self
                .cue_runtime
                .get(&cue_list_id)
                .cloned()
                .unwrap_or_default();
            if runtime.paused {
                return Err(rejection(
                    RejectionCode::InvalidCommand,
                    "cue list is paused",
                ));
            }
            let next_index = runtime.cursor.map_or(0, |index| index + 1);
            let entry = cue_list.entries.get(next_index).ok_or_else(|| {
                rejection(
                    RejectionCode::EndOfCueList,
                    "cue list is already at the end",
                )
            })?;
            (next_index, entry.scene_id, entry.fade_ms)
        };

        let activation_id = self.activate_scene(scene_id, fade_ms, now)?;
        let runtime = self.cue_runtime.entry(cue_list_id).or_default();
        runtime.cursor = Some(next_index);
        runtime.activation_ids.push(activation_id);
        Ok(vec![
            DomainEvent::SceneActivated {
                scene_id,
                activation_id,
            },
            DomainEvent::CueChanged {
                cue_list_id,
                index: Some(next_index),
            },
        ])
    }

    fn back_cue(
        &mut self,
        cue_list_id: CueListId,
        now: Duration,
    ) -> Result<Vec<DomainEvent>, CommandRejection> {
        let (activation_id, fade_ms, next_cursor) = {
            let cue_list = self
                .cue_lists
                .get(&cue_list_id)
                .ok_or_else(|| rejection(RejectionCode::NotFound, "cue list was not found"))?;
            let runtime = self.cue_runtime.get(&cue_list_id).ok_or_else(|| {
                rejection(RejectionCode::StartOfCueList, "cue list has not started")
            })?;
            let cursor = runtime.cursor.ok_or_else(|| {
                rejection(
                    RejectionCode::StartOfCueList,
                    "cue list is already before the first cue",
                )
            })?;
            let activation_id = *runtime.activation_ids.last().ok_or_else(|| {
                rejection(
                    RejectionCode::StartOfCueList,
                    "cue activation history is empty",
                )
            })?;
            let fade_ms = cue_list.entries.get(cursor).and_then(|entry| entry.fade_ms);
            (activation_id, fade_ms, cursor.checked_sub(1))
        };

        let scene_id = self.release_activation(activation_id, fade_ms, now)?;
        let runtime = self
            .cue_runtime
            .get_mut(&cue_list_id)
            .expect("runtime was validated");
        runtime.cursor = next_cursor;
        runtime.activation_ids.pop();
        Ok(vec![
            DomainEvent::SceneReleased { scene_id },
            DomainEvent::CueChanged {
                cue_list_id,
                index: next_cursor,
            },
        ])
    }

    fn set_cue_paused(
        &mut self,
        cue_list_id: CueListId,
        paused: bool,
    ) -> Result<Vec<DomainEvent>, CommandRejection> {
        if !self.cue_lists.contains_key(&cue_list_id) {
            return Err(rejection(RejectionCode::NotFound, "cue list was not found"));
        }
        self.cue_runtime.entry(cue_list_id).or_default().paused = paused;
        Ok(vec![DomainEvent::CueListPaused {
            cue_list_id,
            paused,
        }])
    }

    fn resolved_scene_layers_at(&self, now: Duration) -> FixtureParameterValues {
        let mut layers: Vec<(u64, FixtureParameterValues)> = self
            .active_scenes
            .iter()
            .map(|scene| (scene.activation_order, scene.values_at(now)))
            .chain(
                self.releasing_scenes
                    .iter()
                    .filter(|scene| !scene.is_finished(now))
                    .map(|scene| (scene.activation_order, scene.values_at(now))),
            )
            .collect();
        layers.sort_by_key(|(order, _)| *order);

        let mut resolved = FixtureParameterValues::new();
        for (_, values) in layers {
            merge_values(&mut resolved, &values);
        }
        resolved
    }

    fn apply_effect_layers(&self, values: &mut FixtureParameterValues, now: Duration) {
        let mut effects: Vec<_> = self.active_effects.iter().collect();
        effects.sort_by_key(|effect| effect.activation_order);
        let beat_phase = self.beat_clock.phase_at(now);
        for active in effects {
            let Some(definition) = self.effects.get(&active.effect_id) else {
                continue;
            };
            let bounds = layout_bounds(&active.fixture_ids, &active.layout_positions);
            for (index, fixture_id) in active.fixture_ids.iter().copied().enumerate() {
                let (x, y) =
                    normalized_position(active.layout_positions.get(&fixture_id).copied(), bounds);
                let sampled = sample(
                    definition,
                    now.saturating_sub(active.started_at),
                    beat_phase,
                    FixtureEffectContext {
                        index,
                        count: active.fixture_ids.len(),
                        x,
                        y,
                    },
                );
                let existing = values
                    .get(&fixture_id)
                    .and_then(|parameters| parameters.get(&definition.target_parameter))
                    .copied()
                    .unwrap_or(NormalizedValue::ZERO);
                let output = match definition.blend {
                    EffectBlend::Replace => sampled,
                    EffectBlend::Add => NormalizedValue::clamped(existing.get() + sampled.get()),
                };
                set_value(
                    values,
                    fixture_id,
                    definition.target_parameter.clone(),
                    output,
                );
            }
        }
    }

    fn set_freeze(&mut self, enabled: bool, wall_now: Duration) {
        match (enabled, self.frozen_at) {
            (true, None) => self.frozen_at = Some(wall_now),
            (false, Some(frozen_at)) => {
                let paused_for = wall_now.saturating_sub(frozen_at);
                for scene in &mut self.active_scenes {
                    scene.started_at = scene.started_at.saturating_add(paused_for);
                }
                for scene in &mut self.releasing_scenes {
                    scene.started_at = scene.started_at.saturating_add(paused_for);
                }
                for effect in &mut self.active_effects {
                    effect.started_at = effect.started_at.saturating_add(paused_for);
                }
                self.beat_clock.shift_origin(paused_for);
                self.frozen_at = None;
            }
            _ => {}
        }
    }

    fn effective_now(&self, wall_now: Duration) -> Duration {
        self.frozen_at.unwrap_or(wall_now)
    }

    fn cleanup_finished_transitions(&mut self, now: Duration) {
        self.releasing_scenes
            .retain(|transition| !transition.is_finished(now));
    }

    fn take_activation_id(&mut self) -> u64 {
        let id = self.next_activation_id;
        self.next_activation_id = self.next_activation_id.saturating_add(1);
        id
    }

    fn rejected(&self, command_id: u128, code: RejectionCode, message: &str) -> CommandOutcome {
        CommandOutcome::rejected(command_id, self.revision, rejection(code, message))
    }
}

fn rejection(code: RejectionCode, message: impl Into<String>) -> CommandRejection {
    CommandRejection::new(code, message)
}

fn set_value(
    values: &mut FixtureParameterValues,
    fixture_id: FixtureId,
    parameter_id: ParameterId,
    value: NormalizedValue,
) {
    values
        .entry(fixture_id)
        .or_default()
        .insert(parameter_id, value);
}

fn merge_values(target: &mut FixtureParameterValues, layer: &FixtureParameterValues) {
    for (fixture_id, parameters) in layer {
        for (parameter_id, value) in parameters {
            set_value(target, *fixture_id, parameter_id.clone(), *value);
        }
    }
}

fn values_for_target_keys(
    source: &FixtureParameterValues,
    target_keys: &FixtureParameterValues,
) -> FixtureParameterValues {
    let mut selected = FixtureParameterValues::new();
    for (fixture_id, parameters) in target_keys {
        for parameter_id in parameters.keys() {
            let value = source
                .get(fixture_id)
                .and_then(|source_parameters| source_parameters.get(parameter_id))
                .copied()
                .unwrap_or(NormalizedValue::ZERO);
            set_value(&mut selected, *fixture_id, parameter_id.clone(), value);
        }
    }
    selected
}

fn interpolate_values(
    from: &FixtureParameterValues,
    to: &FixtureParameterValues,
    progress: f64,
) -> FixtureParameterValues {
    if progress >= 1.0 {
        return to.clone();
    }
    if progress <= 0.0 {
        return values_for_target_keys(from, to);
    }
    let mut output = FixtureParameterValues::new();
    for (fixture_id, parameters) in to {
        for (parameter_id, target) in parameters {
            let start = from
                .get(fixture_id)
                .and_then(|values| values.get(parameter_id))
                .copied()
                .unwrap_or(NormalizedValue::ZERO);
            let value = start.get() + (target.get() - start.get()) * progress;
            set_value(
                &mut output,
                *fixture_id,
                parameter_id.clone(),
                NormalizedValue::clamped(value),
            );
        }
    }
    output
}

fn transition_progress(start: Duration, duration: Duration, now: Duration) -> f64 {
    if duration.is_zero() || now >= start.saturating_add(duration) {
        1.0
    } else if now <= start {
        0.0
    } else {
        now.saturating_sub(start).as_secs_f64() / duration.as_secs_f64()
    }
}

type LayoutBounds = Option<(f64, f64, f64, f64)>;

fn layout_bounds(
    fixture_ids: &[FixtureId],
    positions: &BTreeMap<FixtureId, (f64, f64)>,
) -> LayoutBounds {
    let mut points = fixture_ids
        .iter()
        .filter_map(|fixture_id| positions.get(fixture_id).copied());
    let first = points.next()?;
    Some(points.fold(
        (first.0, first.0, first.1, first.1),
        |(min_x, max_x, min_y, max_y), (x, y)| {
            (min_x.min(x), max_x.max(x), min_y.min(y), max_y.max(y))
        },
    ))
}

fn normalized_position(position: Option<(f64, f64)>, bounds: LayoutBounds) -> (f64, f64) {
    let (Some((x, y)), Some((min_x, max_x, min_y, max_y))) = (position, bounds) else {
        return (0.0, 0.0);
    };
    let normalized_x = if (max_x - min_x).abs() <= f64::EPSILON {
        0.0
    } else {
        (x - min_x) / (max_x - min_x)
    };
    let normalized_y = if (max_y - min_y).abs() <= f64::EPSILON {
        0.0
    } else {
        (y - min_y) / (max_y - min_y)
    };
    (normalized_x, normalized_y)
}

#[cfg(test)]
mod tests {
    use super::*;
    use lighthouse_commands::{CueEntryData, PriorityLane};
    use lighthouse_effects::{EffectDirection, EffectOrder, EffectTemplate};

    use crate::ManualClock;

    const PROJECT_ID: ProjectId = ProjectId::new(1);
    const FIXTURE_ID: FixtureId = FixtureId::new(10);

    fn envelope(id: u128, command: Command) -> CommandEnvelope {
        let mut envelope = CommandEnvelope::new(id, "test", PROJECT_ID, command);
        envelope.priority_lane = PriorityLane::Edit;
        envelope
    }

    fn scene(id: u128, intensity: f64, fade_ms: u64) -> SceneData {
        SceneData {
            id: SceneId::new(id),
            name: format!("Scene {id}"),
            values: BTreeMap::from([(
                FIXTURE_ID,
                BTreeMap::from([(
                    ParameterId::from("intensity"),
                    NormalizedValue::new(intensity).unwrap(),
                )]),
            )]),
            default_fade_ms: fade_ms,
        }
    }

    fn intensity(core: &ShowCore<ManualClock>) -> f64 {
        core.resolved_values()
            .get(&FIXTURE_ID)
            .and_then(|parameters| parameters.get(&ParameterId::from("intensity")))
            .copied()
            .unwrap_or(NormalizedValue::ZERO)
            .get()
    }

    fn accepted(core: &mut ShowCore<ManualClock>, id: u128, command: Command) {
        let result = core.process(envelope(id, command));
        assert!(result.result.is_ok(), "command failed: {:?}", result.result);
    }

    #[test]
    fn partial_scenes_use_latest_activation_and_release_reveals_the_previous_layer() {
        let clock = ManualClock::default();
        let mut core = ShowCore::new(PROJECT_ID, clock);
        accepted(
            &mut core,
            1,
            Command::PutScene {
                scene: scene(1, 0.3, 0),
            },
        );
        accepted(
            &mut core,
            2,
            Command::PutScene {
                scene: scene(2, 0.8, 0),
            },
        );
        accepted(
            &mut core,
            3,
            Command::ActivateScene {
                scene_id: SceneId::new(1),
                fade_ms: None,
            },
        );
        accepted(
            &mut core,
            4,
            Command::ActivateScene {
                scene_id: SceneId::new(2),
                fade_ms: None,
            },
        );
        assert_eq!(intensity(&core), 0.8);

        accepted(
            &mut core,
            5,
            Command::ReleaseScene {
                scene_id: SceneId::new(2),
                fade_ms: Some(0),
            },
        );
        assert_eq!(intensity(&core), 0.3);
    }

    #[test]
    fn scene_fades_are_driven_by_the_injected_clock() {
        let clock = ManualClock::default();
        let mut core = ShowCore::new(PROJECT_ID, clock.clone());
        accepted(
            &mut core,
            1,
            Command::PutScene {
                scene: scene(1, 1.0, 1000),
            },
        );
        accepted(
            &mut core,
            2,
            Command::ActivateScene {
                scene_id: SceneId::new(1),
                fade_ms: None,
            },
        );
        clock.advance(Duration::from_millis(500));
        assert_eq!(intensity(&core), 0.5);
        clock.advance(Duration::from_millis(500));
        assert_eq!(intensity(&core), 1.0);
    }

    #[test]
    fn freeze_holds_fades_and_resumes_without_a_time_jump() {
        let clock = ManualClock::default();
        let mut core = ShowCore::new(PROJECT_ID, clock.clone());
        accepted(
            &mut core,
            1,
            Command::PutScene {
                scene: scene(1, 1.0, 1000),
            },
        );
        accepted(
            &mut core,
            2,
            Command::ActivateScene {
                scene_id: SceneId::new(1),
                fade_ms: None,
            },
        );
        clock.advance(Duration::from_millis(400));
        accepted(&mut core, 3, Command::SetFreeze { enabled: true });
        clock.advance(Duration::from_secs(2));
        assert_eq!(intensity(&core), 0.4);
        accepted(&mut core, 4, Command::SetFreeze { enabled: false });
        clock.advance(Duration::from_millis(600));
        assert_eq!(intensity(&core), 1.0);
    }

    #[test]
    fn blind_programmer_does_not_change_output_until_committed() {
        let clock = ManualClock::default();
        let mut core = ShowCore::new(PROJECT_ID, clock);
        accepted(&mut core, 1, Command::SetBlind { enabled: true });
        accepted(
            &mut core,
            2,
            Command::SetFixtureParameter {
                fixture_id: FIXTURE_ID,
                parameter_id: ParameterId::from("intensity"),
                value: NormalizedValue::FULL,
            },
        );
        assert_eq!(intensity(&core), 0.0);
        accepted(&mut core, 3, Command::CommitBlind);
        assert_eq!(intensity(&core), 1.0);
    }

    #[test]
    fn cue_go_and_back_use_the_same_scene_activation_stack() {
        let clock = ManualClock::default();
        let mut core = ShowCore::new(PROJECT_ID, clock);
        accepted(
            &mut core,
            1,
            Command::PutScene {
                scene: scene(1, 0.2, 0),
            },
        );
        accepted(
            &mut core,
            2,
            Command::PutScene {
                scene: scene(2, 0.9, 0),
            },
        );
        let cue_list_id = CueListId::new(1);
        accepted(
            &mut core,
            3,
            Command::PutCueList {
                cue_list: CueListData {
                    id: cue_list_id,
                    name: "Main".into(),
                    entries: vec![
                        CueEntryData {
                            number: "1".into(),
                            name: "First".into(),
                            scene_id: SceneId::new(1),
                            fade_ms: Some(0),
                        },
                        CueEntryData {
                            number: "2".into(),
                            name: "Second".into(),
                            scene_id: SceneId::new(2),
                            fade_ms: Some(0),
                        },
                    ],
                },
            },
        );
        accepted(&mut core, 4, Command::GoNextCue { cue_list_id });
        accepted(&mut core, 5, Command::GoNextCue { cue_list_id });
        assert_eq!(intensity(&core), 0.9);
        accepted(&mut core, 6, Command::BackCue { cue_list_id });
        assert_eq!(intensity(&core), 0.2);
    }

    #[test]
    fn effects_are_parameter_based_and_can_follow_layout_x() {
        let clock = ManualClock::default();
        let mut core = ShowCore::new(PROJECT_ID, clock);
        let effect_id = EffectId::new(1);
        accepted(
            &mut core,
            1,
            Command::PutEffect {
                effect: EffectDefinition {
                    id: effect_id,
                    name: "Left to right".into(),
                    target_parameter: ParameterId::from("intensity"),
                    template: EffectTemplate::Fill,
                    amplitude: NormalizedValue::FULL,
                    offset: NormalizedValue::ZERO,
                    speed_hz: 0.0,
                    beat_multiplier: 1.0,
                    beat_sync: true,
                    spatial_phase: 1.0,
                    direction: EffectDirection::Forward,
                    blend: EffectBlend::Replace,
                    order: EffectOrder::LayoutX,
                    seed: 1,
                },
            },
        );
        accepted(
            &mut core,
            2,
            Command::StartEffect {
                effect_id,
                fixture_ids: vec![FIXTURE_ID, FixtureId::new(11)],
                layout_positions: BTreeMap::from([
                    (FIXTURE_ID, (0.0, 0.0)),
                    (FixtureId::new(11), (10.0, 0.0)),
                ]),
            },
        );
        let values = core.resolved_values();
        assert_eq!(
            values[&FIXTURE_ID][&ParameterId::from("intensity")],
            NormalizedValue::FULL
        );
        assert_eq!(
            values[&FixtureId::new(11)][&ParameterId::from("intensity")],
            NormalizedValue::ZERO
        );
    }

    #[test]
    fn optimistic_revision_rejects_stale_edit_commands() {
        let clock = ManualClock::default();
        let mut core = ShowCore::new(PROJECT_ID, clock);
        let mut stale = envelope(
            1,
            Command::PutScene {
                scene: scene(1, 1.0, 0),
            },
        );
        stale.expected_revision = Some(9);
        let result = core.process(stale);
        assert_eq!(
            result.result.unwrap_err().code,
            RejectionCode::RevisionConflict
        );
        assert_eq!(core.revision(), 0);
    }
}
