# Show Core behavior baseline

**Status:** implemented MVP baseline
**Contract version:** 1

This specification defines operator-visible behavior independently of the desktop UI and DMX protocol.

## Command processing

- UI, keyboard, cue controls and future MIDI/OSC adapters submit the same `CommandEnvelope`.
- The Show Core is the single writer of authoritative runtime state.
- Every accepted command increments the project revision exactly once.
- An edit command with a stale `expectedRevision` is rejected without changing state.
- Structural commands such as storing scenes, cue lists and effects are rejected in LIVE mode.
- Domain events are reliable low-frequency results of accepted commands. DMX frames and meters are not domain events.

## Programmer and Blind

- A manual parameter edit writes to the programmer layer and overrides scene/effect values for that parameter.
- Clear Programmer removes programmer values; it does not write zeros into scene layers.
- In Blind, manual edits write to a separate blind programmer and do not affect resolved output.
- Commit Blind merges the blind programmer into the live programmer atomically and clears the blind buffer.

## Partial scenes and LTP

- A scene contains only explicitly captured fixture parameters.
- Scene activation creates a new immutable runtime layer.
- For each parameter, the latest activated layer containing that parameter wins.
- A newer partial scene does not change parameters it does not contain.
- Releasing the newest layer reveals the next applicable older layer.
- Releasing with a duration interpolates from the current look to the revealed underlying look.

## Transitions

- Transition time uses an injected monotonic clock, never wall-clock time or tick counting.
- A transition captures its start value when activated.
- A zero-duration transition reaches the exact target without floating-point drift.
- The current scalar baseline interpolates normalized logical parameters. Color-space-specific interpolation will be introduced with the richer color-intent model.

## Cue list

- GO activates the next cue's scene through the same scene command path.
- Previous cue layers remain below the current cue, providing simple partial-scene tracking.
- BACK releases the current cue activation and reveals the previous cue layer.
- BACK on the first cue returns the list to its pre-show position.
- A paused cue list rejects GO until resumed. Output itself continues.

## Effects, chase and fanning

- Effects produce logical parameter values and never DMX slot values.
- The MVP templates are Pulse, Sine Wave, Chase, Fill, Random Flicker, Sparkle, Two-Color Chase, Rainbow, Color Wave, Random Color, Pan Sweep, Tilt Bounce, Circle, Figure Eight and Fire/Candle Flicker.
- Effects can use explicit fixture order or normalized layout X/Y position.
- A deterministic seed makes random effects reproducible.
- Fanning is a static normalized spread around a base value and is separate from time-varying effects.
- The shared BeatClock supports fixed BPM and Tap Tempo now; audio analysis will publish into the same clock contract.

## Freeze, Grand Master and Blackout

- Freeze pins transition, effect and beat time while the last frame continues to be transmitted.
- Releasing Freeze shifts runtime origins by the paused duration, so there is no time jump.
- Grand Master scales only fixture parameters mapped to the Intensity capability.
- Blackout sets only Intensity-capability DMX slots to zero.
- Grand Master and Blackout are applied in the output safety lane after logical resolution and do not mutate scenes or programmer state.
