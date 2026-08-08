# LightHouse

LightHouse is a macOS-first professional desktop application for designing and running DMX lighting shows from a visual 2D stage layout.

The project is currently in MVP 0. The first implementation slice is a headless Rust engine designed for later Windows support, with the user interface fully separated from real-time DMX output.

## Documentation

- [Technical architecture](docs/architecture/ARCHITECTURE.md)
- [Approved MVP decisions](docs/architecture/MVP_DECISIONS.md)

## MVP 0 engine workspace

The Rust workspace deliberately has no UI and no physical-DMX dependency. Its modules cover:

- stable domain identifiers and normalized logical values;
- canonical fixture modes with 8/16-bit DMX bindings;
- conflict-safe patching and unlimited logical universe identifiers;
- logical-parameter resolution into 512-slot DMX frames;
- a protocol-independent output API, virtual DMX output and Art-Net adapter;
- an independent 44 Hz output loop with hold-last-look and safety blackout.

Run the full verification suite with:

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

For a local end-to-end check, start `lighthouse-virtual-dmx-node`, then run
`lighthouse-show-engine-app`. The demo sends a two-second Art-Net look to localhost.
