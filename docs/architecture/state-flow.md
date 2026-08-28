# State flow

`runtime-core` is the source of truth for experience runtime state.

```text
initial state
    |
    v
 validated action/event
    |
    v
 permission/lifecycle checks
    |
    v
 validated patch
    |
    v
 next immutable state
    |
    v
 targeted render update
```

## Invariants

- State transitions are deterministic.
- Patches are validated before application.
- Components do not own competing global experience state.
- Framework wrappers do not duplicate runtime state machines.
- Illegal lifecycle transitions fail with typed errors rather than silent fallback.
