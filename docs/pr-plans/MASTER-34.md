# MASTER-34 — Canvas Simulation + Replay

## Goal

Add a deterministic, framework-free Canvas dry-run trace + replay contract for explicit ApplicationGraph scenarios without acquiring runtime, policy, provider or protected-effect authority.

## Base

- authoritative `main`: `8d9c28d5ac70b20ea88556305977aafd9dc8f3f6`
- previous phase: MASTER-33 merged via PR #193
- branch: `master/34-canvas-simulation-replay`
- frozen executable head: `9a8591c741f59205caf371d9e34eafb8a6086861`

## Ownership

`application-canvas-simulation` owns only deterministic authoring-time explicit-path validation, dry-run semantic traces, canonical semantic snapshot evidence and replay validation.

It does not own Capability invocation, Action execution, policy/governance evaluation, runtime state/lifecycle, WorkContext mutation, Action receipts/ledger truth, scheduler/condition/retry semantics, publication/deployment or automatic graph traversal.

## Contracts

Scenario: exact `graphRef + startNodeId + edgeIds[]`.

Trace/replay artifacts are explicitly `mode: "dry-run"` and are not audit signatures, Action receipts, policy decisions or runtime records.

Replay is anchored to canonical Canvas semantic serialization and path revalidation. Projection/editorRevision-only changes are allowed; semantic drift or tamper fails closed.

## Final gates

- Q0 PASS
- Q1 PASS
- Q2 PASS
- Q3 PASS
- Q4 PASS
- Q5 PASS
- Q6 PASS
- Q7 PASS — operator-reported exact corrected frozen-head boundaries/typecheck/focused suite.
- Q8 PASS — final compare after frozen executable head is documentation/evidence-only.
- Q9 READY — squash merge PR #194, then start MASTER-35 from new authoritative `main`.
