# MASTER-35 Reverse-Engineering Report

## Base

Authoritative `main`: `f17ae3cc920e672fcab1f97028dddcbe08040016`

## Sources inspected

- `packages/application-canvas/src/session.ts`
- `packages/application-canvas/src/types.ts`
- `packages/application-canvas-ai/src/types.ts`
- `PACKAGE_OWNERSHIP.md`
- package-boundary graph
- repository searches for existing collaboration/presence ownership

## Findings

1. `application-canvas` already owns optimistic `editorRevision`, atomic canonical revalidation and semantic replacement. Collaboration must delegate final apply to that owner.
2. Canvas AI proposals already carry a base editor revision but deliberately cannot apply themselves. MASTER-35 must stay provider/AI neutral so human and AI-originated semantic candidates can pass through the same authoring review concept without making AI an authority.
3. No existing collaboration/presence owner exists. Introducing participant/presence/proposal/review authoring state is therefore a real ownership gap.
4. CRDT transport, WebSocket presence delivery, server persistence and distributed locking are infrastructure concerns, not the canonical contract for this phase.
5. Semantic review is an editor mutation gate only. It must not become enterprise governance, authorization, publication approval or Action execution permission.
6. Presence is ephemeral actor state and must never increment Canvas `editorRevision` or become Application semantics.
7. Concurrent semantic proposals may share a base revision. Once one proposal is applied through the canonical mutation session, competing proposals naturally become stale.
8. Semantic changes can invalidate current projection. Such proposals may be reviewed, but apply must fail closed until projection is reconciled rather than silently dropping/rebuilding editor state.

## Frozen implementation direction

Create `@vira-enterprise-genui/application-canvas-collaboration` depending only on `application-canvas` and `protocol`.

It owns:

- bounded registered participants;
- monotonic per-actor ephemeral presence;
- concurrent semantic proposal envelopes bound to exact base `editorRevision`;
- immutable peer reviews;
- session-configured distinct approval threshold;
- self-review and duplicate-review rejection;
- rejection blocking;
- stale proposal detection;
- projection compatibility signaling;
- final approved apply delegation to the existing Canvas mutation session.

It does not own transport/CRDT, runtime, governance, authorization, publication/deployment or protected execution.
