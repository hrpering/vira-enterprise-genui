# MASTER-32 — Canvas Mutation Session

## Goal

Add a framework-free mutation/session API on top of the canonical Canvas draft so editor writes are atomic, stale-safe, revisioned and always revalidated through existing Application/Graph/Canvas owners.

## Base

- authoritative `main`: `12aede59f4d034883ff4a2fe5ff8b5fe0887544b`
- previous phase: MASTER-31 merged via PR #191
- branch: `master/32-canvas-mutation-session`
- frozen executable head: `9637cf2ed322eff937f87adbae4803e21801af1f`

## Reverse-engineered ownership

Existing owners remain authoritative:

- `application-package` validates canonical Application semantics.
- `application-graph` validates canonical semantic graph releases.
- `application-canvas` validates the aggregate Canvas draft and non-semantic projection.
- `studio-workbench` demonstrates the correct authoring pattern: mutate a candidate, run canonical validators, and commit only validated state.
- runtime/publication/deployment/governance/Action owners remain outside Canvas session authority.

MASTER-32 extends `application-canvas`; it does not introduce another package.

The mutation session OWNS only in-memory canonical Canvas draft mutation, exact `expectedRevision` optimistic concurrency, atomic candidate revalidation/commit, exactly +1 `editorRevision` on success, safe revision exhaustion failure, and semantic/projection mutation entry points.

It DOES NOT OWN runtime state/revision, publication/deployment truth, governance/authorization, protected Action execution, provider credentials, undo/redo or CRDT history, React/UI/drag-drop, or a second Application/Graph/Canvas validator.

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
- Stale writes fail before commit and leave current state unchanged.
- Successful writes increment `editorRevision` by exactly one.
- Failed canonical validation leaves current state and revision unchanged.
- Every candidate is reparsed by `parseViraCanvasDraft()` before commit.
- Semantic replacement delegates again to canonical ApplicationPackage and ApplicationGraph parsers.
- Projection-only edits cannot gain runtime/publication/execution authority.
- `Number.MAX_SAFE_INTEGER` revision fails closed.
- Mutation inputs pass through the shared safe JSON boundary.
- Session object and committed drafts remain frozen canonical values.

## Focused verification

`tests/contract/application-canvas-session.test.ts` covers canonical session creation/freeze, successful semantic replacement, projection-only semantic stability, exact +1 revision increments, stale replay rejection, atomic failure behavior, canonical semantic rejection, orphaned projection rejection, graph/view/node/selection targeting, unsafe accessor input, revision exhaustion, and absence of publish/runtime/deployment/Action execution methods.

## Gate status

- Q0 PASS — exact base `12aede59...`.
- Q1 PASS — targeted reverse engineering complete.
- Q2 PASS — session/revision ownership frozen.
- Q3 PASS — mutation session implemented inside `application-canvas`.
- Q4 PASS — focused coverage implemented.
- Q5 PASS — fail-closed/security review.
- Q6 PASS — architecture/authority review.
- Q7 REQUIRED — local exact-head `pnpm check:boundaries && pnpm typecheck && pnpm vitest run tests/contract/application-canvas-session.test.ts`.
- Q8 PRE-Q7 PASS — actual diff is session/index + focused test + docs only; final post-Q7 executable-clean compare still required.
- Q9 BLOCKED until Q7/final Q8; then squash merge and start MASTER-33 from new `main`.

Hosted Actions on the frozen head again produced verify/iOS/Android jobs with `steps: null`; these are infrastructure non-signal.
