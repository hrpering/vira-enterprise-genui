# MASTER-50 — Independent External Provider Proof

**Status:** Q0–Q6 PASS / Q7 PENDING  
**Base SHA:** `46f4d8ec163790765d162d13747dd4f64bf0e8ea`  
**Frozen executable/test SHA:** `5ed6832fa9f233b0b7eb44a8fc5f10f143d00905`  
**Branch:** `master/50-external-provider-proof`  
**PR:** #211 (draft)

## Goal

Prove that an independently named provider can compose Vira's public Capability contract, supply discovery and hosted query runtime without private source imports, hidden provider trust, fallback semantics or new cloud/runtime authority.

## Q0–Q1 — repository truth

- `capability-contract` owns canonical CapabilityDefinition semantics and the `ViraCapabilityExactReference` type.
- `capability-supply` owns provider-neutral supply snapshot parsing, exact discovery and conflict semantics.
- `hosted-capability-runtime` owns one-shot hosted `query` Capability invocation through an explicit adapter boundary.
- `action` Capabilities remain behind the canonical Action Boundary.
- The Application Network thesis requires an independent provider proof before Network RC.

Q1 found one prerequisite owner drift: exact Capability reference parsing semantics existed inside `capability-contract` but were not exposed as an owner-local public API, while `hosted-capability-runtime` duplicated versionRef/floating-alias parsing. MASTER-50 exposes canonical parse/serialize APIs from `capability-contract`, makes CapabilityDefinition nested references consume them, and delegates hosted references to the same owner.

## Q2 — contract freeze

```text
@acme/vira-external-provider-proof
        ↓ public package roots
capability-contract
        ↓ canonical Capability + exact refs
capability-supply
        ↓ exact provider/location discovery only
hosted-capability-runtime
        ↓ one-shot explicit adapter boundary
external provider adapter
```

Required invariants:

- `capability-contract` remains sole CapabilityDefinition/exact-reference semantic owner;
- external proof imports public package roots only;
- supply discovery never invokes a provider;
- lookup is exact capability id + release, with exact optional provider/location filters;
- miss returns empty success, never latest/substitute/ranking/fallback;
- source/provider/binding/location identities are provenance/routing only;
- binding capabilityRef must exactly match CapabilityDefinition id/version;
- action Capability supply/execution fails before provider invocation;
- principal/scope/input/contexts are validated before adapter invocation;
- adapter invocation is one-shot; provider throw does not trigger retry/failover;
- provider output typeRef must exactly match Capability output contract;
- adapter results cannot smuggle auth/trust/commercial/deployment authority;
- successful execution evidence is not authentication, attestation, authorization or entitlement;
- no endpoint/credential/health/SLA/ranking/autoscaling/cloud-compute owner is introduced.

## Q3 — implementation

- added owner-local `parseViraCapabilityExactReference()` / `serializeViraCapabilityExactReference()` to `capability-contract`;
- made CapabilityDefinition nested references delegate to that owner API;
- made hosted binding/request value references delegate to the same owner API;
- added independent `@acme/vira-external-provider-proof` workspace consumer;
- added root `verify:external-provider-proof` focused gate.

## Q4 — focused/hardening tests

New:

- `tests/contract/capability-exact-reference-owner.test.ts`
- `examples/external-provider-proof/external-provider-proof.test.ts`

Existing regression surface retained for Q7:

- `tests/contract/capability-contract.test.ts`
- `tests/contract/hosted-capability-runtime.test.ts`
- `tests/contract/hosted-capability-runtime-hardening.test.ts`
- `tests/contract/capability-supply.test.ts`
- `tests/contract/capability-supply-hardening.test.ts`

Coverage includes exact-reference owner parity, nested path preservation, unsafe accessor/custom-prototype fail-closed behavior, exact provider/location discovery, no fallback, Action Boundary rejection, routing/trust separation, authority smuggling rejection, binding mismatch and one-shot provider failure behavior.

## Q5–Q6

Static security/architecture review PASS: `docs/evidence/MASTER-50/Q5_Q6_REVIEW.md`.

## Q7

Pending operator local execution on exact freeze `5ed6832fa9f233b0b7eb44a8fc5f10f143d00905`. No runtime counts/timings are recorded until reported.

## Q8–Q9

Pending Q7 PASS: fresh independent PR reverse engineering, reviews/threads/comments, hosted CI classification, frozen-to-current executable drift, then exact-head closure/merge gate.
