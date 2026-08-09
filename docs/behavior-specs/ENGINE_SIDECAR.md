# Engine sidecar and IPC baseline

**IPC contract:** 1

## Process ownership

- The sidecar process owns Show Core, the 44 Hz frame scheduler, Parameter Resolver, recovery journal and DMX output.
- Desktop windows are clients. Closing, freezing or reconnecting a client does not stop the engine process or its output loop.
- The Art-Net adapter is configured from project output routes and remains outside core show logic.

## Local transport

- The sidecar listens only on a configured loopback TCP address.
- The process prints one machine-readable startup line containing the bound address, contract version and project ID.
- Every connection must begin with a versioned `Hello` and the one-time token supplied when the sidecar was launched.
- The same protocol works on macOS and Windows; the future platform port does not need a second command contract.
- Messages are length-prefixed JSON with a 16 MiB hard safety limit.

## Client lifecycle

- More than one authenticated client can connect, enabling the future second-monitor Live window.
- A reconnect requests the latest full Show snapshot and then continues with normal commands/events.
- Ping/Pong is available for UI heartbeat without entering the domain event stream.
- A real process integration test disconnects all UI clients and verifies that output frame count continues increasing before reconnect.

## Scheduling and backpressure

- Safety commands use a dedicated bounded queue and are drained before normal commands.
- Normal commands use a separate bounded queue and a per-tick processing budget.
- A full queue rejects the producer rather than building an unbounded backlog.
- The output loop is a separate thread and continues repeating the last complete frame even if command processing stalls.
- Recovery journal writes run on a dedicated persistence worker; the frame scheduler never performs disk I/O.
- Coalesced snapshots expose output errors, missed deadlines and dropped command/journal counters.
