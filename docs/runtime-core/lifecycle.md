# Runtime lifecycle

Runtime lifecycle models the semantic lifetime of an Experience runtime. It is not the browser DOM/component mount lifecycle.

A RuntimeState exists only after creation, so `idle` is intentionally not stored as a fake runtime state. `createRuntimeState` starts at `created`.

```text
created -> mounting -> active -> updating -> active
   |          |          |          |
   +----------+----------+----------+--> cancelled -> disposed
   +----------+----------+----------+--> failed    -> disposed
                         +-------------> completed -> disposed
```

Rules:

- `created` may mount, cancel, or fail.
- `mounting` may become active, cancel, or fail.
- `active` may update, complete, cancel, or fail.
- `updating` may return active, complete, cancel, or fail.
- `completed`, `cancelled`, and `failed` are terminal except for cleanup to `disposed`.
- `disposed` has no outbound transitions.
- A successful lifecycle transition returns a new frozen RuntimeState and increments revision once.
- Illegal/unknown transitions do not mutate or increment the current state.

This lifecycle does not imply DOM mounting, network connectivity, telemetry state, or business authorization. Browser lifecycle mapping belongs to runtime-web; permission checks belong to runtime-core permissions.
