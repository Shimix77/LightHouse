# MVP 1 acceptance record

Status: **feature-complete macOS internal MVP**

## Accepted capability matrix

| Area | MVP evidence |
|---|---|
| Professional desktop shell | Tauri 2 macOS app, dark EDIT/LIVE UI, native project dialogs, second Live window |
| 2D Stage Editor | PixiJS/WebGL layout, PNG/JPG floor plan, drag, zoom, pan, rectangle/multi-select, inspector resize/rotation, grid/snap, layers, lock/hide, undo/redo, copy/paste/duplicate/delete |
| Fixtures | Logical parameter model, 8/16-bit bindings, axis inversion, embedded generic pack, 613-profile pinned OFL snapshot and Custom Fixture Editor |
| Patch/universes | Conflict validation, auto-patch, unlimited logical universe IDs, per-universe enable/name/Art-Net route |
| Real-time output | UI-independent headless Rust sidecar, immutable frame publication, independent 30–44 Hz output thread, non-blocking Art-Net adapter |
| Scenes/cues | Partial logical scenes, last-activated LTP layering, intensity/color-capable fades, cue GO/BACK/PAUSE |
| Effects | 15 parameter-based templates including chase, spatial X/Y ordering, intensity/color/pan/tilt/zoom fanning |
| Tempo/audio | Fixed BPM, Tap Tempo, beat-synced effects and local microphone onset/tempo analysis |
| Live safety | Grand Master, priority Blackout, Blind/commit, Freeze, large Live controls and external Live display |
| Reliability | Atomic `.lightshow` saves, backups/corrupt-primary recovery, command journal replay, sidecar reconnect, hold-last or timeout-blackout watchdog |
| Output diagnostics | Frames, errors, missed ticks, dropped commands and fail-safe state visible in UI; virtual DMX and real loopback ArtDmx tests |
| Distribution | Self-contained ad-hoc signed arm64 `.app` and verified drag-to-Applications DMG with embedded sidecar |

## Verification baseline

- `cargo test --workspace`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `pnpm ui:check` and `pnpm ui:build`
- Browser interaction/visual checks at wide and minimum supported desktop widths
- Embedded sidecar smoke test from `/private/tmp`: 88 frames at 44 Hz, zero output errors and zero missed deadlines
- Packaged app launch, authenticated sidecar connection and clean macOS Quit lifecycle
- `codesign --verify --deep --strict` for the `.app`
- `hdiutil verify`, read-only mount inspection and SHA-256 for the DMG

## Final completion audit — 2026-08-08

The cumulative `codex/mvp1-complete` branch was re-audited against the original requirements and the approved decisions, using the current worktree and packaged artifacts rather than prior progress reports.

| Gate | Final evidence |
|---|---|
| Rust correctness | `cargo fmt --all -- --check`, Clippy with warnings denied, and all 69 workspace tests passed |
| UI correctness | TypeScript project check and production Vite build passed; 738 modules transformed |
| Stage interaction | Browser acceptance passed for fixture selection, copy, paste, undo, EDIT/LIVE structural locks, Blackout, Freeze, rotation, object lock and snap |
| Fixture library | Embedded pack parsed and semantically validated: 613 OFL profiles, 131 manufacturers and 1,951 modes, plus three generic profiles |
| Packaged process isolation | The arm64 `.app` launched separate desktop and Show Engine processes and authenticated over the versioned local IPC contract |
| UI-freeze safety | While the desktop process was held in `SIGSTOP` for 1.2 seconds, the sidecar advanced output by 54 frames with zero send errors and zero missed deadlines |
| Clean lifecycle | Native Quit stopped both processes and left a zero-byte recovery journal after checkpointing |
| Distribution | Both executables are arm64 Mach-O, deep strict code-sign verification passed, microphone entitlement and usage description are present, and `hdiutil verify` reports a valid DMG |

Final internal installer: `LightHouse_0.1.0_aarch64.dmg` (5.5 MB)

SHA-256: `d05e136fd763f1da2ec1e56f3cc03eba0310dcca0c44bd31d3c6c1a76e272264`

## Deliberately outside MVP 1

- Windows build/installer, requested only after the macOS application is complete
- MIDI/MIDI feedback, OSC, Stream Deck, sACN and USB-DMX adapters; the shared command and output-adapter boundaries are ready for them
- Full GDTF import, pixel matrices and 3D beam visualization
- Apple Developer ID signing/notarization for public downloads; this requires owner credentials and is not needed for internal MVP use

Before using the build on a paid live production, perform a venue-network rehearsal with the exact Art-Net nodes and fixtures. The virtual suite proves protocol/timing behavior but cannot validate third-party hardware firmware or the venue network.
