# PROD-12 — Q1 Target Architecture

## Authority chain

```text
Frozen TransactionPlan
        |
        v
Human ApprovalEvidence
        |
        v
Signed operation grant (PROD-11)
        |
        v
Durable Execution Store / Stage B
  - exact plan + operation binding
  - atomic nonce consume
  - effect/idempotency reservation
  - queue claim + lease epoch + revision CAS
        |
        v
Fenced worker lease
        |
        v
Private Runner
  - scoped secret resolution
  - exact adapter invocation
  - no durable secret material
        |
        v
Durable state + transactional outbox
```

No later box is allowed to broaden authority granted by an earlier box.

## 1. `durable-execution` semantic owner

Introduce `@vira-enterprise-genui/durable-execution` as the canonical owner for restart-safe protected execution coordination.

It owns the domain contracts for:

- execution identity,
- exact transaction/plan/operation coordinates,
- lifecycle state,
- durable revision,
- claim/lease epoch,
- effect and idempotency reservation identity,
- consumed grant nonce identity,
- attempt metadata that is safe before PROD-13 provider truth,
- transactional outbox event identity,
- persistence/queue port interfaces.

It consumes but does not redefine:

- frozen TransactionPlan and grant semantics from `action-transaction`,
- protected effect semantics from `action-boundary`,
- enterprise scope from `enterprise-context`.

## 2. Canonical execution identity

A protected durable execution is identified by the tenant scope plus:

- `executionId`,
- `transactionId`,
- `planDigest`,
- `planRevision`,
- `operationId`.

The record also freezes the operation's `idempotencyKey` and the signed grant's `grantId`/`nonce` so database rows cannot silently point at different authority later.

## 3. Lifecycle model

Canonical PROD-12 states:

- `queued`
- `executing`
- `verifying`
- `partial`
- `mismatch`
- `uncertain`
- `recovery`
- `manual`

PROD-12 may move a record into `verifying`, `partial`, `mismatch` or `uncertain` as durable coordination state, but it must not invent provider postcondition truth. PROD-13 owns independent reread and verified external-effect truth.

Terminal-like uncertainty therefore remains explicit; there is no generic `force-success` transition.

## 4. Queue claim and fencing

The PostgreSQL queue implementation must claim work inside the tenant transaction using `FOR UPDATE SKIP LOCKED`.

A successful claim atomically:

1. selects one eligible row,
2. increments a monotonic `lease_epoch`,
3. records `worker_id`,
4. records a bounded lease expiry,
5. advances the row revision,
6. returns the exact claimed snapshot.

Every worker mutation after claim requires all of:

- exact tenant scope,
- exact `executionId`,
- expected row revision,
- current `workerId`,
- current `leaseEpoch`,
- non-expired lease when the operation requires live ownership.

A later takeover creates a higher lease epoch. Any earlier worker is permanently stale even if it wakes up before its old local timer notices expiry.

## 5. Stage B authority consumption

Stage B is a durable pre-effect transaction, not a second approval system.

Before a Private Runner invocation can begin, Stage B must atomically prove/bind:

- the frozen plan identity,
- exact operation identity,
- the already-verified PROD-11 signed grant,
- exact execution audience,
- current fenced worker claim,
- unused tenant-scoped grant nonce,
- unused durable action/effect idempotency reservation.

The same database transaction consumes the nonce and creates/locks the durable effect reservation. A rollback consumes neither; a commit consumes both.

The Stage-B result is an execution permit tied to the current `leaseEpoch` and exact operation authority. It is not reusable by another worker or operation.

## 6. Crash semantics

### Crash before Stage-B commit

No nonce/effect reservation survives. Another worker may safely claim/retry.

### Crash after Stage-B commit but before Private Runner dispatch

Nonce/effect reservation survives. Recovery can determine that no runner dispatch was recorded and may create a new fenced attempt under explicit recovery rules without minting broader authority.

### Crash after Private Runner dispatch begins

The system must assume the provider effect may have happened.

- The effect reservation remains consumed.
- The state becomes/re-enters `uncertain` or `recovery`.
- Automatic re-dispatch is allowed only when the frozen operation's provider idempotency/retry-safety contract makes duplicate effect impossible by construction.
- Otherwise manual resolution is required.

PROD-12 never converts transport failure into success.

## 7. Transactional outbox

Every externally consumable execution state change emits its outbox event in the same PostgreSQL transaction as the state mutation.

Outbox event identity is stable and tenant-scoped. Delivery is at-least-once; consumer side effects are idempotent by event id.

Acknowledgement/delivery metadata must not mutate transaction meaning or execution authority.

Initial event consumers are projection hooks for UI/usage/notification domains; their business semantics remain owned by later phases.

## 8. `private-runner` owner

Introduce `@vira-enterprise-genui/private-runner` as the only protected provider-execution boundary that may receive ephemeral credential material.

Input contains only exact authority-safe metadata plus a secret reference before resolution:

- tenant scope,
- transaction/plan/operation coordinates,
- action/provider/adapter/runner references,
- idempotency key,
- current fenced Stage-B permit,
- `secretRef`.

The runner obtains secret material through an injected scoped secret provider representing AWS Secrets Manager. The resolved credential:

- is held only in local execution memory,
- is never added to the durable request/result model,
- is never placed into errors/outbox/receipts/loggable metadata,
- is never returned to `durable-execution`.

The adapter receives the credential through a private invocation argument. Public result/error shapes are validated/redacted before returning across the runner boundary.

## 9. Persistence adapter

`integrations/postgres` implements the `durable-execution` ports using the existing `withTenantTransaction()` helper and the repository's single migration root.

The SQL schema may denormalize selected identity/status columns for safe claim/index/CAS operations, but each row must remain consistent with its canonical domain record. Database shape is not semantic authority.

No `packages/transaction-store` is introduced.

## 10. Worker integration

`apps/vira-worker` becomes composition only:

- construct the PostgreSQL durable execution adapter,
- construct the Private Runner dependencies,
- claim one/bounded work batch,
- pass claimed records through the semantic owner,
- renew/transition through fenced store APIs.

The app does not encode alternative state-machine or authority rules.

## 11. Dependency direction

Target package edges:

```text
action-transaction   action-boundary   enterprise-context
          \              |                /
           \             |               /
                 durable-execution
                         |
                    private-runner
```

Exact implementation may keep `private-runner` as a sibling invoked by the worker rather than a domain dependency if that produces the smaller acyclic graph. In either case:

- `private-runner` must not depend on PostgreSQL,
- `integrations/postgres` implements durable ports,
- no execution package depends on Studio/UI,
- no persistence adapter becomes transaction authority.

## 12. Required evidence

Focused gates:

- `verify:durable-restart`
- `verify:worker-fencing`
- `verify:transaction-outbox`
- `verify:private-runner`

Adversarial coverage must include stale worker, double claim, CAS race, cross-tenant claim, nonce replay, duplicate reservation, crash-before/after-dispatch, duplicate outbox delivery and secret exfiltration.

Closure additionally requires full root/browser/native exact-head CI.
