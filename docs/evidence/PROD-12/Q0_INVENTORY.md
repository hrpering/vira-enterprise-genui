# PROD-12 — Q0 Current-State Inventory

Baseline parent: PROD-11 exact-head closure `9f4c3ba781f3462b8ef4b0ad881214f3e13b31d0`.

## 1. Transaction authority already exists

`@vira-enterprise-genui/action-transaction` already owns:

- immutable frozen `TransactionPlan`,
- `planDigest` + `planRevision`,
- mutable `TransactionRecord` contract,
- human `ApprovalEvidence`,
- signed per-operation execution grant,
- replay-guard interface.

The existing `TransactionRecord` already has lifecycle-shaped fields (`status`, approvals, execution grant refs, operation states, attempts, verification results, ledger refs, recovery/manual state), but PROD-11 does not provide a durable protected-execution store or worker claim authority for it.

## 2. PROD-11 replay protection is a port, not durability

`ViraTransactionGrantReplayGuard.accept()` intentionally defines only the consume-once contract. Its own documentation states that durable atomic implementation belongs to PROD-12.

`verifyViraTransactionExecutionGrant()` verifies exact plan/operation coordinates, audience, validity window and signature before calling the replay guard. PROD-12 must preserve that ordering while replacing test/process-local replay acceptance with tenant-scoped atomic persistence.

## 3. Action Boundary execution reservation is currently process-local

`@vira-enterprise-genui/action-boundary` currently protects execution with in-memory sets for:

- consumed action ids,
- consumed idempotency keys,
- reserved effect revisions.

The boundary reserves these values before awaiting the executor and treats thrown execution as externally uncertain. This is sound for a single live process, but the reservations disappear on restart and cannot fence two workers on different processes.

PROD-12 must not treat these in-memory sets as durable execution authority.

## 4. PostgreSQL foundation is ready to extend

The repository has one migration authority:

`integrations/postgres/migrations/`

Existing migrations cover PROD-02, PROD-03, PROD-05, PROD-08 and PROD-09. There is no PROD-12 durable protected-execution migration yet.

`withTenantTransaction()` already provides:

1. `BEGIN`,
2. transaction-local organization/project/environment scope via `set_config`,
3. `vira.require_scope()`,
4. `COMMIT` or fail-closed rollback,
5. connection release.

This helper is the existing tenant transaction boundary and should be reused.

## 5. Existing durable stores use revision CAS

The PostgreSQL Hosted Capability job store already validates canonical tenant-scoped records and uses revision-CAS replacement:

`UPDATE ... WHERE ... revision = expectedRevision`

This is a useful persistence pattern, but it does not implement queue claims, `FOR UPDATE SKIP LOCKED`, lease epochs, protected-effect reservation or transactional outbox.

## 6. Durable query/application runtime is not protected-write execution

PROD-08/09 already introduced durable ApplicationRun and async Capability job state. Those systems prove restart-safe orchestration/query durability and should be reused where appropriate.

They must not be promoted into protected Action execution authority because they do not own human-approved Action grants, effect reservations or provider-secret execution.

## 7. Worker is currently only a deploy shell

`apps/vira-worker/src/index.ts` currently parses deployment environment and starts the generic service shell. There is no protected-action worker loop or durable claim/renew/transition logic in the app.

This is the correct baseline: PROD-12 can introduce the worker integration explicitly rather than inheriting hidden write semantics.

## 8. Private Runner does not yet exist

The owner matrix reserves `private-runner` for PROD-12, but no current implementation owns:

- scoped ephemeral secret resolution,
- private provider credential handling,
- secret-isolated adapter invocation,
- secret exfiltration rejection.

The production vendor ADR freezes AWS Secrets Manager in `eu-central-1`, while also requiring browser code never receive provider credentials and workload credentials remain least privilege.

## 9. Planned owner matrix is explicit

The production owner matrix reserves:

- `durable-execution` — durable protected execution, earliest PROD-12,
- `private-runner` — private provider execution, earliest PROD-12,
- `integrations/postgres` — persistence adapter only.

It explicitly forbids a separate `transaction-store` semantic owner.

## 10. Missing production guarantees at Q0

The baseline cannot yet prove:

- one queued protected operation is owned by only one live worker,
- stale workers are fenced after lease takeover,
- execution-grant nonce consumption survives restart,
- effect/idempotency reservations survive restart,
- nonce consumption + effect reservation happen atomically,
- state mutation + outbox emission happen atomically,
- duplicate outbox delivery is harmless,
- protected secret values are resolved only inside a Private Runner,
- crash-before-effect and crash-after-effect are distinguished safely.

These are the PROD-12 closure targets.
