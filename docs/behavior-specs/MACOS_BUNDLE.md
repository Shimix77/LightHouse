# macOS application bundle

## Reproducible local build

```sh
pnpm desktop:build
```

The Tauri pre-build hook builds `lighthouse-show-engine-app` for the current Rust host target, copies it to the target-triple filename required by Tauri, builds the web UI, and creates `LightHouse.app`.

```sh
pnpm desktop:dmg
```

This additionally creates the drag-to-Applications DMG installer. Both commands use an ad-hoc macOS signature for internal testing.

## Sidecar contract

- `bundle.externalBin` embeds the headless show engine in the application bundle.
- Development continues to use the workspace `target/debug` engine built by `beforeDevCommand`.
- A packaged desktop executable resolves the engine as a sibling executable inside `LightHouse.app/Contents/MacOS`; it does not depend on Cargo, Node.js, shell `$PATH` or the source workspace.
- `LIGHTHOUSE_ENGINE_PATH` remains an explicit test/development override only.
- The build script accepts `LIGHTHOUSE_TARGET_TRIPLE` for a later architecture-specific build. Windows packaging will use the same sidecar contract with the `.exe` suffix, but Windows installer work remains a later user-approved phase.

## Permissions and signing

- The merged `Info.plist` contains the microphone usage explanation used by the beat detector.
- The macOS entitlement permits audio input.
- Ad-hoc signing is sufficient for internal MVP installation. Public distribution requires the owner’s Apple Developer ID credentials and notarization; those secrets are intentionally not stored in the repository.

## Bundle smoke test

The release checklist verifies that:

1. the `.app` and embedded sidecar have the expected Mach-O architecture;
2. both binaries have valid ad-hoc signatures;
3. the sidecar is present in `Contents/MacOS` and starts without workspace files;
4. the app opens, creates/loads its demo `.lightshow`, connects to the sidecar and keeps emitting Art-Net frames;
5. `NSMicrophoneUsageDescription` is present in the final merged `Info.plist`.
