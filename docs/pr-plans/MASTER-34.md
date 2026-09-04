# MASTER-34 — Canvas Simulation + Replay

## Goal

Add a deterministic, framework-free Canvas dry-run trace + replay contract for explicit ApplicationGraph scenarios without acquiring runtime, policy, provider or protected-effect authority.

## Base

- authoritative `main`: `8d9c28d5ac70b20ea88556305977aafd9dc8f3f6`
- previous phase: MASTER-33 merged via PR #193
- branch: `master/34-canvas-simulation-replay`
- frozen executable head: `9a8591c741f59205caf371d9e34eafb8a6086861`

## Ownership

Existing owners remain authoritative:

- `application-canvas` owns canonical Canvas draft/semantics/projection.
- `application-graph` owns semantic nodes/edges.
- `runtime-core` owns actual runtime lifecycle/state/actions/patches.
- `policy-simulation` owns policy evaluator simulation.
- `action-boundary` and `action-ledger` own protected effects and real receipts.
- `work-context` owns bounded context/evidence/result/decision/receipt items.

MASTER-34 introduces `application-canvas-simulation` because deterministic authoring-time path traces/replay are distinct from runtime execution and policy simulation.

It owns only bounded scenario/path validation, exact graph continuity checks, immutable dry-run semantic frames, exact canonical semantic snapshot evidence, trace validation, deterministic replay and fail-closed semantic drift detection.

It does not own Capability provider invocation, Action execution, policy/governance evaluation, runtime state/lifecycle, WorkContext mutation, Action receipts/ledger truth, scheduler/condition/retry/workflow semantics, publication/deployment or automatic graph traversal.

## Scenario contract

```text
{
  id,
  graphRef: { id, version },
  startNodeId,
  edgeIds[]
}
```

The caller chooses the exact path. The simulator never invents routing conditions or schedules nodes.

## Trace contract

```text
{
  version,
  mode: "dry-run",
  scenarioId,
  sourceDraftId,
  applicationRef,
  graphRef,
  semanticsSnapshot,
  frames[]
}
```

A frame records only node identity/kind and the incoming semantic edge. Reaching Capability or Action nodes is a dry-run semantic observation, never provider invocation or protected effect execution.

The trace is not an authenticated audit record, Action receipt, policy/governance decision or runtime record. `sourceDraftId` is informational provenance; replay authority comes from canonical semantic snapshot + path revalidation.

## Replay contract

Replay reparses outer input, Canvas draft and trace through exact fail-closed data boundaries, compares canonical semantic serialization, re-walks the recorded path and verifies every frame.

- projection-only changes: allowed
- `editorRevision` changes with identical semantics: allowed
- Application/Graph semantic drift: fail closed
- trace mode other than `dry-run`: fail closed
- tampered/internally inconsistent trace: fail closed
- unsafe accessor/custom-prototype outer input: fail closed

## Review outcome

Q5 found two pre-freeze hardening gaps and closed both:

1. outer simulation/replay inputs are parsed through the shared safe JSON boundary with exact root shapes;
2. trace/replay artifacts require explicit `mode: "dry-run"`, preventing the artifact shape from presenting itself as executed/runtime evidence.

Q6 confirms the package dependency surface is only `application-canvas` + `protocol`. There is no import path to runtime-core, policy/governance, WorkContext, Action Boundary/Ledger or publication/deployment owners.

The first local Q7 attempt exposed only a test expectation mismatch: root safe-data parsing correctly classified a nested unsafe accessor as `INVALID_INPUT`. The test was aligned with this behavior; production code did not change. The corrected frozen head was then operator-reported fully green.

## Q0–Q9

- Q0 PASS — exact base `8d9c28d5ac70b20ea88556305977aafd9dc8f3f6`.
- Q1 PASS — targeted reverse engineering.
- Q2 PASS — simulation/replay ownership frozen.
- Q3 PASS — package + simulator/replay implementation.
- Q4 PASS — focused path/cycle/action-dry-run/replay/drift/tamper/security coverage implemented.
- Q5 PASS — fail-closed/security review including root-input and dry-run evidence hardening.
- Q6 PASS — architecture/authority review.
- Q7 PASS — operator-reported exact corrected frozen-head local boundaries/typecheck/focused suite.
- Q8 PASS — final compare after frozen executable head is documentation/evidence-only.
- Q9 READY — squash merge PR #194, then start MASTER-35 from new authoritative `main`.
