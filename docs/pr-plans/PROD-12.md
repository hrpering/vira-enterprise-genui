# PROD-12 — Durable Execution, Fencing, Transactional Outbox and Private Runner

Status: ACTIVE / STACKED IMPLEMENTATION / NOT MERGE AUTHORIZED

Dependency: PROD-11 exact-head technical closure `9f4c3ba781f3462b8ef4b0ad881214f3e13b31d0` (CI #1996 GREEN).

## Goal

Turn the exact, human-approved PROD-11 transaction authority into restart-safe protected execution without allowing process restart, worker races, duplicate delivery, stale leases, replayed grants, or secret handling to produce the same protected effect twice.

## In scope

1. New thin `durable-execution` semantic owner for protected execution queue/state, lease fencing, operation attempts, durable effect/idempotency reservation, atomic grant-nonce consumption and transactional outbox contracts.
2. PostgreSQL implementation under the existing single migration authority in `integrations/postgres/migrations/`.
3. Tenant-scoped queue claim with `FOR UPDATE SKIP LOCKED`, monotonic lease epoch and revision CAS.
4. Atomic transaction that binds worker claim, exact transaction/plan/operation coordinates, execution-grant nonce consumption and effect/idempotency reservation before any private execution can begin.
5. New thin `private-runner` owner that receives an exact execution envelope, resolves scoped provider credential through an injected AWS Secrets Manager boundary, executes through a trusted adapter boundary and never persists or returns secret material.
6. Action Boundary Stage B consumption contract that requires exact frozen plan coordinates, exact operation, verified one-time execution grant and current fenced lease.
7. Transactional outbox events committed with durable state changes; UI/usage/notification consumers use stable event ids and idempotent acknowledgement semantics.
8. Durable states required by the production roadmap: `queued`, `executing`, `verifying`, `partial`, `mismatch`, `uncertain`, `recovery`, `manual`.
9. Worker integration in `apps/vira-worker` through the new durable execution owner; the deploy shell remains separate from semantic ownership.
10. Focused restart, fencing, outbox, runner and adversarial tests plus exact-head root/native CI evidence.

## Explicitly out of scope

- real GitHub/Google protected write activation (PROD-13)
- effect precondition re-read / TOCTOU verification (PROD-13)
- independent post-effect reread and verified/partial/mismatch truth semantics beyond durable state transport (PROD-13)
- durable Action Ledger/hash chain/KMS checkpoint expansion (PROD-13)
- billing/commercial usage derivation (PROD-14)
- UI productization beyond outbox-safe state/events (PROD-15)
- generic provider routing/network failover (PROD-19)

## Existing authority to preserve

- `action-transaction` owns frozen TransactionPlan meaning, ApprovalEvidence and signed one-time grant envelope.
- `action-boundary` owns protected effect boundary semantics; PROD-12 adds a Stage-B durable consumption path rather than weakening Stage-A preflight.
- `enterprise-context` owns tenant/environment scope.
- `provider-connection` / `action-supply` own connection and exact binding metadata; secret values remain outside these packages.
- `integrations/postgres` implements persistence ports and never becomes transaction semantic authority.
- AWS Secrets Manager `eu-central-1` is the frozen production secret provider; only the Private Runner may resolve provider credential material for execution.

## New owner plan

### `durable-execution`

Owns:
- canonical protected execution record/state machine,
- queue/claim/lease/fencing contracts,
- effect and idempotency reservation identity,
- durable execution-grant nonce consumption contract,
- transactional outbox event contract,
- worker-safe state transition invariants.

Does not own:
- TransactionPlan meaning,
- ApprovalEvidence/grant cryptography,
- provider secret bytes,
- provider postcondition truth,
- Action Ledger.

### `private-runner`

Owns:
- secret-isolated execution request/response boundary,
- scoped ephemeral credential resolution port,
- exact adapter invocation envelope,
- redaction/fail-closed rules around secret material.

Does not own:
- queue scheduling,
- durable claim authority,
- transaction state,
- approval/grant issuance,
- provider verification truth.

## Security invariants

- No protected execution starts without an exact PROD-11 grant that has passed signature/audience/expiry validation and whose nonce is atomically consumed once.
- Nonce consumption and effect/idempotency reservation are durable and tenant-scoped.
- A stale worker lease epoch cannot mutate execution state, emit outbox events, or invoke the Private Runner.
- Two workers cannot both own the same execution attempt.
- Queue claim and state mutation are revision-CAS protected.
- Crash before private effect permits safe recovery because no effect was invoked.
- Crash after effect dispatch is treated as uncertain unless exact provider idempotency makes retry demonstrably safe; PROD-12 never invents success.
- Effect reservation is never silently rolled back after uncertain dispatch.
- Outbox row and state mutation commit atomically; delivery may repeat, consumer effect may not.
- Secret values are resolved only inside the Private Runner call path, remain ephemeral, and never enter queue rows, TransactionRecord, outbox payloads, logs, receipts or errors.
- Cross-tenant worker claim, grant nonce reuse, stale lease, stale revision and wrong plan/operation coordinates fail closed.

## Required negative tests

- two workers racing the same queued execution
- stale lease epoch attempts transition/runner invocation
- CAS revision mismatch
- cross-tenant claim
- repeated execution-grant nonce
- repeated action idempotency/effect reservation
- crash before effect dispatch
- crash after effect dispatch
- duplicate outbox delivery
- stale/out-of-order outbox acknowledgement
- expired lease recovery
- runner request with wrong plan/operation/supply coordinates
- secret resolver returns malformed/overscoped credential
- secret material appears in runner result/error/loggable envelope
- runner/adapter throws after possible dispatch -> `uncertain`, never automatic success

## Required gates

- `verify:durable-restart`
- `verify:worker-fencing`
- `verify:transaction-outbox`
- `verify:private-runner`
- PostgreSQL live/static migration and tenant-isolation coverage
- package-boundary gate
- lint + strict TypeScript + full test/build/browser gates
- iOS + Android exact-head regression

## Exit condition

Restart, worker race or duplicate delivery cannot cause one protected operation authority to cross the private effect boundary twice. Any transport ambiguity is represented as uncertainty/recovery rather than fabricated success.

**DRAFT / NOT MERGE AUTHORIZED.**
