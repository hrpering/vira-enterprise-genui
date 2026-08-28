# Runtime patch engine

The runtime patch engine turns a validated Patch Protocol document into a new immutable RuntimeState.

## Target boundary

Patch paths are resolved against the current **ExperiencePlan**, not RuntimeState itself:

```text
RuntimeState
├── experienceId   (not patch-addressable)
├── revision       (runtime-owned)
└── plan           ← patch document root
    ├── intent
    ├── state      /state/...
    └── capabilities
```

This prevents a patch from rewriting runtime identity or revision counters.

## Atomic flow

```text
current RuntimeState
  ↓ validate current plan/revision
Patch input
  ↓ parsePatch
private plan clone
  ↓ ordered operations
candidate plan
  ↓ parseExperiencePlan
valid? ─ no → return failure; current state untouched
  │ yes
  ↓ deep freeze
new RuntimeState (revision + 1)
```

An empty patch is a no-op and returns the original RuntimeState object without incrementing revision.

## Operation rules

- `set`: create/overwrite the final object property, or overwrite an existing array index.
- `replace`: target must already exist.
- `remove`: target must already exist; array removal uses index removal without leaving holes.
- `merge`: target must be an existing object; patch value is merged by own keys.
- `append`: target must be an existing array.
- Intermediate containers are never automatically created.
- Array indices are canonical non-negative decimal integers; `append` is the only way to grow an array.

## Security and ownership

Patch Protocol already rejects unsafe pointer segments and prototype-sensitive value keys. The engine additionally revalidates the complete resulting ExperiencePlan before publishing it.

PR-012 does **not** authorize a patch. Permission evaluation is a separate runtime concern and must occur before a reducer chooses to apply a patch. A syntactically valid patch is not automatically permitted.
