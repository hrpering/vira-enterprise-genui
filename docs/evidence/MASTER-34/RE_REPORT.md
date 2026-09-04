# MASTER-34 Reverse-Engineering Report

## Base

Authoritative `main`: `8d9c28d5ac70b20ea88556305977aafd9dc8f3f6`

## Sources inspected

- `packages/application-canvas/src/index.ts`
- `packages/application-canvas/src/validate.ts`
- `packages/application-graph/src/types.ts`
- `packages/policy-simulation/src/types.ts`
- `packages/policy-simulation/src/simulate.ts`
- `packages/runtime-core/src/*` ownership surface
- `packages/work-context/src/types.ts`
- `PACKAGE_OWNERSHIP.md`
- `tooling/package-boundaries.config.mjs`

## Findings

1. `policy-simulation` compares actual policy evaluators and owns policy-specific allow/deny/challenge/transform simulation. Canvas simulation must not duplicate or invoke that authority.
2. `runtime-core` owns real runtime lifecycle/state/actions/patches. A Canvas preview must not pretend an ApplicationGraph path is runtime execution.
3. `action-boundary` and `action-ledger` own protected effects and real receipts. Visiting an Action node during Canvas simulation may be recorded as a dry-run semantic frame only.
4. `work-context` owns bounded state/evidence/result/decision/receipt items. Canvas simulation trace is not WorkContext state and does not create capability results, policy decisions or receipts.
5. ApplicationGraph explicitly allows cycles and is not a workflow engine. Simulation must validate a caller-supplied explicit path rather than schedule or auto-traverse the graph.
6. Canvas projection and `editorRevision` are non-semantic editor metadata. Replay should survive projection-only changes while failing on actual Application/Graph semantic drift.
7. Existing `serializeViraCanvasSemantics()` provides a deterministic exact semantic snapshot suitable for portable replay comparison without adding a platform-specific hashing dependency.

## Frozen implementation direction

Create `@vira-enterprise-genui/application-canvas-simulation` with only `application-canvas` + `protocol` dependencies.

Simulation input:

```text
canonical Canvas draft
+
scenario {
  id,
  graphRef,
  startNodeId,
  edgeIds[]
}
```

Simulation validates the explicit edge path and emits a frozen trace containing exact Application/Graph references, canonical semantic snapshot and semantic frames.

Replay reparses the trace, compares its exact canonical semantic snapshot against the current Canvas semantics, and re-walks the recorded edge sequence. Projection-only/editor-revision changes do not invalidate replay; semantic drift fails closed.

No Capability/Action provider call, policy evaluation, WorkContext mutation, receipt creation, scheduler, condition evaluation, retry logic or runtime execution is introduced.
