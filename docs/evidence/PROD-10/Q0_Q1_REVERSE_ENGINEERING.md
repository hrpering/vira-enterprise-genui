# PROD-10 Q0/Q1 — Baseline and Ownership Reverse Engineering

## Exact stacked baseline

- Parent phase: PROD-09
- Parent SHA: `c880007c1c7939fbe9408c3c664e86b3d019d530`
- PROD-09 PR #227: technically ready, draft, not merge-authorized
- PROD-10 branch: `prod/10-exact-action-supply-transaction-plan`

## Existing owner findings

### Action identity

`application-package` V2 already owns exact Action references through `actions: ViraApplicationExactReference[]`. PROD-10 must consume this grammar rather than create `ActionId`, `ActionVersion`, floating aliases or `latest` behavior.

### Protected Action boundary

`action-boundary` currently owns process-level Action intent permission/confirmation/execution semantics and a versionless runtime catalog keyed by `actionType`. Its existing `execute()` path mutates local reservation/consumption state. PROD-10 Stage A therefore cannot be implemented by calling `execute()` during planning. A new pure preflight seam is required that performs validation/policy checks without reservation, confirmation consumption or effect execution.

### Provider connection and deployment

`provider-connection` already binds operation targets to exact ActionRefs and owns providerId, connectorId, enterprise scope, SecretRef, granted scopes and lifecycle.

`deployment-plane` / `application-resolution` already own provider identity, adapter ref, SecretRef, trust evidence and exact deployment/resolution digests.

`action-supply` must resolve/project these owners, not duplicate their lifecycle or credential semantics.

### Identity and delegation

`enterprise-context` owns `ViraEnterprisePrincipal`, membership revision and bounded delegation chains. TransactionPlan must pin resolved identity/delegation evidence; it does not create a new identity model.

### WorkContext

`work-context` owns context identity and content. TransactionPlan pins context identity/revision/evidence references only; it is not an artifact or context byte store.

### Commercial

Application V2 already carries exact entitlement/metering/pricing/settlement refs. Commercial packages remain canonical owners. TransactionPlan binds a deterministic preflight snapshot and cannot mutate commercial truth.

### Canonicalization and digest

`application-resolution` establishes the repository pattern: explicit deterministic serialization plus an injected digest provider. `action-transaction` should follow that pattern and remain runtime/platform neutral; no direct Node `crypto` dependency belongs in the semantic package.

## Gap list

1. No `action-supply` package exists.
2. No `action-transaction` package exists.
3. No immutable TransactionPlan parser/canonical serializer/digest contract exists.
4. No bounded acyclic operation graph validator exists for protected Action planning.
5. No explicit provider Action behavior contract exists for idempotency/retrySafety/verification/freshness.
6. No pure Stage A Action Boundary preflight seam exists; current execution path reserves/consumes process-local state.
7. Root scripts do not yet expose `verify:action-supply`, `verify:transaction-plan` or `verify:action-preflight`.

## Security invariants

- exact refs only; no floating/latest fallback;
- provider discovery/binding never grants execution authority;
- SecretRef metadata only, never secret bytes;
- plan policy/commercial/delegation meaning cannot change after freeze without changing plan digest/revision;
- operation graph is bounded and acyclic;
- duplicate operation IDs and dangling dependencies fail closed;
- plan digest excludes mutable attempts, receipts and verification results;
- Stage A preflight cannot consume reservation/idempotency/execution authority;
- protected Action retry strategy cannot be inferred by generic flow code.

## Q1 conclusion

Two new thin semantic owners are justified by the production roadmap: `action-supply` and `action-transaction`. All other required PROD-10 information must be imported or pinned from existing canonical owners.
