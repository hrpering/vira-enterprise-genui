# MASTER-29 — Bounded WorkContext Contract

## Goal

Implement the canonical provider-neutral WorkContext semantic owner as a bounded definition + immutable snapshot contract without becoming chat history, user memory, prompt storage, enterprise scope, provider state, runtime state or execution authority.

## Base

- authoritative `main`: `7c6716f90810528b4dfc4f2f040755ab5f96ecb1`
- previous phase: MASTER-28 merged via PR #188
- branch: `master/29-work-context`

## Reverse-engineered ownership

Existing owners already establish the boundaries MASTER-29 must respect:

- `application-package.contextTypes[]` references exact Context semantic identities; it does not own Context payloads.
- `capability-contract.contextRequirements[]` references exact required Context semantic identities; it does not own Context payloads.
- `enterprise-context` owns organization/project/environment/principal/secret scope and must not be duplicated.
- `runtime-core` owns runtime state/revision/lifecycle; WorkContext is not runtime state authority.
- `action-boundary` + `action-ledger` own protected execution permits/receipts/ledger authority; a receipt copied into Context is data/evidence only.
- `protocol` owns the safe JSON boundary and semantic id helpers consumed by WorkContext.

`work-context` OWNS:

- immutable WorkContext definition identity/release metadata;
- immutable bounded WorkContext snapshot shape;
- exact Context type references;
- bounded semantic item kinds: `state`, `artifact`, `evidence`, `result`, `decision`, `receipt`;
- exact optional item type references;
- bounded provenance source references and observation timestamp;
- deterministic serialization of arbitrary safe JSON item values.

It DOES NOT OWN:

- chat history, conversation transcripts, prompts or user memory;
- agent-framework scratchpads/state;
- organization/project/environment/principal/secret scope;
- provider endpoints, credentials, transports or provider routing;
- governance/policy or authorization;
- protected Action permits/execution;
- action receipt/ledger truth;
- runtime instance revision/lifecycle;
- data schema language/registry;
- Application graph/composition.

## Contract shape

Definition:

```text
schemaVersion
id
version
publisher
metadata
```

Snapshot:

```text
schemaVersion
id                 # bounded opaque snapshot token
typeRef             # exact WorkContext definition ref
items[]
  id
  kind              # state|artifact|evidence|result|decision|receipt
  typeRef           # exact semantic data ref or null
  value             # safe bounded JsonValue
  provenance
    sourceRefs[]    # exact semantic refs only
    observedAtUnixMs
```

WorkContext does not invent a data-schema language. Item `typeRef` points to external semantic data contracts when one exists; `null` is explicit when no type contract is claimed.

## Invariants

- WorkContext definition release version is exact semver.
- All semantic refs are exact; no `latest`, `main`, wildcard/range or silent fallback.
- Publisher id matches the first definition namespace segment.
- Snapshot/item/provenance collections are bounded and duplicates fail closed.
- WorkContext item kind is a closed semantic enum; `message`, `chat`, `memory` and `prompt` are not canonical Context kinds.
- Root shapes reject tenant/provider/policy/executor/chat-memory fields.
- Receipt item values do not create execution authority.
- Unsafe accessor/custom-prototype/cyclic/non-JSON input fails through shared protocol JSON validation.
- Arbitrary item values are canonicalized recursively for deterministic serialization.
- Parsed values are detached/deeply frozen.
- New package dependency edge is only `work-context → protocol`.

## Q7 correction record

Initial executable head `8ea036ccdfeb13a2ff42486a23ab939a19946e42` produced:

- `pnpm check:boundaries` PASS;
- focused `work-context.test.ts` PASS — 11/11;
- `pnpm typecheck` FAIL — TS7053 at `packages/work-context/src/validate.ts:83` because TypeScript did not narrow readonly `JsonArray | JsonObject` sufficiently for string indexing.

The correction is semantic-neutral: the non-array branch in `canonicalize()` explicitly narrows to `JsonObject` before indexing. Corrected frozen executable head:

`68d1c1f48a68c6963fd8ba0be3e01fa4be66a428`

The operator then reported the exact corrected head green for:

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run tests/contract/work-context.test.ts
```

Focused WorkContext tests passed 11/11.

## Q0–Q9

- Q0: PASS — exact base `7c6716f...`.
- Q1: PASS — Application/Capability context refs, EnterpriseContext, protocol JSON boundary and semantic freeze docs reverse engineered.
- Q2: PASS — ownership/failure semantics frozen above.
- Q3: PASS — definition + snapshot types/parser/serializer and boundary entry implemented.
- Q4: PASS — focused positive/negative/security coverage implemented.
- Q5: PASS — chat/memory/provider/tenant/execution-authority smuggling and bounds reviewed fail-closed.
- Q6: PASS — architecture review proves EnterpriseContext/runtime/Action owners are not duplicated.
- Q7: PASS — corrected exact executable head `68d1c1f48a68c6963fd8ba0be3e01fa4be66a428` reported green locally.
- Q8: PASS when final exact-head compare confirms every post-Q7 change is docs/evidence only.
- Q9: READY after final compare; squash merge with exact PR head, then start MASTER-30 from new `main`.
