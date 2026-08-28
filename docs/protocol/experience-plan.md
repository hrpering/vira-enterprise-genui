# ExperiencePlan Protocol v1

ExperiencePlan is the canonical semantic output of planning. It records what task is being pursued, the planner's resolved task state, and which semantic capabilities are required now, optionally available now, or expected later.

It is **not** a UI tree, component schema, action executor, or layout description.

## Contract

```ts
interface ExperiencePlan {
  version: "1";
  id: string;
  intent: Intent;
  state: JsonObject;
  capabilities: {
    required: Capability[];
    available: Capability[];
    future: Capability[];
  };
}
```

## Capability buckets

- `required`: capabilities the current task needs to progress.
- `available`: optional capabilities that may be offered now.
- `future`: capabilities anticipated by the plan but not active yet.

A capability ID may appear in only one bucket. This keeps planner output unambiguous; permission and execution authorization are separate runtime concerns.

## Rules

- `id` is an opaque local plan identifier, limited to safe identifier characters and 128 characters.
- `intent` is validated by Intent Protocol v1.
- `state` contains normalized resolved task state only. Raw SDK responses and raw tool payloads belong behind DomainData/adapters, not here.
- Capability entries are validated by Capability Protocol v1 and cloned during normalization.
- Missing capability buckets normalize to empty arrays.
- v1 deliberately has no `regions`, `layout`, `actions`, `bindings`, `policies`, component names, props, or styling fields. Those concepts are introduced only by the packages/contracts that own them.

## Boundary

Planner implementations may use rules, recipes, or models to create a plan, but the plan itself is deterministic data. Composer and runtime packages consume this contract without needing to know how it was produced.
