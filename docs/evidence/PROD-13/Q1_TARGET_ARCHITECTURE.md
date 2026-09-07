# PROD-13 — Q1 Target Architecture

## Trust transition

PROD-12 ends with a durable execution whose provider dispatch is either rejected, uncertain, or accepted-for-verification.

PROD-13 begins at that boundary:

```text
DurableExecution(status=verifying)
        │
        ▼
Action Verification
  fresh provider observation
  exact resource/version/digest
        │
        ├─ precondition mismatch ──► mismatch/no dispatch
        │
        ▼
Private Runner protected write
  exact conditional version token
        │
        ▼
Independent provider reread
        │
        ▼
verified | partial | mismatch | uncertain
        │
        ▼
Production Action Ledger
  append-only hash chain
  signed checkpoints
```

Provider transport evidence is never terminal truth by itself.

## `action-verification` owner

### Canonical observation

```ts
interface ViraActionProviderObservation {
  version: "1";
  scope: ViraEnterpriseScope;
  providerId: string;
  connectionId: string;
  resourceType: string;
  resourceId: string;
  observedAtEpochMs: number;
  providerVersion: {
    kind: "etag" | "blob-sha" | "version" | "opaque";
    value: string;
  };
  canonicalDigest: string;
  data: JsonObject;
}
```

Observation data must be bounded canonical JSON. Credentials, auth headers, access tokens and provider SDK objects are forbidden.

### Frozen verification expectation

```ts
interface ViraActionVerificationExpectation {
  version: "1";
  transactionId: string;
  planDigest: string;
  planRevision: number;
  operationId: string;
  executionId: string;
  resourceType: string;
  resourceId: string;
  expectedBefore: {
    providerVersion?: ProviderVersion;
    canonicalDigest?: string;
  };
  expectedPostcondition: JsonObject;
  strategy: "immediate-readback" | "eventual-readback";
  maxVerificationWindowMs: number;
}
```

This expectation is derived from the exact frozen TransactionPlan/action binding. Verification cannot broaden it after approval.

### Pre-effect decision

```text
MATCH
  exact resource + required before version/digest still holds

MISMATCH
  provider resource changed since frozen plan / previous observation

UNAVAILABLE
  independent reread could not establish truth
```

Only `MATCH` may proceed to the protected write.

### Post-effect classification

```text
verified
  independent observation proves all expected postconditions

partial
  independently observable subset changed but full postcondition does not hold
  and provider/action semantics explicitly permit partial classification

mismatch
  independent observation contradicts expected postcondition

uncertain
  independent observation is unavailable/ambiguous or consistency window expires without proof
```

A provider HTTP status or response object cannot directly create `verified`.

## Provider integration boundary

Each reference provider implementation exposes three separate capabilities:

```text
observeBefore(input, credential) -> ProviderObservation
write(input, conditionalVersion, credential) -> DispatchEvidence
observeAfter(input, credential) -> ProviderObservation
```

The two observe calls are independent transport calls. `observeAfter` must not reuse the write response body as its observation.

Credential use stays inside Private Runner/provider-private execution composition.

### GitHub reference adapter

`github.repository.file.update`

- before: GET repository content at exact owner/repo/path/ref;
- version: current blob SHA;
- digest: decoded file content + canonical relevant metadata;
- write: PUT Contents API with exact existing `sha`;
- stale/concurrent SHA conflict: precondition mismatch/no blind retry;
- after: fresh GET and verify expected content digest/new blob identity.

### Google reference adapter

`google.workspace.calendar.event.update`

- before: Events.get exact calendarId/eventId;
- version: ETag;
- digest: canonical selected mutable event fields;
- write: Events.update/patch with `If-Match` exact ETag;
- 412: precondition mismatch/no blind retry;
- after: fresh Events.get and verify expected fields/new ETag.

## Durable verification orchestration

Verification must survive process restart. PROD-13 therefore adds a durable verification work item/state rather than relying on a single synchronous HTTP call chain.

Minimum durable verification state:

```ts
interface ViraDurableActionVerificationRecord {
  version: "1";
  scope: ViraEnterpriseScope;
  verificationId: string;
  transactionId: string;
  planDigest: string;
  planRevision: number;
  operationId: string;
  executionId: string;
  attemptId: string;
  status:
    | "pending-precheck"
    | "precondition-mismatch"
    | "ready-to-write"
    | "write-dispatched"
    | "verifying"
    | "verified"
    | "partial"
    | "mismatch"
    | "uncertain"
    | "manual";
  revision: number;
  leaseEpoch: number;
  lease: ...;
  beforeObservationRef?: string;
  afterObservationRef?: string;
  createdAtEpochMs: number;
  updatedAtEpochMs: number;
}
```

