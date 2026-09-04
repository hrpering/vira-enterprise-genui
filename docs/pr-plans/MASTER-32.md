# MASTER-32 — Canvas Mutation Session

## Goal

Add a framework-free mutation/session API on top of the canonical Canvas draft so editor writes are atomic, stale-safe, revisioned and always revalidated through existing Application/Graph/Canvas owners.

## Base

- authoritative `main`: `12aede59f4d034883ff4a2fe5ff8b5fe0887544b`
- previous phase: MASTER-31 merged via PR #191
- branch: `master/32-canvas-mutation-session`

## Reverse-engineered ownership

Existing owners remain authoritative:

- `application-package` validates canonical Application semantics.
- `application-graph` validates canonical semantic graph releases.
- `application-canvas` validates the aggregate Canvas draft and non-semantic projection.
- `studio-workbench` demonstrates the correct authoring pattern: mutate a candidate, run canonical validators, then commit only validated state.
- runtime/publication/deployment/governance/Action owners remain outside Canvas session authority.

MASTER-32 extends `application-canvas`; it does not introduce another package.

The mutation session OWNS only:

- in-memory current canonical Canvas draft;
- exact `expectedRevision` optimistic concurrency guard;
- atomic candidate revalidation and commit;
- exactly +1 `editorRevision` on successful writes;
- bounded/fail-closed revision exhaustion behavior;
- ergonomic semantic/projection mutation entry points.

It DOES NOT OWN:

- runtime state or runtime revision;
- publication/deployment truth;
- governance/authorization verdicts;
- protected Action execution;
- provider credentials/bindings;
- undo/redo history or collaborative CRDT semantics;
- React/UI/drag/drop components;
- a second Application/Graph/Canvas validator.

## Public mutation surface

```text
currentDraft()
replaceSemantics(expectedRevision, semantics)
setActiveGraph(expectedRevision, graphRef|null)
upsertGraphView(expectedRevision, graphView)
removeGraphView(expectedRevision, graphRef)
setNodeLayout(expectedRevision, graphRef, nodeId, x, y)
setViewport(expectedRevision, graphRef, x, y, zoom)
setSelection(expectedRevision, graphRef, nodeIds, edgeIds)
```

## Invariants

- Every write requires exact `expectedRevision`.
- Stale writes fail before candidate construction and leave current state unchanged.
- Successful writes increment `editorRevision` by exactly one.
- Failed canonical validation leaves current state and revision unchanged.
- Every candidate is reparsed by `parseViraCanvasDraft()` before commit.
- Semantic replacement therefore delegates again to canonical ApplicationPackage and ApplicationGraph parsers.
- Projection-only edits cannot gain runtime/publication/execution authority.
- `Number.MAX_SAFE_INTEGER` revision fails closed instead of wrapping or losing precision.
- Mutation inputs pass through the shared safe JSON boundary.
- Session object and committed drafts remain frozen canonical values.

## Focused verification

`tests/contract/application-canvas-session.test.ts` covers:

- canonical session creation/freeze;
- successful semantic replacement;
- projection-only semantic stability;
- exact +1 revision increments;
- stale replay rejection;
- atomic failure behavior;
- canonical semantic rejection;
- orphaned projection rejection;
- graph/view/node/selection targeting;
- unsafe accessor mutation input;
- revision exhaustion;
- absence of publish/runtime/deployment/Action execution methods.

## Q0–Q9

- Q0: exact base `12aede59...`.
- Q1: reverse engineer Canvas Foundation + Studio Workbench mutation/commit pattern.
- Q2: freeze session/revision ownership above.
- Q3: implement mutation session inside `application-canvas`.
- Q4: focused stale/atomic/revalidation/security/revision tests.
- Q5: fail-closed security review.
- Q6: architecture review proving session does not absorb runtime/publication/execution authority.
- Q7: local `pnpm check:boundaries && pnpm typecheck && pnpm vitest run tests/contract/application-canvas-session.test.ts`.
- Q8: independent actual PR diff review.
- Q9: squash merge only after exact-head Q7 and final executable-clean compare; then start MASTER-33 from new `main`.
