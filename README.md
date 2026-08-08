# LightHouse

LightHouse is a macOS-first professional desktop application for designing and running DMX lighting shows from a visual 2D stage layout.

The project is under active MVP development. It combines a headless Rust show engine with a Tauri 2 desktop shell and a React/PixiJS professional dark interface. The engine remains fully separated from the UI so DMX output can continue through a temporary UI freeze or restart.

## Documentation

- [Technical architecture](docs/architecture/ARCHITECTURE.md)
- [Approved MVP decisions](docs/architecture/MVP_DECISIONS.md)
- [Show Core behavior baseline](docs/behavior-specs/SHOW_CORE.md)
- [Project format and recovery baseline](docs/behavior-specs/PROJECT_FORMAT.md)
- [Engine sidecar and IPC baseline](docs/behavior-specs/ENGINE_SIDECAR.md)
- [Fail-safe and crash-recovery behavior](docs/behavior-specs/FAILSAFE_RECOVERY.md)
- [macOS bundle and sidecar packaging](docs/behavior-specs/MACOS_BUNDLE.md)

## Workspace

The Rust engine has no UI or physical-DMX dependency. Its modules cover:

- stable domain identifiers and normalized logical values;
- canonical fixture modes with 8/16-bit DMX bindings;
- conflict-safe patching and unlimited logical universe identifiers;
- logical-parameter resolution into 512-slot DMX frames;
- a protocol-independent output API, virtual DMX output and Art-Net adapter;
- an independent configurable 30–44 Hz output loop with hold-last-look, watchdog and safety blackout;
- one versioned command/event path for UI and future external controllers;
- partial-scene LTP layering, deterministic fades, cue GO/BACK/PAUSE and Blind/Freeze;
- 15 deterministic effect templates, spatial fixture ordering, fanning and Tap Tempo.

The desktop workspace adds:

- a Tauri 2 macOS window prepared for later Windows builds;
- a React 19 professional dark UI with EDIT/LIVE safety separation;
- a PixiJS 8 WebGL stage editor with zoom, pan, rectangle and multi-selection;
- fixture, inspector, scene/cue, grand-master, Blackout, Blind and Freeze controls;
- PNG/JPG floor-plan backgrounds and keyboard editing shortcuts.

Run the full verification suite with:

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Install the desktop dependencies and run the UI or native shell with:

```sh
pnpm install
pnpm ui:dev
pnpm desktop:dev
```

Build the self-contained macOS application bundle with:

```sh
pnpm desktop:build
```

Create the internal ad-hoc signed DMG installer with `pnpm desktop:dmg`. Public distribution additionally requires Apple Developer ID signing and notarization credentials.

For a local end-to-end check, start `lighthouse-virtual-dmx-node`, then run
`lighthouse-show-engine-app`. The demo sends a two-second Art-Net look to localhost.
