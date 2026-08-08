//! Deterministic parameter-based effects, fanning and beat timing.

use std::cmp::Ordering;
use std::collections::VecDeque;
use std::error::Error;
use std::f64::consts::TAU;
use std::fmt::{Display, Formatter};
use std::time::Duration;

use lighthouse_domain::{EffectId, NormalizedValue, ParameterId};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EffectTemplate {
    Pulse,
    SineWave,
    Chase,
    Fill,
    RandomFlicker,
    Sparkle,
    TwoColorChase,
    Rainbow,
    ColorWave,
    RandomColor,
    PanSweep,
    TiltBounce,
    Circle,
    FigureEight,
    FireCandleFlicker,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EffectDirection {
    Forward,
    Reverse,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EffectBlend {
    Replace,
    Add,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EffectOrder {
    FixtureOrder,
    LayoutX,
    LayoutY,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectDefinition {
    pub id: EffectId,
    pub name: String,
    pub target_parameter: ParameterId,
    pub template: EffectTemplate,
    pub amplitude: NormalizedValue,
    pub offset: NormalizedValue,
    pub speed_hz: f64,
    pub beat_multiplier: f64,
    pub beat_sync: bool,
    pub spatial_phase: f64,
    pub direction: EffectDirection,
    pub blend: EffectBlend,
    pub order: EffectOrder,
    pub seed: u64,
}

impl EffectDefinition {
    pub fn validate(&self) -> Result<(), EffectError> {
        for (name, value) in [
            ("speed_hz", self.speed_hz),
            ("beat_multiplier", self.beat_multiplier),
            ("spatial_phase", self.spatial_phase),
        ] {
            if !value.is_finite() {
                return Err(EffectError::NonFinite(name));
            }
        }
        if self.speed_hz < 0.0 {
            return Err(EffectError::NegativeSpeed(self.speed_hz));
        }
        if self.beat_multiplier < 0.0 {
            return Err(EffectError::NegativeBeatMultiplier(self.beat_multiplier));
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FixtureEffectContext {
    pub index: usize,
    pub count: usize,
    pub x: f64,
    pub y: f64,
}

impl FixtureEffectContext {
    #[must_use]
    pub fn ordered_phase(self) -> f64 {
        if self.count <= 1 {
            0.0
        } else {
            self.index as f64 / (self.count - 1) as f64
        }
    }
}

#[must_use]
pub fn sample(
    definition: &EffectDefinition,
    elapsed: Duration,
    beat_phase: f64,
    context: FixtureEffectContext,
) -> NormalizedValue {
    let time_phase = if definition.beat_sync {
        beat_phase * definition.beat_multiplier
    } else {
        elapsed.as_secs_f64() * definition.speed_hz
    };
    let direction = match definition.direction {
        EffectDirection::Forward => 1.0,
        EffectDirection::Reverse => -1.0,
    };
    let ordered_phase = match definition.order {
        EffectOrder::FixtureOrder => context.ordered_phase(),
        EffectOrder::LayoutX => context.x.clamp(0.0, 1.0),
        EffectOrder::LayoutY => context.y.clamp(0.0, 1.0),
    };
    let base_phase = (direction * time_phase).rem_euclid(1.0);
    let phase = if template_handles_fixture_order(definition.template) {
        base_phase
    } else {
        (base_phase + direction * ordered_phase * definition.spatial_phase).rem_euclid(1.0)
    };
    let wave = template_value(definition.template, phase, context, definition.seed);
    NormalizedValue::clamped(definition.offset.get() + definition.amplitude.get() * wave)
}

const fn template_handles_fixture_order(template: EffectTemplate) -> bool {
    matches!(
        template,
        EffectTemplate::Chase
            | EffectTemplate::Fill
            | EffectTemplate::RandomFlicker
            | EffectTemplate::Sparkle
            | EffectTemplate::TwoColorChase
            | EffectTemplate::RandomColor
            | EffectTemplate::FireCandleFlicker
    )
}

fn template_value(
    template: EffectTemplate,
    phase: f64,
    context: FixtureEffectContext,
    seed: u64,
) -> f64 {
    match template {
        EffectTemplate::Pulse => f64::from(phase < 0.5),
        EffectTemplate::SineWave | EffectTemplate::ColorWave | EffectTemplate::PanSweep => {
            sine01(phase)
        }
        EffectTemplate::Chase => {
            let count = context.count.max(1);
            let active = ((phase * count as f64).floor() as usize).min(count - 1);
            f64::from(context.index == active)
        }
        EffectTemplate::Fill => f64::from(context.ordered_phase() <= phase),
        EffectTemplate::RandomFlicker => {
            0.35 + deterministic_random(seed, phase, context.index) * 0.65
        }
        EffectTemplate::Sparkle => {
            f64::from(deterministic_random(seed, phase, context.index) > 0.9)
        }
        EffectTemplate::TwoColorChase => {
            let step = (phase * 2.0).floor() as usize;
            f64::from((context.index + step).is_multiple_of(2))
        }
        EffectTemplate::Rainbow => triangle((phase + context.ordered_phase()).rem_euclid(1.0)),
        EffectTemplate::RandomColor => deterministic_random(seed, phase, context.index),
        EffectTemplate::TiltBounce => (phase * TAU).sin().abs(),
        EffectTemplate::Circle => sine01(phase),
        EffectTemplate::FigureEight => sine01((phase * 2.0).rem_euclid(1.0)),
        EffectTemplate::FireCandleFlicker => {
            0.65 + deterministic_random(seed ^ 0xa5a5_a5a5, phase, context.index) * 0.35
        }
    }
}

fn sine01(phase: f64) -> f64 {
    0.5 + 0.5 * (phase * TAU).sin()
}

fn triangle(phase: f64) -> f64 {
    1.0 - (2.0 * phase - 1.0).abs()
}

fn deterministic_random(seed: u64, phase: f64, index: usize) -> f64 {
    let tick = (phase.rem_euclid(1.0) * 256.0).floor() as u64;
    let mut value = seed ^ tick.wrapping_mul(0x9e37_79b9_7f4a_7c15) ^ index as u64;
    value ^= value >> 30;
    value = value.wrapping_mul(0xbf58_476d_1ce4_e5b9);
    value ^= value >> 27;
    value = value.wrapping_mul(0x94d0_49bb_1331_11eb);
    value ^= value >> 31;
    value as f64 / u64::MAX as f64
}

#[must_use]
pub fn fan_value(
    base: NormalizedValue,
    spread: f64,
    index: usize,
    count: usize,
) -> NormalizedValue {
    if count <= 1 {
        return base;
    }
    let position = index as f64 / (count - 1) as f64;
    NormalizedValue::clamped(base.get() + (position - 0.5) * spread)
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BeatSource {
    Fixed,
    Tap,
    Audio,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BeatClock {
    bpm: f64,
    origin: Duration,
    source: BeatSource,
    confidence: NormalizedValue,
}

impl Default for BeatClock {
    fn default() -> Self {
        Self {
            bpm: 120.0,
            origin: Duration::ZERO,
            source: BeatSource::Fixed,
            confidence: NormalizedValue::FULL,
        }
    }
}

impl BeatClock {
    pub fn set_bpm(
        &mut self,
        bpm: f64,
        now: Duration,
        source: BeatSource,
        confidence: NormalizedValue,
    ) -> Result<(), EffectError> {
        if !bpm.is_finite() || !(20.0..=300.0).contains(&bpm) {
            return Err(EffectError::InvalidBpm(bpm));
        }
        self.bpm = bpm;
        self.origin = now;
        self.source = source;
        self.confidence = confidence;
        Ok(())
    }

    #[must_use]
    pub const fn bpm(&self) -> f64 {
        self.bpm
    }

    #[must_use]
    pub const fn source(&self) -> BeatSource {
        self.source
    }

    #[must_use]
    pub const fn confidence(&self) -> NormalizedValue {
        self.confidence
    }

    #[must_use]
    pub fn phase_at(&self, now: Duration) -> f64 {
        let beats = now.saturating_sub(self.origin).as_secs_f64() * self.bpm / 60.0;
        beats.rem_euclid(1.0)
    }

    pub fn shift_origin(&mut self, duration: Duration) {
        self.origin = self.origin.saturating_add(duration);
    }
}

#[derive(Clone, Debug, Default)]
pub struct TapTempo {
    taps: VecDeque<Duration>,
}

impl TapTempo {
    pub fn tap(&mut self, now: Duration) -> Option<f64> {
        if self
            .taps
            .back()
            .is_some_and(|last| now.saturating_sub(*last) > Duration::from_secs(3))
        {
            self.taps.clear();
        }
        self.taps.push_back(now);
        while self.taps.len() > 8 {
            self.taps.pop_front();
        }
        if self.taps.len() < 2 {
            return None;
        }

        let mut intervals: Vec<f64> = self
            .taps
            .iter()
            .zip(self.taps.iter().skip(1))
            .map(|(before, after)| after.saturating_sub(*before).as_secs_f64())
            .collect();
        intervals.sort_by(|left, right| left.partial_cmp(right).unwrap_or(Ordering::Equal));
        let median = intervals[intervals.len() / 2];
        if median <= f64::EPSILON {
            None
        } else {
            Some((60.0 / median).clamp(20.0, 300.0))
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum EffectError {
    NonFinite(&'static str),
    NegativeSpeed(f64),
    NegativeBeatMultiplier(f64),
    InvalidBpm(f64),
}

impl Display for EffectError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NonFinite(name) => write!(formatter, "{name} must be finite"),
            Self::NegativeSpeed(speed) => {
                write!(formatter, "effect speed cannot be negative: {speed}")
            }
            Self::NegativeBeatMultiplier(multiplier) => {
                write!(
                    formatter,
                    "beat multiplier cannot be negative: {multiplier}"
                )
            }
            Self::InvalidBpm(bpm) => write!(formatter, "BPM {bpm} must be between 20 and 300"),
        }
    }
}

impl Error for EffectError {}

#[cfg(test)]
mod tests {
    use super::*;

    fn definition(template: EffectTemplate) -> EffectDefinition {
        EffectDefinition {
            id: EffectId::new(1),
            name: "Test".into(),
            target_parameter: ParameterId::from("intensity"),
            template,
            amplitude: NormalizedValue::FULL,
            offset: NormalizedValue::ZERO,
            speed_hz: 1.0,
            beat_multiplier: 1.0,
            beat_sync: false,
            spatial_phase: 1.0,
            direction: EffectDirection::Forward,
            blend: EffectBlend::Replace,
            order: EffectOrder::FixtureOrder,
            seed: 42,
        }
    }

    #[test]
    fn every_mvp_template_stays_in_the_normalized_range() {
        let templates = [
            EffectTemplate::Pulse,
            EffectTemplate::SineWave,
            EffectTemplate::Chase,
            EffectTemplate::Fill,
            EffectTemplate::RandomFlicker,
            EffectTemplate::Sparkle,
            EffectTemplate::TwoColorChase,
            EffectTemplate::Rainbow,
            EffectTemplate::ColorWave,
            EffectTemplate::RandomColor,
            EffectTemplate::PanSweep,
            EffectTemplate::TiltBounce,
            EffectTemplate::Circle,
            EffectTemplate::FigureEight,
            EffectTemplate::FireCandleFlicker,
        ];
        for template in templates {
            for tick in 0..100 {
                let value = sample(
                    &definition(template),
                    Duration::from_millis(tick * 17),
                    0.0,
                    FixtureEffectContext {
                        index: tick as usize % 8,
                        count: 8,
                        x: 0.0,
                        y: 0.0,
                    },
                );
                assert!((0.0..=1.0).contains(&value.get()));
            }
        }
    }

    #[test]
    fn chase_activates_one_fixture_at_a_time() {
        let effect = definition(EffectTemplate::Chase);
        let values: Vec<_> = (0..4)
            .map(|index| {
                sample(
                    &effect,
                    Duration::from_millis(300),
                    0.0,
                    FixtureEffectContext {
                        index,
                        count: 4,
                        x: 0.0,
                        y: 0.0,
                    },
                )
                .get()
            })
            .collect();
        assert_eq!(values, vec![0.0, 1.0, 0.0, 0.0]);
    }

    #[test]
    fn tap_tempo_estimates_a_stable_bpm() {
        let mut taps = TapTempo::default();
        assert_eq!(taps.tap(Duration::ZERO), None);
        assert_eq!(taps.tap(Duration::from_millis(500)), Some(120.0));
        assert_eq!(taps.tap(Duration::from_millis(1000)), Some(120.0));
    }

    #[test]
    fn fanning_spreads_around_the_base_value() {
        let base = NormalizedValue::new(0.5).unwrap();
        assert_eq!(fan_value(base, 0.6, 0, 3).get(), 0.2);
        assert_eq!(fan_value(base, 0.6, 1, 3).get(), 0.5);
        assert_eq!(fan_value(base, 0.6, 2, 3).get(), 0.8);
    }
}
