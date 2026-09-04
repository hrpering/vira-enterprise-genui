# MASTER-46 — Q5 Security + Q6 Architecture Review

**Date:** 2026-09-05  
**Base:** `88a05193c189ce02a214bf0acb74743144981cc5`  
**Reviewed executable head:** `8a01eb001949327d1d34aaa780fd72f2687012ac`  
**Result:** PASS

## Q5 — Security / fail-closed review

PASS.

### Untrusted input

- supply snapshot and lookup query enter through shared `parseJsonValue`;
- exact-object shapes reject unknown fields;
- accessor/custom-prototype inputs are covered by hardening tests and must fail without getter execution;
- source, per-source supply and aggregate supply collections are bounded;
- aggregate limit `2048` remains below the shared JSON node budget for the focused boundary fixture, so the domain `SUPPLY_LIMIT_EXCEEDED` path is testable without being shadowed by the shared parser ceiling.

### Canonical owner delegation

- every supply `capability` is parsed by `parseViraCapabilityDefinition`;
- every supply `binding` is parsed by `parseViraHostedCapabilityBinding`;
- supply does not define a second Capability schema or hosted binding schema;
- binding `capabilityRef` must exactly match enclosed Capability `id@version`.

### Protected effects

Hosted supply accepts only canonical `query` Capabilities.

A canonical `action` Capability fails with `ACTION_BOUNDARY_REQUIRED` before the binding is accepted into supply. Discovery therefore cannot become an alternate protected-effect path around `action-boundary`.

### Conflict handling

- duplicate source IDs fail closed;
- duplicate exact bindingRef within one source fails closed;
- same exact Capability `id@version` with divergent canonical definition fails `CAPABILITY_CONFLICT`;
- same exact bindingRef with divergent capability/provider/location binding fails `BINDING_CONFLICT`;
- there is no source priority, majority vote, confidence score, implicit latest or fallback winner.

### Provenance / trust separation

`sourceId`, `providerId`, `bindingRef` and `locationId` remain provenance/routing identities only.

Repeated identical supply across sources aggregates `sourceIds`; repetition does not create authentication, attestation, trust, health, confidence or priority evidence.

### Authority-smuggling review

Supply record and canonical binding shapes reject fields such as endpoint, credential, health, price, authorized, attested and priority. The package owns no endpoint/transport, secrets, provider health/SLA, authorization, governance, commercial access or monetary semantics.

## Q6 — Architecture / ownership review

PASS.

### New owner justification

The Application Network already has public Application federation/discovery, while the product thesis requires distribution of both Applications and Capabilities. `hosted-capability-runtime` intentionally excludes provider catalog/discovery. Therefore a separate supply/discovery owner is justified.

Canonical owner:

```text
@vira-enterprise-genui/capability-supply
```

### Executable dependency boundary

```text
capability-supply
  → capability-contract
  → hosted-capability-runtime
  → protocol
```

No executable dependency on:

- application-federation / application-distribution;
- commercial-entitlement / commercial-metering / commercial-pricing;
- governance / runtime / action-boundary;
- telemetry / action-ledger;
- deployment-plane;
- Experience marketplace packages;
- provider/cloud/payment SDKs.

### Owner preservation

- `capability-contract` remains the sole CapabilityDefinition semantic owner;
- `hosted-capability-runtime` remains the exact hosted binding + query execution owner;
- `capability-supply` owns only bounded source provenance, canonical supply composition, conflict semantics and deterministic exact discovery;
- supply never invokes providers and does not import hosted invocation APIs for execution;
- commercial pricing/entitlement remains independent and cannot be inferred from discoverability.

### Network semantics

Lookup is exact `capabilityId + capabilityVersion` with deterministic provider/location filters. A miss returns an empty result set. No implicit latest, substitute provider, fallback or ranking decision exists.

### Generic-cloud prohibition

The package defines no endpoint, credential, VM/container/serverless/Kubernetes placement, durable job, autoscaling, failover, health-check or generic workload scheduling semantics.

## Verification surface

Focused suites:

```text
tests/contract/capability-supply.test.ts
tests/contract/capability-supply-hardening.test.ts
```

Coverage includes canonical composition, deterministic serialization, provenance aggregation, exact filtering/miss behavior, action rejection, Capability/binding mismatch, semantic/binding conflicts, unknown-field authority smuggling, accessor/custom-prototype safety, source/per-source/aggregate ceilings and no-latest/fallback queries.

Local execution remains Q7. This review is static architecture/security evidence only and does not fabricate runtime test results.

## Conclusion

Q5 PASS / Q6 PASS on executable/test/boundary head `8a01eb001949327d1d34aaa780fd72f2687012ac`. MASTER-46 may proceed to executable freeze and exact-head local Q7 after documentation synchronization. Any later executable/package/test/boundary change invalidates this reviewed head and requires re-review before Q7.
