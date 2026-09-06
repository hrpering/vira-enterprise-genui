# PROD-10 — Exact Action Supply and Immutable TransactionPlan

**Status:** ACTIVE STACKED IMPLEMENTATION / NOT MERGE AUTHORIZED  
**Dependency head:** `c880007c1c7939fbe9408c3c664e86b3d019d530`  
**Dependencies represented:** PROD-03 + PROD-04 + PROD-05 + PROD-07 + PROD-09  
**Branch:** `prod/10-exact-action-supply-transaction-plan`

## Authority freeze

- `application-package` remains the owner of exact Action identity. PROD-10 does not create a second Action reference grammar.
- `provider-connection` remains the owner of provider connection identity, enterprise scope, operation bindings, connector identity, SecretRef metadata, scopes and lifecycle.
- `deployment-plane` / `application-resolution` remain the owners of authenticated deployment and exact immutable Application resolution.
- `enterprise-context` remains the owner of enterprise scope, principal, membership and delegation semantics.
- `work-context` remains the owner of WorkContext meaning. A TransactionPlan pins an exact context identity/revision; it does not become the context store.
- commercial packages remain the owners of entitlement, metering, pricing and settlement meaning. PROD-10 only binds a preflight snapshot to the immutable plan.
- `action-boundary` remains the protected Action policy/permission boundary. PROD-10 adds Stage A pure preflight semantics only; it may not reserve, consume, approve or execute an Action.
- New `action-supply` owns exact ActionRef-to-execution-binding resolution and provider-specific execution behavior metadata. It is discovery/binding, not execution authority.
- New `action-transaction` owns immutable `TransactionPlan`, mutable `TransactionRecord` identity/state contract, deterministic canonicalization and plan digest semantics.

## Required delivery

- `action-supply`: exact ActionRef → binding/provider/adapter/runner/SecretRef projection without duplicating provider connection truth.
- Provider-specific idempotency, retry-safety, verification and freshness strategies.
- Immutable bounded `TransactionPlan`; mutable `TransactionRecord` kept outside the plan digest.
- Bounded acyclic `operations[]` with dependencies, before-state evidence and expected postconditions.
- Exact binding to Application/deployment/resolution, actor/delegation, enterprise scope, WorkContext revision, policy/obligations and commercial preflight state.
- Action Boundary Stage A pure preflight that cannot reserve or consume execution authority.
- Deterministic canonicalization and `planDigest = SHA-256(canonical(TransactionPlan))` through an injected digest provider.

## Quality gates

- `verify:action-supply`
- `verify:transaction-plan`
- `verify:action-preflight`
- cycle and graph bounds
- floating/exact-reference rejection
- digest mutation detection
- policy-transform-after-freeze rejection
- protected Action bypass negatives

## Explicit non-goals

No human approval evidence, Approval Inbox, KMS grant, one-time execution grant, durable protected Action retry, provider effect execution, postcondition reread, Action Ledger expansion, pricing/rating mutation or settlement mutation is introduced by PROD-10. Those remain later roadmap owners.
