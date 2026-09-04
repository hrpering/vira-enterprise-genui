# MASTER-34 — Canvas Simulation + Replay

## Goal

Add a deterministic, framework-free Canvas dry-run trace + replay contract for explicit ApplicationGraph scenarios without acquiring runtime, policy, provider or protected-effect authority.

## Base

- authoritative `main`: `8d9c28d5ac70b20ea88556305977aafd9dc8f3f6`
- previous phase: MASTER-33 merged via PR #193
- branch: `master/34-canvas-simulation-replay`

## Ownership

Existing owners remain authoritative:

- `application-canvas` owns canonical Canvas draft/semantics/projection.
- `application-graph` owns semantic nodes/edges.
- `runtime-core` owns actual runtime lifecycle/state/actions/patches.
- `policy-simulation` owns policy evaluator simulation.
- `action-boundary` and `action-ledger` own protected effects and real receipts.
- `work-context` owns bounded context/evidence/result/decision/receipt items.

MASTER-34 introduces `application-canvas-simulation` because deterministic authoring-time path traces/replay are distinct from runtime execution and policy simulation.

It OWNS only:

- bounded scenario identity/path validation;
- exact graph/node/edge existence and path continuity checks;
- immutable dry-run semantic frames;
- exact canonical Canvas semantic snapshot evidence;
- trace validation;
- deterministic replay against unchanged semantics;
- fail-closed semantic drift detection.

It DOES NOT OWN:

- Capability provider invocation;
- Action execution;
- policy/governance evaluation;
- runtime state/lifecycle;
- WorkContext mutation;
- action receipts/ledger truth;
- scheduler/condition/retry/workflow semantics;
- publish/deploy authority;
- automatic graph traversal.

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
  scenarioId,
  sourceDraftId,
  applicationRef,
  graphRef,
  semanticsSnapshot,
  frames[]
}
```

A frame records only node identity/kind and the incoming semantic edge. Reaching an Action node is a dry-run semantic observation, never a protected effect execution.

## Replay contract

Replay reparses both Canvas draft and trace, compares exact canonical semantic serialization, re-walks the recorded path, and verifies every frame.

- projection-only changes: allowed
- `editorRevision` changes with identical semantics: allowed
- Application/Graph semantic drift: fail closed
- tampered/internally inconsistent trace: fail closed

## Q0–Q9

- Q0 PASS — exact base `8d9c28d5ac70b20ea88556305977aafd9dc8f3f6`.
- Q1 PASS — targeted reverse engineering.
- Q2 PASS — simulation/replay ownership frozen.
- Q3 PASS — package + simulator/replay implementation.
- Q4 PASS — focused path/cycle/action-dry-run/replay/drift/tamper coverage implemented.
- Q5 REQUIRED — final fail-closed/security review.
- Q6 REQUIRED — architecture/authority review.
- Q7 REQUIRED — local exact-head package-boundary/type/focused suite.
- Q8 REQUIRED — independent actual PR diff review.
- Q9 BLOCKED until Q7/Q8; then squash merge and start MASTER-35 from new authoritative `main`.
