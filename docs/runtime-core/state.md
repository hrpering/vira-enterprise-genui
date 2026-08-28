# Runtime state

RuntimeState is the immutable source-of-truth container owned by runtime-core.

## v1 foundation shape

```ts
interface RuntimeState {
  experienceId: string;
  revision: number;
  plan: ExperiencePlan;
}
```

`revision` starts at `0`. Later reducer/patch work may create new states with incremented revisions; PR-010 does not implement transitions yet.

## Single task-state ownership

ExperiencePlan already contains canonical resolved task state at `plan.state`. RuntimeState therefore does **not** introduce a second `taskState` copy. Any later update must create a new plan/state rather than allowing two task-state representations to drift.

## Immutability

`createRuntimeState` validates and normalizes the incoming plan through `parseExperiencePlan`, then recursively freezes the cloned plan and the RuntimeState container. Caller-owned input objects are never retained.

## Deferred fields

Lifecycle, permissions, runtime errors, and action processing have dedicated owning PRs. They are intentionally absent here rather than represented as placeholders or generic bags.

## Boundary

Runtime state has no DOM nodes, framework objects, network clients, callbacks, customer-specific data adapters, or hidden global storage. It is deterministic serializable data.
