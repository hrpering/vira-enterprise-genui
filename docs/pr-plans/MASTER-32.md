# MASTER-32 — Canvas Mutation Session

## Goal

Add a framework-free mutation/session API on top of the canonical Canvas draft so editor writes are atomic, stale-safe, revisioned and always revalidated through existing Application/Graph/Canvas owners.

## Base

- authoritative `main`: `12aede59f4d034883ff4a2fe5ff8b5fe0887544b`
- previous phase: MASTER-31 merged via PR #191
- branch: `master/32-canvas-mutation-session`
- frozen executable head: `9637cf2ed322eff937f87adbae4803e21801af1f`

## Ownership

MASTER-32 extends `application-canvas`; it does not introduce another package. The mutation session owns only in-memory canonical Canvas draft mutation, exact `expectedRevision` optimistic concurrency, atomic candidate revalidation/commit, exactly +1 `editorRevision` on success, safe revision exhaustion failure, and semantic/projection mutation entry points.

It does not own runtime state/revision, publication/deployment truth, governance/authorization, protected Action execution, provider credentials, undo/redo or CRDT history, React/UI/drag-drop, or a second Application/Graph/Canvas validator.

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

## Verification

Focused suite: `tests/contract/application-canvas-session.test.ts`.

The operator reported exact frozen-head Q7 PASS for:

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run tests/contract/application-canvas-session.test.ts
```

Final compare from frozen executable head to the final documentation closure contains documentation/evidence changes only. Hosted Actions remained zero-step infrastructure non-signal (`steps: null`).

## Gate status

- Q0 PASS — exact base.
- Q1 PASS — targeted reverse engineering.
- Q2 PASS — session/revision ownership frozen.
- Q3 PASS — mutation session implemented inside `application-canvas`.
- Q4 PASS — focused coverage.
- Q5 PASS — fail-closed/security review.
- Q6 PASS — architecture/authority review.
- Q7 PASS — operator-reported exact frozen-head local gate.
- Q8 PASS — final executable-clean actual-diff compare.
- Q9 READY — exact-head squash merge; then MASTER-33 starts from the new authoritative `main`.
