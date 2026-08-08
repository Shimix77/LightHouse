# Project format and recovery baseline

**Current schema:** 1

## `.lightshow` container

A project is a ZIP container with stored entries. PNG/JPG backgrounds are already compressed, so MVP persistence does not spend show time recompressing them.

```text
MyShow.lightshow
├── manifest.json
├── project.json
├── fixtures/
│   └── <embedded immutable definition revisions>.json
└── assets/
    └── background/
        └── <PNG or JPG>
```

- `manifest.json` owns `schemaVersion`, application version, exact fixture revision paths and asset paths.
- `project.json` owns universes, fixture instances, patch, layout, groups, scenes, cue lists, effects and Live controls.
- Fixture definitions used by a show are embedded. Updating the global library cannot silently change an existing project.
- Archive paths are validated and traversal paths are rejected.

## Save and backups

- Save validates all fixture definitions, references and patch conflicts before writing.
- The complete container is written to a unique sibling temporary file and flushed.
- If a previous project exists, it is copied to `<project>.bak`.
- On macOS the temporary file is renamed over the destination as one filesystem operation.
- A failed write removes only its own temporary file and leaves the previous project untouched.

## Autosave and recovery

- Accepted commands can be appended to a JSON Lines recovery journal and flushed independently of the main project save.
- Recovery accepts complete valid entries in order.
- Only an incomplete final line is ignored after a crash; corruption in the middle is reported and never silently skipped.
- After a successful project checkpoint the recovery journal can be truncated.
- Default autosave interval is 30 seconds while dirty.

## Migration

- The loader reads the manifest version before deserializing project data.
- Schema v0 has an explicit v0 → v1 migration and produces an operator-visible warning that output routes must be configured.
- Unknown newer schemas are rejected without modifying the file.
