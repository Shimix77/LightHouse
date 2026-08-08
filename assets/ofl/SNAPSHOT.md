# Open Fixture Library snapshot

- Upstream: https://github.com/OpenLightingProject/open-fixture-library
- Commit: `e0a9435badf8f0b75132a9eb2ba44a4909f1e080`
- Snapshot date: 2026-08-08
- License: MIT; see `LICENSE.txt`
- Pack SHA-256: `540a28542912cf1596369a53633166c7a7e01071a052daabfce81ab29d6236f3`
- Conversion: `cargo run -p lighthouse-fixture-library --bin build_ofl_pack -- <fixtures> assets/ofl/ofl-mvp-pack.json`

The shipped file contains LightHouse's stable, validated intermediate representation. It does not expose the changing OFL JSON schema to the Show Engine. Matrix insertion modes and redirect-only records that cannot be represented by the MVP logical parameter model are skipped.
