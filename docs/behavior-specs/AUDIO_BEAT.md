# Microphone beat synchronization

Status: MVP behavior contract

## User behavior

- Microphone analysis starts only after the user presses `MIC` and grants macOS permission.
- The control shows the live input level and the confidence of the current tempo estimate.
- A valid estimate changes the shared show tempo and marks its source as `audio`.
- Pressing `MIC` again stops and releases the microphone immediately. The last detected BPM is retained as a fixed tempo.
- Manual BPM entry changes the source to `fixed`; tapping `TAP` changes it to `tap`.
- Denied permission or unavailable input is reported on the control and never stops DMX output.

## Analysis pipeline

1. Capture one microphone stream with browser echo cancellation, automatic gain and noise suppression disabled.
2. Combine 45–180 Hz spectral energy with the time-domain RMS level.
3. Detect onsets against an adaptive 120-sample mean and deviation threshold with a 230 ms refractory period.
4. Estimate tempo from the latest 16 valid onset intervals.
5. Normalize half/double-time candidates into 70–180 BPM and publish only estimates with sufficient consistency and sample confidence.
6. Send coalesced background-priority tempo commands to the headless Show Engine.

## Reliability boundary

Audio analysis is an input adapter. It never produces DMX values and it does not run in the DMX output loop. If the UI or microphone analysis pauses, the Show Engine continues running effects and output at the last accepted tempo.
