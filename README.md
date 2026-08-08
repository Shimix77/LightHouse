# LightHouse

LightHouse is a macOS-first professional desktop application for designing and running DMX lighting shows from a visual 2D stage layout.

The approved internal macOS MVP is feature-complete. It combines a headless Rust show engine with a Tauri 2 desktop shell and a React/PixiJS professional dark interface. The engine remains fully separated from the UI so DMX output can continue through a temporary UI freeze or restart. Public notarization and the later Windows release remain deliberately outside this milestone.

## Documentation

- [Slovenský používateľský návod – prvé kroky](docs/USER_GUIDE_SK.md)
- [Technical architecture](docs/architecture/ARCHITECTURE.md)
- [Approved MVP decisions](docs/architecture/MVP_DECISIONS.md)
- [Show Core behavior baseline](docs/behavior-specs/SHOW_CORE.md)
- [Project format and recovery baseline](docs/behavior-specs/PROJECT_FORMAT.md)
- [Engine sidecar and IPC baseline](docs/behavior-specs/ENGINE_SIDECAR.md)
- [Fail-safe and crash-recovery behavior](docs/behavior-specs/FAILSAFE_RECOVERY.md)
- [macOS bundle and sidecar packaging](docs/behavior-specs/MACOS_BUNDLE.md)
- [MVP 1 acceptance record](docs/MVP1_ACCEPTANCE.md)

## Workspace

The Rust engine has no UI or physical-DMX dependency. Its modules cover:

- stable domain identifiers and normalized logical values;
- canonical fixture modes with 8/16-bit DMX bindings;
- conflict-safe patching and unlimited logical universe identifiers;
- logical-parameter resolution into 512-slot DMX frames;
- a protocol-independent output API with virtual DMX, Art-Net and FTDI/Open-DMX USB adapters;
- an independent configurable 30–44 Hz output loop with hold-last-look, watchdog and safety blackout;
- one versioned command/event path for UI and future external controllers;
- partial-scene LTP layering, deterministic fades, cue GO/BACK/PAUSE and Blind/Freeze;
- 15 deterministic effect templates, spatial fixture ordering, fanning and Tap Tempo.

The desktop workspace adds:

- a Tauri 2 macOS window prepared for later Windows builds;
- a React 19 professional dark UI with a Project Browser, guided setup and DESIGN/LIVE safety separation;
- a PixiJS 8 WebGL stage editor with zoom, pan, rectangle and multi-selection;
- a Lightkey-inspired fixture library and visual 512-channel patch manager;
- fixture, scene/cue/effect, grand-master, Blackout, Blind and Freeze controls;
- movable, resizable and color-configurable Live buttons with toggle, flash, push and radio behavior;
- PNG/JPG floor-plan backgrounds and keyboard editing shortcuts.

Physical USB-DMX output is disabled when first configured. Enabling it later in Output Settings requires an explicit confirmation before LightHouse opens the serial device and begins transmitting.

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

With explicit authorization and the physical output safely connected, a USB-DMX blackout-only smoke test is available:

```sh
cargo run -p lighthouse-output-usb-dmx --example blackout_smoke -- /dev/cu.usbserial-DEVICE
```
