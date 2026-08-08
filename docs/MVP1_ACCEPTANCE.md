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

## Deliberately outside MVP 1

- Windows build/installer, requested only after the macOS application is complete
- MIDI/MIDI feedback, OSC, Stream Deck, sACN and USB-DMX adapters; the shared command and output-adapter boundaries are ready for them
- Full GDTF import, pixel matrices and 3D beam visualization
- Apple Developer ID signing/notarization for public downloads; this requires owner credentials and is not needed for internal MVP use

Before using the build on a paid live production, perform a venue-network rehearsal with the exact Art-Net nodes and fixtures. The virtual suite proves protocol/timing behavior but cannot validate third-party hardware firmware or the venue network.
