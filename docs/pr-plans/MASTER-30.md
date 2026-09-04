# MASTER-30 — Semantic ApplicationGraph Contract

## Goal

Implement the canonical versioned ApplicationGraph semantic owner without becoming a workflow engine, scheduler, runtime graph, Studio flow duplicate or Canvas projection format.

## Base

- authoritative `main`: `62e0fe0a3101001ea4a69cb2732311094e5ebf2e`
- previous phase: MASTER-29 merged via PR #189
- branch: `master/30-application-graph`
- frozen executable head: `f9c70fe20e2764de2e701b8c44e9cd1114d20eb9`

## Reverse-engineered ownership

Nearest existing graph/flow-like owners are intentionally different:

- `planner/composition-planner` derives ephemeral execution/composition directives from an ExperiencePlan; it is not published Application semantics.
- `studio-flow` validates routes/events inside one `StudioExperienceDocument`; it does not own cross-Experience/Capability/Context/Action relationships.
- `runtime-core` owns execution state/revision/lifecycle; ApplicationGraph cannot become runtime state.
- Canvas is a future authoring projection and cannot make x/y/zoom/selection canonical Application semantics.
- Action Boundary owns effect/idempotency/execution authority; ApplicationGraph only names exact Action relationships.

`application-graph` OWNS immutable graph identity/release metadata, stable local semantic node/edge IDs, exact Experience/Capability/Context/Action targets, a closed compatibility-checked relation vocabulary, and deterministic serialization.

It DOES NOT OWN workflow start/end nodes, branch conditions, scheduler/retry/timeout/backoff/concurrency/executor behavior, runtime state, Studio view/event routing, provider bindings, Action execution/effect/idempotency authority, Canvas projection state, or governance/policy contents.

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

Edges describe relationships only. They do not mean "execute next". Cycles are legal; ApplicationGraph is not a DAG executor.

## Application Package compatibility

MASTER-27 intentionally kept `application-package.flows[]` as exact opaque refs until MASTER-30. Those refs may target exact `ViraApplicationGraph` releases. The v1 field name remains unchanged for backward compatibility and must not be interpreted as workflow-engine authority.

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

- Q0 PASS — exact base `62e0fe0...`.
- Q1 PASS — reverse engineered semantic freeze, MASTER-27 deferred `flows[]`, planner, studio-flow, runtime and Action authority.
- Q2 PASS — ownership/relation matrix frozen.
- Q3 PASS — graph types/parser/serializer + boundary edge implemented.
- Q4 PASS — focused exact-ref/bounds/duplicate/missing-node/relation/workflow-smuggling/cycle/security coverage implemented.
- Q5 PASS — fail-closed security review.
- Q6 PASS — architecture review proves graph does not absorb planner/runtime/Studio flow/Canvas/Action authorities.
- Q7 PASS — operator-reported local `pnpm check:boundaries`, `pnpm typecheck`, and focused `application-graph.test.ts` on exact frozen executable head `f9c70fe20e2764de2e701b8c44e9cd1114d20eb9`.
- Q8 READY — compare frozen executable head to exact PR closure head; only docs/evidence may differ.
- Q9 BLOCKED until final Q8 proves executable-clean closure; then squash merge and start MASTER-31 from new `main`.

Hosted zero-step Actions failures are infrastructure non-signal and are not counted as code verification.
