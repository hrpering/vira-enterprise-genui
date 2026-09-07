# PROD-13 — Q0 Inventory

## Starting point

Parent exact technical-closure SHA:

`eeb563610f024df3b2fc89bd15b6f8c602a57195`

Branch:

`prod/13-real-provider-write-postcondition-action-ledger`

## Existing assets

### 1. PROD-12 execution handoff is correct

The durable worker already ends accepted provider dispatch in `verifying`, not success. The Private Runner isolates credential resolution and returns only dispatch acceptance/rejection evidence. This is the exact boundary PROD-13 must consume rather than bypass.

### 2. Existing `action-ledger` is not the production transaction ledger

Current `packages/action-ledger` is an in-process experience/session replay ledger. Its identity is centered on runtime instance, experience, platform, action id/type, state revisions, policy/approval stages and an in-memory entry array.

It has useful ordering/replay concepts, but it does not currently provide:

- tenant-scoped transaction identity;
- exact plan digest/revision;
- operation/execution/attempt identity;
- provider observation evidence;
- postcondition truth states;
- durable PostgreSQL append;
- hash-chain integrity;
- signed chain checkpoints.

Conclusion: extend the existing owner with a separate production ledger contract. Do not mutate V1 session replay semantics into transaction audit semantics.

### 3. Current GitHub and Google connector contracts are query-only

`integrations/connectors/github-query.ts` declares read operations such as user and organization membership GETs.

`integrations/connectors/google-workspace-query.ts` declares Admin Directory read operations such as user get and groups list.

There is no protected-write connector declaration and no concrete write transport adapter.

### 4. Provider trust/supply already exists upstream

PROD-07/09/10 already established:

- provider connection lifecycle;
- provider trust evidence;
- exact Action supply binding;
- adapter/runner/SecretRef identity;
- declared idempotency/retry/verification strategy.

PROD-13 must consume these exact bindings and must not invent provider substitution.

### 5. Transaction and grant authority already exists

PROD-10/11 already established:

- immutable TransactionPlan;
- plan digest/revision;
- exact operation identity;
- approval evidence;
- signed one-time execution grant.

PROD-13 does not re-authorize or reinterpret the plan.

### 6. Durable execution/fencing already exists

PROD-12 established:

- PostgreSQL queue;
- lease epoch/revision CAS;
- atomic nonce/idempotency/effect reservation;
- restart authority snapshot;
- dispatch fence;
- `uncertain` recovery behavior;
- transactional outbox.

PROD-13 must not create a second worker-fencing or idempotency subsystem.

### 7. PostgreSQL migration stream currently ends at PROD-12

Existing migration sequence currently ends at:

`000009_prod12_effect_epoch_binding.sql`

There is no production Action Ledger table, verification observation table or KMS checkpoint table yet.

## Provider Action selection

### GitHub reference write

Use repository file update via Contents API.

Why:

- updating an existing file requires the existing blob SHA;
- stale concurrent content therefore produces explicit conflict instead of silent overwrite;
- fresh GET before write gives an independently observed blob/version identity;
- fresh GET after write can verify canonical content digest and resulting provider identity.

Reference operation:

`github.repository.file.update`

### Google reference write

Use Google Calendar Event update with ETag conditional modification.

Why:

- Event resources expose ETag;
- `If-Match` provides conditional modification;
- stale ETag produces HTTP 412;
- independent Events.get before and after write supports exact TOCTOU and postcondition proof.

Reference operation:

`google.workspace.calendar.event.update`

## Missing semantic owner

No current package owns provider-independent postcondition semantics.

Required thin owner:

`packages/action-verification`

It should own observation/postcondition semantics only.

It must not own:

- credentials;
- transport;
- action binding;
- transaction planning;
- grants;
- durable dispatch fencing;
- ledger persistence.

## Missing durable audit model

The production Action Ledger needs a new contract under the existing `action-ledger` owner with:

- append-only sequence;
- exact transaction/operation/execution/attempt coordinates;
- canonical evidence payload/digest;
- previous hash + entry hash;
- chain-head checkpoint evidence;
- verifier for historical integrity.

## Initial file/package targets

Expected new or extended surfaces:

```text
packages/action-verification/
packages/action-ledger/src/production.ts
integrations/connectors/github-action.ts
integrations/connectors/google-workspace-action.ts
integrations/github/
integrations/google-workspace/
integrations/postgres/src/action-verification.ts
integrations/postgres/src/action-ledger.ts
integrations/postgres/migrations/000010_prod13_action_verification_ledger.sql
apps/vira-worker/... verification composition
```

Exact file names may adjust during Q1/Q2, but semantic ownership may not.

## High-risk areas

1. treating provider write response as success;
2. performing postcondition verification through the same mutable response object instead of a new read;
3. losing provider version/ETag identity between plan, pre-read and write;
4. generic retry after uncertain effect;
5. allowing provider adapter to classify verification result;
6. writing a second in-memory ledger rather than PostgreSQL truth;
7. adding an `evidence-store` or `transaction-store` duplicate owner;
8. allowing historical ledger update/delete;
9. checkpoint signature not binding exact chain head/sequence;
10. cross-tenant verification or ledger reads.

## Q0 conclusion

The repo has the correct authority chain through dispatch, but **external truth and durable cryptographic audit are still absent**. PROD-13 should add those two narrow layers without reopening PROD-10..12 semantics.