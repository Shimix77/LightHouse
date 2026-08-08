# Project workflow and recovery

Status: MVP behavior contract

## Project actions

- Clicking the project name opens New Project, Open Project, Save As and recent-project actions.
- Native macOS dialogs only expose the single path selected by the user to the Rust backend. The web UI has no general filesystem permission.
- New projects start with one universe and a localhost Art-Net route, but no fixtures, scenes or layout objects.
- Every structural edit is atomically saved before the UI reports success, so project switching never needs an unsaved-changes prompt.
- Opening or creating a project starts and validates its new headless Show Engine before the previous engine is shut down.
- The most recent ten existing project paths and the last active project are kept in versioned desktop preferences.
- Keyboard shortcuts: `Cmd/Ctrl+N` creates, `Cmd/Ctrl+O` opens, and `Shift+Cmd/Ctrl+S` saves a copy.

## Recovery

- Every overwrite creates a `.bak` sibling before the atomic replacement.
- If the primary `.lightshow` archive is invalid, LightHouse validates and loads its backup.
- Before restoring, the invalid primary is moved to a unique `.corrupt-N` sibling so the evidence remains recoverable.
- The validated backup becomes the new primary before any later autosave can run.
- A visible recovery notice reports both the backup source and preserved damaged path.
- If the last active project and its backup are unavailable, startup falls back to the demo project and reports why.
