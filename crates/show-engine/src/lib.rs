//! Timing primitives and a UI-independent DMX output loop.

mod show_core;

pub use show_core::{CueRuntimeSnapshot, ShowCore, ShowSnapshot};

use std::io;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, TryLockError};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use lighthouse_domain::NormalizedValue;
use lighthouse_output_api::{FrameSet, OutputAdapter};

pub const DEFAULT_DMX_REFRESH_HZ: u32 = 44;

pub trait MonotonicClock: Clone + Send + Sync + 'static {
    fn now(&self) -> Duration;
}

#[derive(Clone, Debug)]
pub struct SystemClock {
    origin: Instant,
}

impl Default for SystemClock {
    fn default() -> Self {
        Self {
            origin: Instant::now(),
        }
    }
}

impl MonotonicClock for SystemClock {
    fn now(&self) -> Duration {
        self.origin.elapsed()
    }
}

#[derive(Clone, Debug, Default)]
pub struct ManualClock {
    micros: Arc<AtomicU64>,
}

impl ManualClock {
    pub fn set(&self, time: Duration) {
        self.micros
            .store(duration_to_micros(time), Ordering::Release);
    }

    pub fn advance(&self, duration: Duration) {
        self.micros
            .fetch_add(duration_to_micros(duration), Ordering::AcqRel);
    }
}

impl MonotonicClock for ManualClock {
    fn now(&self) -> Duration {
        Duration::from_micros(self.micros.load(Ordering::Acquire))
    }
}

fn duration_to_micros(duration: Duration) -> u64 {
    u64::try_from(duration.as_micros()).unwrap_or(u64::MAX)
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LinearFade {
    pub start: Duration,
    pub duration: Duration,
    pub from: f64,
    pub to: f64,
}

impl LinearFade {
    #[must_use]
    pub fn value_at(self, now: Duration) -> f64 {
        if now <= self.start {
            return self.from;
        }
        if self.duration.is_zero() || now >= self.start.saturating_add(self.duration) {
            return self.to;
        }
        let elapsed = now.saturating_sub(self.start).as_secs_f64();
        let progress = elapsed / self.duration.as_secs_f64();
        self.from + (self.to - self.from) * progress
    }
}

#[derive(Debug)]
struct SharedState {
    latest_frames: Mutex<Option<Arc<FrameSet>>>,
    stop: AtomicBool,
    blackout: AtomicBool,
    grand_master_bits: AtomicU64,
    frames_sent: AtomicU64,
    send_errors: AtomicU64,
    missed_deadlines: AtomicU64,
}

impl Default for SharedState {
    fn default() -> Self {
        Self {
            latest_frames: Mutex::new(None),
            stop: AtomicBool::new(false),
            blackout: AtomicBool::new(false),
            grand_master_bits: AtomicU64::new(1.0_f64.to_bits()),
            frames_sent: AtomicU64::new(0),
            send_errors: AtomicU64::new(0),
            missed_deadlines: AtomicU64::new(0),
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct OutputMetrics {
    pub frames_sent: u64,
    pub send_errors: u64,
    pub missed_deadlines: u64,
}

pub struct DmxOutputLoop {
    shared: Arc<SharedState>,
    worker: Option<JoinHandle<()>>,
}

impl DmxOutputLoop {
    pub fn start<A: OutputAdapter>(adapter: A, refresh_hz: u32) -> io::Result<Self> {
        if refresh_hz == 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "refresh rate must be greater than zero",
            ));
        }

        let shared = Arc::new(SharedState::default());
        let worker_shared = Arc::clone(&shared);
        let worker = thread::Builder::new()
            .name("lighthouse-dmx-output".into())
            .spawn(move || run_output_loop(adapter, refresh_hz, worker_shared))?;
        Ok(Self {
            shared,
            worker: Some(worker),
        })
    }

    /// Publishes the latest complete frame set. The output worker never waits for this producer.
    pub fn publish(&self, frames: FrameSet) {
        let mut latest = self
            .shared
            .latest_frames
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *latest = Some(Arc::new(frames));
    }

    pub fn set_blackout(&self, enabled: bool) {
        self.shared.blackout.store(enabled, Ordering::Release);
        if let Some(worker) = &self.worker {
            worker.thread().unpark();
        }
    }

    pub fn set_grand_master(&self, value: NormalizedValue) {
        self.shared
            .grand_master_bits
            .store(value.get().to_bits(), Ordering::Release);
        if let Some(worker) = &self.worker {
            worker.thread().unpark();
        }
    }

    #[must_use]
    pub fn metrics(&self) -> OutputMetrics {
        OutputMetrics {
            frames_sent: self.shared.frames_sent.load(Ordering::Acquire),
            send_errors: self.shared.send_errors.load(Ordering::Acquire),
            missed_deadlines: self.shared.missed_deadlines.load(Ordering::Acquire),
        }
    }

    pub fn shutdown(mut self) {
        self.stop_and_join();
    }

    fn stop_and_join(&mut self) {
        self.shared.stop.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            worker.thread().unpark();
            let _ = worker.join();
        }
    }
}

