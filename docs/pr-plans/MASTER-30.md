# MASTER-30 — Semantic ApplicationGraph Contract

## Goal

Implement the canonical versioned ApplicationGraph semantic owner without becoming a workflow engine, scheduler, runtime graph, Studio flow duplicate or Canvas projection format.

## Base

- authoritative `main`: `62e0fe0a3101001ea4a69cb2732311094e5ebf2e`
- previous phase: MASTER-29 merged via PR #189
- branch: `master/30-application-graph`

## Reverse-engineered ownership

Nearest existing graph/flow-like owners are intentionally different:

- `planner/composition-planner` derives ephemeral execution/composition directives from an ExperiencePlan; it is not published Application semantics.
- `studio-flow` validates routes/events inside one `StudioExperienceDocument`; it does not own cross-Experience/Capability/Context/Action relationships.
- `runtime-core` owns execution state/revision/lifecycle; ApplicationGraph cannot become runtime state.
- Canvas is a future authoring projection and cannot make x/y/zoom/selection canonical Application semantics.
- Action Boundary owns effect/idempotency/execution authority; ApplicationGraph only names exact Action relationships.

`application-graph` OWNS:

- immutable graph identity/release metadata;
- stable local semantic node IDs;
- exact Experience/Capability/Context/Action node targets;
- stable local semantic edge IDs;
- a closed compatibility-checked relation vocabulary;
- deterministic serialization.

It DOES NOT OWN:

- workflow start/end nodes, branch conditions or scheduler semantics;
- retry/timeout/backoff/concurrency/executor behavior;
- runtime state or revisions;
- Studio view/event routing;
- provider bindings/endpoints/credentials;
- Action effect/idempotency/authorization/execution;
- Canvas coordinates, zoom, selection or editor history;
- governance/policy contents.

## Node families

```text
experience  → exact Experience Pack id/version/entrypoint reference
capability  → exact CapabilityDefinition reference
context     → exact WorkContextDefinition reference
action      → exact semantic actionType
```

## Edge vocabulary

```text
experience-uses-capability  experience → capability
experience-offers-action    experience → action
context-input               context → experience|capability|action
context-output              experience|capability|action → context
semantic-transition         experience → experience
```

Edges describe relationships only. They do not mean "execute next". Cycles are therefore legal; ApplicationGraph is not a DAG executor.

## Application Package compatibility

MASTER-27 intentionally kept `application-package.flows[]` as exact opaque refs until MASTER-30. MASTER-30 defines the canonical payload those exact refs may target: `ViraApplicationGraph` releases. The v1 field name remains unchanged for backward compatibility; it must not be interpreted as permission to introduce workflow-engine semantics.

## Security / invariants

- graph release version is exact semver;
- publisher namespace parity is enforced;
- Capability/Context refs reject floating aliases/ranges;
- Experience refs bind exact Pack id + release semver + entrypoint;
- local node/edge IDs are canonical semantic segments;
- node and edge collections are bounded;
- duplicate node IDs, edge IDs and semantic relation tuples fail closed;
- every edge endpoint must exist;
- edge kind/node-kind compatibility is checked;
- self edges are rejected as semantically redundant;
- workflow/runtime/provider/Canvas/execution fields fail exact-shape validation;
- Action targets cannot carry effect/idempotency/execute fields;
- safe shared JSON boundary rejects accessors/custom prototypes/cycles/non-JSON input;
- parsed graph is detached/deeply frozen;
- package dependency edge is only `application-graph → protocol`.

## Q0–Q9

- Q0: exact base `62e0fe0...`.
- Q1: reverse engineer Application semantic freeze, MASTER-27 deferred `flows[]`, planner, studio-flow, runtime and Action authority.
- Q2: freeze ownership/relation matrix above.
- Q3: implement graph types/parser/serializer + boundary edge.
- Q4: focused exact-ref/bounds/duplicate/missing-node/relation/workflow-smuggling/cycle/security tests.
- Q5: fail-closed security review.
- Q6: architecture review proving graph does not absorb planner/runtime/Studio flow/Canvas/Action authorities.
- Q7: local `pnpm check:boundaries && pnpm typecheck && pnpm vitest run tests/contract/application-graph.test.ts`.
- Q8: independently reverse engineer actual PR diff.
- Q9: squash merge only after exact-head Q7 and final executable-clean compare; then start MASTER-31 from new `main`.
