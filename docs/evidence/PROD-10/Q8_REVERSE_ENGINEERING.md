# PROD-10 — Q8 Independent Reverse Engineering

## Scope

Independent adversarial review of the PROD-10 exact Action supply, immutable TransactionPlan and Action Boundary Stage A seams, stacked on PROD-09 technical closure.

## Finding 1 — provider trust was not initially authoritative at Action supply

Initial `action-supply` resolution required an active provider connection and a deployment binding with `trustStatus=trusted`, but it did not consume the canonical PROD-09 `provider-trust` evaluator. A stale, revoked, unhealthy or expired trust evidence state could therefore be omitted from Action-supply planning.

### Fix

`action-supply` now:

- accepts exact provider trust evidence;
- delegates validity to `evaluateViraProviderTrust()` rather than duplicating trust semantics;
- requires exact connection/provider/scope/credential parity through the canonical trust owner;
- fails closed on unhealthy, expired, revoked and future-invalid evidence;
- requires the Application environment binding's `trustEvidenceRef` to equal the exact evidence accepted by the trust evaluator;
- carries `trustValidUntilEpochMs` into the resolved ActionSupply;
- canonicalizes untrusted resolution input before using provider-connection or environment-binding snapshots.

Executable negatives cover unhealthy, expired, revoked, provider-mismatched, credential-mismatched and deployment-evidence-mismatched cases.

## Finding 2 — a shape-valid TransactionPlan could initially bypass supply/preflight evidence

The first `freezeViraTransactionPlan()` implementation validated shape, exact refs, graph bounds and digest semantics, but a caller could construct a shape-valid plan without proving that each operation had crossed exact ActionSupply resolution and Action Boundary Stage A preflight. A later approval/grant layer must never be able to treat such a plan as authoritative.

### Fix

Plan freeze now requires exactly one evidence record per operation:

- canonical resolved `ViraResolvedActionSupply`;
- canonical `ViraActionBoundaryPreflightSuccess`.

Before digest creation the transaction owner verifies:

- exact ActionRef and ActionBindingRef parity;
- enterprise scope and SecretRef parity;
- providerId, providerIdentityRef, connectionId, connectorId, provider operation, adapter and runner parity;
- provider behavior strategy parity;
- exact trust evidence identity and validity window parity;
- plan expiry does not outlive the provider trust window;
- Stage A action type, idempotency key, state revision and canonical action payload match the operation being frozen;
- `confirm` challenge binds the exact preflight ActionIntent;
- `allow` preflight cannot carry a challenge.

Provider, connector, provider-operation and trust identity are now part of immutable operation meaning and therefore part of `planDigest`.

Executable bypass negatives cover missing evidence, supply substitution, preflight substitution and insufficient trust validity.

## Stage A review

`action-boundary.preflight()` is intentionally read-only:

- it shares intent/catalog/policy evaluation with the canonical execution path;
- it observes revision without committing revision-provider state;
- it never reserves action IDs, idempotency keys or effect revisions;
- it returns `allow | confirm` meaning plus exact challenge state;
- the existing `execute()` path retains confirmation → revision → reservation → executor ordering.

Focused tests prove repeated preflight does not consume execution authority and that execution after preflight still performs the canonical reservation.

## Immutable-plan review

TransactionPlan canonicalization sorts object keys deterministically and uses an injected digest provider. Mutable TransactionRecord state is outside the plan digest. The frozen plan is deep-frozen, including policy obligations, commercial preflight data and operation intent. A policy/commercial transformation after freeze cannot mutate the accepted plan; any new meaning requires a new plan and digest/revision.

## Explicit non-goals preserved

PROD-10 does not add human approval evidence, Approval Inbox, KMS grants, durable Action execution, provider effects, postcondition reread, durable Action Ledger or commercial settlement mutation. Those remain PROD-11+ owners.

## Closure criterion

Q8 is considered source-complete only when the exact final candidate also passes the repository PROD-10 focused gates, package boundaries, lint/typecheck/build, root verification and native CI jobs. The PR remains draft and not merge-authorized until that exact-head evidence exists.
