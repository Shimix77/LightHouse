# Fail-safe, checkpoints and crash recovery

## Independent output

- The WebView, desktop Rust backend, show runtime and DMX output loop do not share a UI thread.
- The DMX loop repeats the latest immutable frame set at the project refresh rate (30–44 Hz) using non-blocking output adapters.
- A frozen WebView cannot hold the DMX socket or stop the output loop. `WouldBlock` drops one packet instead of blocking the next tick.
- Operator Blackout and the disconnect watchdog are atomic safety overrides applied after logical parameter resolution. Neither writes raw DMX values into project state.

## Configurable UI disconnect policy

- Default: **Keep sending last look** indefinitely.
- Optional: **Blackout after timeout**, configurable from 1 to 300 seconds per project.
- The headless sidecar observes authenticated client activity. When the configured timeout expires, it applies a transient watchdog blackout directly to the output safety lane.
- The watchdog does not mutate scene, programmer, Grand Master or the operator Blackout flag. Authenticated UI activity releases only the watchdog override, so the prior logical show state resumes.
- A watchdog trip is carried in engine telemetry and shown as an explicit fail-safe warning after communication returns.

## Recovery journal

- Every accepted runtime command is appended to a bounded asynchronous JSON Lines journal and flushed with `sync_data` outside the show and output threads.
- On an unexpected sidecar restart, complete journal entries are replayed in strict sequence before the first resolved DMX frame is published. A truncated final line is ignored; corruption or out-of-order entries fail closed.
- Every successful structural project save is an atomic checkpoint and truncates the older runtime journal before a required engine restart.
- A clean sidecar shutdown drains the journal worker and truncates the journal. A desktop backend drop requests that clean shutdown.
- If the desktop/WebView process crashes, the sidecar remains independent and continues output. A later desktop instance reconnects using the private authenticated session record; if the sidecar also failed, it restarts and replays the journal.

## Restart continuity

- Project switching and intentional engine restarts start and validate the replacement sidecar before stopping the previous one. This avoids an output gap if the new configuration cannot start.
- There can be a very short overlap while the old sidecar acknowledges shutdown. Art-Net receivers therefore still see a continuous stream, with the new engine taking ownership immediately.
