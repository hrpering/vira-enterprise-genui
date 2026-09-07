# PROD-13 — Real Provider Write, TOCTOU, Postcondition Verification, Durable Action Ledger

## Parent

PROD-12 exact technical-closure SHA:

`eeb563610f024df3b2fc89bd15b6f8c602a57195`

PROD-12 remains unmerged. This branch is stacked directly from that exact tested head.

## Roadmap contract

PROD-13 must deliver:

- at least one real GitHub protected Action;
- at least one real Google Workspace protected Action;
- effect-before independent reread using exact provider version evidence;
- TOCTOU/precondition enforcement;
- effect-after independent reread;
- truthful `verified | partial | mismatch | uncertain` provider truth;
- durable append-only Action Ledger with transaction/operation/attempt/revision identity;
- hash chaining and periodic signed checkpoints;
- safe retry/manual resolution without any force-success path.

Required phase gates:

- `verify:provider-actions`
- `verify:postcondition-verification`
- `verify:action-ledger-integrity`

## Frozen reference provider Actions

### GitHub

Reference protected Action:

`github.repository.file.update`

Target:

`PUT /repos/{owner}/{repo}/contents/{path}`

Rules:

- update only; creation is out of the reference proof;
- fresh GET immediately before write obtains current blob SHA and canonical content digest;
- expected blob SHA from the frozen transaction must match the fresh observation;
- write request supplies that exact existing blob SHA;
- conflict/stale SHA is not success;
- independent GET after write verifies the expected content digest and new provider identity;
- uncertain transport outcome is resolved only by reread, never blind retry.

### Google Workspace

Reference protected Action:

`google.workspace.calendar.event.update`

Target: Google Calendar Event update.

Rules:

- fresh Events.get immediately before write obtains exact resource ETag and canonical event digest;
- frozen expected ETag/digest must match the fresh observation;
- modification uses `If-Match: <exact-etag>`;
- HTTP 412 is explicit precondition mismatch/no-write evidence, not a retryable generic error;
- independent Events.get after write verifies expected fields and provider version;
- uncertain transport outcome is resolved by reread before any retry decision.

These providers were chosen because they expose real optimistic-concurrency primitives instead of requiring Vira to invent provider-side atomicity.

## Ownership

### New thin semantic owner: `action-verification`

Owns:

- canonical provider observation;
- exact resource/version/digest identity;
- pre-effect observation comparison;
- postcondition definition/evaluation;
- verification classification;
- retry-safety evidence derived from external truth.

Does not own:

- provider credentials;
- provider HTTP transport;
- transaction meaning;
- grant issuance;
- durable dispatch fencing;
- ledger persistence.

### Existing owner extended: `action-ledger`

The existing experience/session replay ledger remains valid for its old purpose.

PROD-13 adds a production transaction/effect ledger contract under the same package owner. It must not silently reinterpret the existing V1 experience ledger.

Production ledger owns:

- exact transaction / plan / operation / execution / attempt coordinates;
- observation, dispatch, verification, recovery/manual-resolution evidence entries;
- deterministic entry digest;
- previous-entry hash chain;
- chain-head checkpoint contract;
- signed checkpoint evidence contract.

### Provider integrations

- `integrations/connectors/*` continues to describe provider operation contracts.
- concrete protected-write transport adapters live under provider integration boundaries, not semantic packages.
- provider adapter never decides verified success.
- Private Runner continues to be the only credential-bearing execution boundary.

### PostgreSQL

`integrations/postgres` implements:

- append-only production action-ledger persistence;
- exact tenant-scoped sequence CAS;
- hash-chain continuity checks;
- checkpoint persistence;
- durable verification evidence/state persistence as required by `action-verification` ports.

PostgreSQL is not a semantic owner.

## State/truth rules

```text
provider 2xx                         != verified
write response body                  != independent verification
receipt/request id                   != external truth
pre-effect observation mismatch      -> mismatch / no dispatch
conditional-write conflict           -> mismatch / no blind retry
dispatch accepted + reread expected  -> verified
dispatch accepted + reread different -> mismatch or partial
dispatch uncertain + reread expected -> verified
dispatch uncertain + reread old      -> only retry if strategy proves safe
dispatch uncertain + reread absent   -> uncertain/manual
verification unavailable             -> uncertain
```

No API or internal function may directly coerce `mismatch` or `uncertain` to success.

## Retry contract

Automatic retry is allowed only when external evidence proves one of:

1. provider rejected before effect;
2. conditional precondition failed before effect;
3. post-dispatch reread proves the intended effect is absent and provider/action strategy is explicitly safe to retry.

If effect state cannot be independently established, automatic retry is forbidden.

## Ledger integrity

Each production ledger entry includes at minimum:

- tenant scope;
- transactionId;
- planDigest + planRevision;
- operationId;
- executionId;
- attemptId;
- execution revision / lease epoch where applicable;
- evidence kind;
- occurredAt;
- canonical evidence payload/digest;
- previousEntryHash;
- entryHash.

Append rule:

`entryHash = SHA256(canonical(entryWithoutEntryHash))`

The next entry must bind the exact previous hash. Sequence is monotonic per ledger stream and append-only.

Checkpoint rule:

- checkpoint references exact ledger stream + sequence + chain head;
- checkpoint signer is an injected managed-KMS boundary;
- signature/key identity is evidence, not ledger semantics;
- a forged checkpoint or DB-mutated historical entry must fail verification.

## Negative matrix

Required tests include:

- cross-tenant provider observation substitution;
- resource id/path substitution;
- stale GitHub blob SHA;
- GitHub conflict after pre-read;
- stale Google ETag / HTTP 412;
- provider response forged as success;
- write succeeds but postcondition differs;
- eventual-consistency bounded verification;
- verification timeout/unavailable;
- transport uncertainty with effect present;
- transport uncertainty with effect absent;
- uncertain effect no-auto-retry;
- stale worker cannot append provider-effect success;
- duplicate verification event;
- out-of-order attempt evidence;
- ledger row deletion/mutation/insertion;
- broken previous hash;
- duplicate sequence;
- cross-tenant ledger read/append;
- forged checkpoint signature/key;
- manual resolution without privileged evidence;
- any force-success shortcut.

## Explicit non-goals

PROD-13 does not own:

- UI/operator surfaces (PROD-15);
- commercial usage/rating (PROD-14);
- generalized provider routing (PROD-19);
- machine commerce (PROD-20);
- broad production provider catalog.

## Closure

PROD-13 is technically closed only when the exact final branch head passes:

1. focused provider-action tests;
2. postcondition-verification tests;
3. action-ledger-integrity tests;
4. full repository verification;
5. live PostgreSQL migration/store gates;
6. real/sandbox-safe GitHub and Google reference provider proofs where credentials/environment are available;
7. exact-head local branch/clean-tree revalidation while hosted Actions remain unavailable.

No merge without explicit authorization.