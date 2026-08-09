# Art-Net output behavior

## User contract

- The Art-Net status control in the top bar opens output configuration and live diagnostics.
- A project has no hard-coded universe count. Each DMX universe owns at most one Art-Net route in MVP 1.
- New universes default to a safe loopback route (`127.0.0.1:6454`) and consecutive zero-based Art-Net port-addresses. This prevents a new project from broadcasting onto a show network before the technician chooses a destination.
- A route contains a user-facing name, enabled state, 15-bit Art-Net port-address, IPv4 destination with UDP port, optional local IPv4 interface, and broadcast opt-in.
- Leaving Interface empty lets the operating system choose the source interface. Setting it binds a dedicated non-blocking UDP socket to that local address.
- Applying route changes is allowed only in EDIT mode. The project is validated and saved atomically, then the headless show engine is restarted so network sockets are recreated from the saved configuration.
- Invalid destinations, IPv6 values, out-of-range port-addresses, duplicate universe IDs and multiple routes for one universe are rejected before output starts.

## Output guarantees

- The UI never creates or sends ArtDmx packets. It modifies versioned project data through the project command boundary.
- The headless engine translates logical fixture parameters into DMX frames and publishes them to the independent 44 Hz output loop.
- Art-Net is an output adapter behind the protocol-neutral output contract. Its UDP sockets are non-blocking, and UI freezes do not stop the output loop.
- Disabled universes are not routed. Universes without a matching frame are skipped.
- `WouldBlock` is treated as a dropped network packet instead of stalling the real-time loop; other socket failures increment output error telemetry.

## Diagnostics

The output dialog displays frames sent, send errors, missed output deadlines and dropped engine commands. These counters come from the show-engine snapshot, not from UI estimates.

## Virtual verification

The Art-Net crate includes a loopback UDP receiver test that sends a real encoded ArtDmx packet through the adapter and parses it again, including source-interface selection, port-address and slot data. The standalone `lighthouse-virtual-dmx-node` can inspect continuous output without physical fixtures.
