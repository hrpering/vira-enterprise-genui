# MASTER-46 — Capability Supply Catalog + Exact Discovery

## Goal

Add the missing provider-neutral Capability supply/discovery layer for the Application Network without turning discovery into execution, provider trust, health/ranking, credentials, commercial entitlement or generic cloud compute.

## Base

- authoritative `main`: `88a05193c189ce02a214bf0acb74743144981cc5`
- previous phase: MASTER-45 merged via PR #206
- branch: `master/46-capability-supply`
- PR: #207
- final frozen executable SHA: `b44f2363571f59369e450cf4571c27635709f2b9`
- invalidated previous freeze: `8a01eb001949327d1d34aaa780fd72f2687012ac`

## Canonical ownership

```text
capability-contract       → CapabilityDefinition meaning + canonical serialization
hosted-capability-runtime → hosted binding meaning/parse/serialize + query execution
capability-supply         → bounded source provenance + exact discovery/conflict semantics
```

Executable dependency boundary:

```text
capability-supply
  → capability-contract
  → hosted-capability-runtime
  → protocol
```

No executable dependency on Application federation/distribution, commercial packages, governance/runtime/Action owners, telemetry/action-ledger, deployment, Experience marketplace or provider/cloud/payment SDKs.

## Supply and lookup semantics

A supply snapshot contains bounded provenance sources with canonical `ViraCapabilityDefinition + ViraHostedCapabilityBinding` records. Every binding `capabilityRef` must exactly equal the enclosed Capability `id@version`.

Only canonical `query` Capabilities may enter hosted supply. `action` Capabilities fail closed with `ACTION_BOUNDARY_REQUIRED`.

Across sources:

- same exact Capability `id@version` must canonical-serialize identically or fail `CAPABILITY_CONFLICT`;
- same exact `bindingRef` must canonical-serialize identically or fail `BINDING_CONFLICT`;
- identical supply may repeat and retains source provenance only.

Lookup requires exact `capabilityId + capabilityVersion` with nullable deterministic provider/location filters. A miss returns an empty list. There is no implicit latest, fallback, substitute provider, source priority, majority vote, confidence or ranking winner.

## Authority / non-goals

Supply evidence is not provider authentication/attestation, health/SLA, authorization/governance/runtime permission, commercial entitlement/pricing, endpoint/credential readiness, deployment placement, execution success, ranking/failover or generic cloud compute.

`sourceId`, `providerId`, `bindingRef` and `locationId` are provenance/routing identities only.

## Q3 implementation

PASS.

Added `@vira-enterprise-genui/capability-supply`, bounded snapshot parse/serialize, exact Capability/binding composition, cross-source conflict semantics, deterministic exact lookup/provenance aggregation and executable dependency declaration.

## Q4 focused/hardening coverage

Focused suites:

```text
tests/contract/hosted-capability-binding-serialization.test.ts
tests/contract/capability-supply.test.ts
tests/contract/capability-supply-hardening.test.ts
```

Coverage includes canonical serialization roundtrip, deterministic snapshots, immutable outputs, provenance aggregation, multi-binding no-ranking behavior, provider/location filters, exact miss/no fallback, action rejection, identity mismatch, Capability/binding conflicts, duplicate source/binding rejection, authority/endpoint/credential/health/commercial smuggling rejection, accessor/custom-prototype safety, source/per-source/aggregate ceilings and malformed/latest/fallback query rejection.

## Q5/Q6

PASS on final frozen executable `b44f2363571f59369e450cf4571c27635709f2b9`. Evidence: `docs/evidence/MASTER-46/Q5_Q6_REVIEW.md`.

## Q7 attempt 1

PASS on `8a01eb001949327d1d34aaa780fd72f2687012ac` by operator-reported green. Evidence: `docs/evidence/MASTER-46/Q7_LOCAL_PASS.md`.

That PASS is historical only. Q8 found executable owner drift afterward and invalidated the freeze.

## Q8 attempt 1

FAIL. Evidence: `docs/evidence/MASTER-46/Q8_ATTEMPT_1.md`.

`capability-supply` was manually reconstructing Hosted binding JSON for conflict fingerprints and snapshot serialization. This duplicated wire semantics owned by `hosted-capability-runtime`.

Remediation:

```text
hosted-capability-runtime
  → serializeViraHostedCapabilityBinding

capability-supply
  → delegates binding conflict fingerprint + snapshot serialization to canonical owner
```

The local binding serializer was removed and focused owner-level serialization coverage added. Dependency/authority boundaries did not expand.

## Final Q7 rerun

PASS by operator report on exact final freeze:

```text
b44f2363571f59369e450cf4571c27635709f2b9
```

Evidence: `docs/evidence/MASTER-46/Q7_RERUN_PASS.md`.

No counts, timings or runner output are reconstructed.

## Final Q8

PASS. Evidence: `docs/evidence/MASTER-46/Q8_REVIEW.md`.

Independent re-review confirmed:

- owner-local binding serialization remediation is correct;
- supply retains canonical Capability/binding ownership separation;
- action supply remains fail-closed;
- exact conflict semantics and no-ranking/no-fallback lookup remain intact;
- no provider trust, commercial, endpoint/credential, deployment or cloud authority creep;
- final freeze → reviewed head contains docs/evidence only;
- no submitted reviews, inline review threads or PR comments;
- latest hosted CI is infrastructure non-signal because checked jobs expose `steps=null`.

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main `88a05193c189ce02a214bf0acb74743144981cc5`.
- Q1 PASS — owner/gap reverse engineering.
- Q2 PASS — capability-supply contract frozen.
- Q3 PASS — package implementation.
- Q4 PASS — focused/hardening coverage.
- Q5 PASS — security/fail-closed review on final freeze.
- Q6 PASS — architecture/ownership review on final freeze.
- Q7 PASS — final exact frozen-head local rerun.
- Q8 PASS — independent PR re-review after remediation.
- Q9 READY — final frozen→closure compare, ready transition, exact-head squash merge and authoritative-main verification.
