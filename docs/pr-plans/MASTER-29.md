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

## Q0–Q9

- Q0: exact base `7c6716f...`.
- Q1: reverse engineer Application/Capability context refs, EnterpriseContext, protocol JSON boundary and semantic freeze docs.
- Q2: freeze ownership/failure semantics above.
- Q3: implement definition + snapshot types/parser/serializer and boundary entry.
- Q4: focused positive/negative/security tests.
- Q5: review chat/memory/provider/tenant/execution-authority smuggling and bounds.
- Q6: architecture review proving EnterpriseContext/runtime/Action owners are not duplicated.
- Q7: exact-head local `pnpm check:boundaries && pnpm typecheck && pnpm vitest run tests/contract/work-context.test.ts`.
- Q8: independent actual PR diff reverse engineering.
- Q9: squash merge only after green Q7 and final executable-clean compare; then start MASTER-30 from new `main`.
