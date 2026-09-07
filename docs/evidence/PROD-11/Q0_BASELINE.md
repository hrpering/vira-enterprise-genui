# PROD-11 Q0 — Baseline

- Exact dependency head: `2a3dcd98079e8f9e077d4df7253fed74a5b877d4`.
- Dependency owner: PROD-10 exact Action Supply + immutable TransactionPlan.
- Dependency exact-head CI: #1967 GREEN (`verify`, iOS native and Android native all passed).
- PROD-10 PR #228 remains DRAFT / NOT MERGE AUTHORIZED; PROD-11 is stacked directly on the exact closed candidate.
- Existing `action-transaction` owns the immutable `TransactionPlan`, `planDigest`, `planRevision` and mutable `TransactionRecord` shell.
- Existing Action Boundary Stage A preflight is read-only and produces no execution authority.
- Existing enterprise context distinguishes `user`, `agent` and `service` principals and owns canonical enterprise scope parsing.
- Existing signed-webhook integration demonstrates transient key resolution, exact snapshotting and key-material zeroization, but it is inbound HMAC verification and is not an execution-grant authority.
- Existing trigger inbox demonstrates scoped replay identity, conflict rejection and revision-safe durable mutation, but its trigger delivery records are not reusable as Action execution grants.

## Q0 invariant

PROD-11 may project a human-readable review from a frozen TransactionPlan, persist human ApprovalEvidence bound to the exact `transactionId + planDigest + planRevision`, and issue one-time operation-scoped signed execution grants. It must not mutate or reinterpret the frozen plan, grant authority from UI state, allow an agent/service principal to self-approve, or begin durable Action execution/attempt ownership reserved for PROD-12.
