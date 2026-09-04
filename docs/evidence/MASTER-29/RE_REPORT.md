# MASTER-29 Reverse-Engineering Report

## Baseline

Authoritative base: `7c6716f90810528b4dfc4f2f040755ab5f96ecb1` (MASTER-28 squash merge).

## Existing owners inspected

### Application semantic freeze

`APPLICATION_MODEL.md` defines Context as bounded work state, artifacts, evidence, results, decisions, receipts and provenance. It explicitly excludes chat history/user memory from ApplicationGraph semantics and forbids Application from becoming an execution engine.

### Application Package

`packages/application-package/src/types.ts` already carries `contextTypes: ViraApplicationExactReference[]`. Therefore MASTER-29 must provide the referenced Context semantic owner rather than changing Application Package into a Context payload owner.

### Capability Contract

`packages/capability-contract/src/types.ts` already carries exact `contextRequirements`. Capability owns requirement references only; it must not absorb Context values or provenance.

### Enterprise Context

`packages/enterprise-context/src/types.ts` owns organization/project/environment scope, principals and secret references/leases. WorkContext must not repeat these fields or weaken cross-organization/project security boundaries.

### Protocol

`protocol.parseJsonValue()` already provides bounded, safe JSON cloning with depth/node/string/array/object budgets and rejects accessors, custom prototypes, symbols, sparse arrays, cycles, non-finite numbers and other non-JSON input. WorkContext consumes this boundary instead of implementing a competing unsafe-data parser.

### Protected Actions / receipts

Action execution and ledger truth remain with `action-boundary` / `action-ledger`. WorkContext may carry a `receipt` item as evidence, but the copied value never becomes a permit or replay authority.

## Gap

Before MASTER-29, Application and Capability could reference Context types but the repository had no canonical provider-neutral Context definition/snapshot owner. That left the semantic family named but not executable as a bounded contract.

## Chosen owner

New package: `@vira-enterprise-genui/work-context`.

Permitted dependency graph:

```text
work-context
    ↓
 protocol
```

No dependency on EnterpriseContext, runtime, Action Boundary, Capability, Application Package, provider SDKs or governance is needed for the contract itself.

## Frozen semantics

WorkContext has two related but distinct values:

1. `ViraWorkContextDefinition` — exact semantic context identity/release metadata; target of Application `contextTypes` and Capability `contextRequirements` refs.
2. `ViraWorkContext` — immutable bounded snapshot bound to one exact definition ref.

Snapshot items are limited to the semantic families already frozen by MASTER-26: state, artifact, evidence, result, decision and receipt. Generic safe JSON is data only; it does not grant authority.

## Security review targets

Focused tests must prove:

- chat/messages/memory/prompt fields are not first-class canonical context fields;
- `message`, `chat`, `memory`, `prompt` cannot become item kinds;
- provider endpoints/credentials/transports cannot become WorkContext authority fields;
- tenant/project/environment/principal fields cannot displace EnterpriseContext;
- policy/executor fields cannot create direct effect authority;
- floating refs, duplicate refs/items and collection overflow fail closed;
- unsafe object/accessor input fails at the shared JSON boundary;
- receipt data cannot smuggle an execution permit as an item field;
- nested JSON serialization is deterministic regardless of input key order.

## Non-goals

MASTER-29 does not add Context persistence, mutation APIs, runtime revision state, a data schema registry, vector memory, chat transcript storage, agent scratchpads, provider binding, authorization, governance, action execution or ApplicationGraph edges. Those remain outside this phase or under existing owners.
