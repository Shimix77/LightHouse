# Fixture library and custom profiles

Status: MVP behavior contract

## Offline catalog

- LightHouse ships three generic profiles and 613 profiles converted from the pinned Open Fixture Library snapshot.
- The catalog is available without internet access and can be searched by manufacturer or model.
- OFL data is converted at build time into the versioned LightHouse fixture model. The Show Engine never depends on OFL's changing JSON schema.
- A catalog definition is copied into a `.lightshow` file only after a fixture using it is added. Existing shows therefore remain portable even if the global catalog later changes.
- The embedded OFL source commit, license and generated-pack checksum are recorded in `assets/ofl/SNAPSHOT.md`.

## Logical conversion

- Intensity, RGB/white/amber/UV colors, pan/tilt, zoom, focus, iris, frost, shutter/strobe, gobo and color wheels map to logical parameter groups.
- A coarse channel and its first fine alias form a 16-bit binding. Additional 24/32-bit aliases are intentionally outside MVP scope.
- Other directly addressable channels remain available as custom logical parameters and are controllable from the fixture inspector.
- Matrix insertion modes and redirect-only entries that cannot be represented safely are skipped; supported direct modes from the same fixture remain available.

## Custom fixture editor

- The full-screen wizard defines fixture type, manufacturer, model, built-in icon, beam category/angles, one mode, footprint and physical channels.
- Every physical channel stores a searchable Lightkey-style logical property plus one or more named DMX ranges with raw bounds, semantic bounds/units and safety flags.
- Ranges must cover exactly 0–255 without gaps or overlaps. Invalid channel numbers, duplicate offsets/logical IDs and offsets outside the footprint are also rejected before saving.
- Each parameter uses one 8-bit coarse channel or an explicitly assigned coarse/fine 16-bit pair. All defaults are zero.
- Optional cell/pixel numbers produce independent segment parameters. Complete RGB components automatically expose virtual color control.
- RGB fixtures without a physical master dimmer receive a Lightkey-style virtual dimmer. It scales all emitter channels and marks them for Grand Master, Blackout and watchdog-blackout processing.
- The tested generic four-channel LED PAR profile is `Red, Green, Blue, White`. Its fourth white emitter has an explicit Color control and is scaled by the same virtual dimmer as RGB.
- Pan/Tilt axis inversion is stored per fixture instance. Editing a custom definition updates all of its existing instances after patch validation.
- A saved, patched fixture can be exercised through a confirmation-gated physical tester that still sends logical parameter commands through the resolver.
- Custom definitions are embedded in the project and use the same resolver, scene, effect and inspector paths as library fixtures.