impl Drop for DmxOutputLoop {
    fn drop(&mut self) {
        self.stop_and_join();
    }
}

fn run_output_loop<A: OutputAdapter>(mut adapter: A, refresh_hz: u32, shared: Arc<SharedState>) {
    let period = Duration::from_secs_f64(1.0 / f64::from(refresh_hz));
    let mut next_deadline = Instant::now();
    let mut active_frames: Option<Arc<FrameSet>> = None;

    while !shared.stop.load(Ordering::Acquire) {
        match shared.latest_frames.try_lock() {
            Ok(latest) => {
                if let Some(frames) = latest.as_ref() {
                    active_frames = Some(Arc::clone(frames));
                }
            }
            Err(TryLockError::WouldBlock) => {}
            Err(TryLockError::Poisoned(error)) => {
                if let Some(frames) = error.into_inner().as_ref() {
                    active_frames = Some(Arc::clone(frames));
                }
            }
        }

        if let Some(frames) = active_frames.as_ref() {
            let grand_master = NormalizedValue::clamped(f64::from_bits(
                shared.grand_master_bits.load(Ordering::Acquire),
            ));
            let result = if shared.blackout.load(Ordering::Acquire) {
                adapter.send(&frames.blackout_copy())
            } else if grand_master != NormalizedValue::FULL {
                adapter.send(&frames.intensity_scaled_copy(grand_master))
            } else {
                adapter.send(frames)
            };
            match result {
                Ok(()) => {
                    shared.frames_sent.fetch_add(1, Ordering::Relaxed);
                }
                Err(_) => {
                    shared.send_errors.fetch_add(1, Ordering::Relaxed);
                }
            }
        }

        next_deadline += period;
        let now = Instant::now();
        if now > next_deadline {
            shared.missed_deadlines.fetch_add(1, Ordering::Relaxed);
            next_deadline = now + period;
        }
        thread::park_timeout(next_deadline.saturating_duration_since(Instant::now()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lighthouse_output_api::VirtualDmxOutput;

    #[test]
    fn manual_clock_makes_fades_deterministic() {
        let clock = ManualClock::default();
        let fade = LinearFade {
            start: Duration::from_secs(1),
            duration: Duration::from_secs(2),
            from: 0.0,
            to: 1.0,
        };

        clock.set(Duration::from_secs(2));
        assert_eq!(fade.value_at(clock.now()), 0.5);
        clock.advance(Duration::from_secs(2));
        assert_eq!(fade.value_at(clock.now()), 1.0);
    }

    #[test]
    fn output_continues_repeating_the_last_frame_without_a_ui() {
        let (adapter, handle) = VirtualDmxOutput::new();
        let output = DmxOutputLoop::start(adapter, 100).unwrap();
        output.publish(FrameSet::default());
        thread::sleep(Duration::from_millis(45));

        let send_count = handle.snapshot().send_count;
        output.shutdown();
        assert!(
            send_count >= 2,
            "expected repeated output, got {send_count} sends"
        );
    }

    #[test]
    fn blackout_is_applied_without_mutating_the_published_frame() {
        use lighthouse_domain::UniverseId;

        let (adapter, handle) = VirtualDmxOutput::new();
        let output = DmxOutputLoop::start(adapter, 100).unwrap();
        let mut frames = FrameSet::default();
        frames
            .frame_mut(UniverseId::new(1))
            .set_slot(1, 255, true)
            .unwrap();
        output.publish(frames);
        output.set_blackout(true);
        thread::sleep(Duration::from_millis(30));

        let snapshot = handle.snapshot();
        output.shutdown();
        assert_eq!(
            snapshot
                .last_frames
                .unwrap()
                .frame(UniverseId::new(1))
                .unwrap()
                .slot(1),
            Some(0)
        );
    }

    #[test]
    fn grand_master_is_applied_in_the_output_safety_lane() {
        use lighthouse_domain::UniverseId;

        let (adapter, handle) = VirtualDmxOutput::new();
        let output = DmxOutputLoop::start(adapter, 100).unwrap();
        let mut frames = FrameSet::default();
        frames
            .frame_mut(UniverseId::new(1))
            .set_slot(1, 200, true)
            .unwrap();
        output.publish(frames);
        output.set_grand_master(NormalizedValue::new(0.25).unwrap());
        thread::sleep(Duration::from_millis(30));

        let snapshot = handle.snapshot();
        output.shutdown();
        assert_eq!(
            snapshot
                .last_frames
                .unwrap()
                .frame(UniverseId::new(1))
                .unwrap()
                .slot(1),
            Some(50)
        );
    }
}