Use the same tenant/RLS/CAS/fencing principles as PROD-12, but do not duplicate PROD-12 effect reservation semantics.

## Attempt identity

Every real provider dispatch receives an immutable `attemptId` before any provider effect. The attempt binds:

- exact execution;
- exact lease epoch/revision;
- exact provider/action/resource;
- exact before observation;
- exact conditional version;
- dispatch timestamps/evidence;
- verification result.

A retry creates a new attempt only after retry-safety evaluation. It never rewrites the prior attempt.

## Retry-safety evaluator

Input:

- action strategy from exact Action binding;
- previous attempt dispatch evidence;
- latest independent provider observation;
- prior verification classification.

Output:

```text
retry-safe
manual-required
already-satisfied
```

`uncertain` alone can never produce `retry-safe`.

## Production Action Ledger extension

Do not modify old V1 replay entries into this schema. Add a separate production submodule owned by `action-ledger`.

### Stream identity

One ledger stream is scoped to an exact transaction:

```text
scope + transactionId + planDigest + planRevision
```

### Entry kinds

Minimum PROD-13 entry kinds:

```text
transaction.execution.queued
transaction.execution.claimed
provider.precondition.observed
provider.precondition.mismatch
provider.dispatch.started
provider.dispatch.accepted
provider.dispatch.rejected
provider.dispatch.uncertain
provider.postcondition.observed
provider.effect.verified
provider.effect.partial
provider.effect.mismatch
provider.effect.uncertain
provider.retry.authorized
provider.manual-resolution.requested
provider.manual-resolution.completed
```

### Entry identity

```ts
interface ViraProductionActionLedgerEntry {
  version: "1";
  scope: ViraEnterpriseScope;
  ledgerId: string;
  sequence: number;
  transactionId: string;
  planDigest: string;
  planRevision: number;
  operationId: string;
  executionId: string;
  attemptId?: string;
  executionRevision?: number;
  leaseEpoch?: number;
  kind: ViraProductionActionLedgerEntryKind;
  occurredAtEpochMs: number;
  evidenceDigest: string;
  evidence: JsonObject;
  previousEntryHash: string | null;
  entryHash: string;
}
```

Canonical hash:

```text
entryHash = SHA256(canonical(entry excluding entryHash))
```

Genesis requires `previousEntryHash = null`; sequence N requires previous hash equal exact sequence N-1 entry hash.

## PostgreSQL Action Ledger

New migration begins after current `000009`.

Target migration:

`000010_prod13_action_verification_ledger.sql`

Tables at minimum:

```text
action_verification_records
action_verification_observations
production_action_ledger_entries
production_action_ledger_checkpoints
```

Rules:

- tenant columns on every table;
- RLS + FORCE RLS;
- runtime worker least privilege;
- historical ledger entry UPDATE/DELETE not granted;
- sequence unique per tenant+ledger;
- entry hash unique/bounded;
- checkpoint references existing exact sequence/hash;
- DB constraints duplicate semantic validation where practical but do not become owner.

Append algorithm:

1. tenant transaction;
2. lock current chain head / ledger stream;
3. validate next sequence and previous hash;
4. insert immutable entry;
5. advance chain head via CAS;
6. optional outbox in same transaction;
7. commit.

No update/delete path for historical ledger entries.

## KMS checkpoint boundary

`action-ledger` defines signer/verifier ports analogous to execution-grant crypto boundaries.

Checkpoint payload binds:

- scope;
- ledgerId;
- transaction/plan identity;
- sequence;
- chainHeadHash;
- issuedAt;
- keyId/audience.

Checkpoint persistence stores signature evidence, never private key material.

## Worker composition

Production flow becomes:

```text
PROD-12 claim + authority + lease + Stage B
  → PROD-13 pre-effect fresh observation
  → precondition evaluation
  → durable attempt + ledger append
  → conditional protected write in Private Runner
  → durable dispatch evidence
  → independent post-effect observation
  → verification classification
  → durable execution/verification state
  → production ledger append
  → optional checkpoint
```

If the process crashes after write dispatch but before verification, restart resumes from persisted `write-dispatched/verifying` state and performs reread. It does not dispatch again.

## Security boundaries

- no provider secret outside Private Runner;
- no credential/token in observation, verification or ledger JSON;
- resource/version identity exact, no floating ref;
- no provider substitution after plan freeze;
- cross-tenant observation/ledger evidence rejected;
- provider response cannot self-certify postcondition;
- historical ledger mutation detectable by hash verification;
- checkpoint verification happens before accepting externally supplied ledger checkpoint evidence.

## Q1 exit

Target architecture is frozen when implementation follows these ownership boundaries and the reference GitHub/Google conditional-write strategies above without introducing a competing transaction/evidence owner.