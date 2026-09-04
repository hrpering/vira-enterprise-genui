# MASTER-46 — Q5 Security + Q6 Architecture Review

**Date:** 2026-09-05  
**Base:** `88a05193c189ce02a214bf0acb74743144981cc5`  
**Reviewed executable head:** `b44f2363571f59369e450cf4571c27635709f2b9`  
**Result:** PASS after Q8 owner-drift remediation

## Q5 — Security / fail-closed review

PASS.

- supply snapshots and lookup queries enter through shared safe `parseJsonValue`;
- exact-object shapes reject unknown authority/provider-secret fields;
- source, per-source and aggregate supply collections are bounded;
- canonical `action` Capabilities fail `ACTION_BOUNDARY_REQUIRED` and cannot enter hosted supply;
- same exact Capability with divergent semantics fails `CAPABILITY_CONFLICT`;
- same exact bindingRef with divergent binding semantics fails `BINDING_CONFLICT`;
- no source priority, majority vote, confidence, implicit latest or fallback winner exists;
- repeated identical supply adds only `sourceIds` provenance;
- source/provider/binding/location identifiers remain provenance/routing only, not authentication or attestation;
- endpoint, credential, health, price, authorization, attestation and priority smuggling is rejected;
- provider execution is never performed by capability-supply.

Accessor/custom-prototype fail-closed coverage remains in the focused suites. The aggregate domain ceiling remains below the shared JSON budget for the boundary fixture, so domain `SUPPLY_LIMIT_EXCEEDED` is reachable without being shadowed by the shared parser limit.

## Canonical owner delegation

Every supply Capability is parsed and serialized by `capability-contract`.

Every hosted binding is parsed and, after Q8 remediation, serialized by `hosted-capability-runtime` through:

```text
parseViraHostedCapabilityBinding
serializeViraHostedCapabilityBinding
```

`capability-supply` no longer defines a local Hosted binding wire serializer. Its conflict fingerprint and snapshot serialization both consume the canonical binding-owner serialization result.

## Q6 — Architecture / ownership review

PASS.

Canonical owner chain:

```text
capability-contract       → CapabilityDefinition meaning + canonical serialization
hosted-capability-runtime → hosted binding meaning/parse/serialize + query execution
capability-supply         → bounded source provenance + exact discovery/conflict semantics
```

Executable dependency boundary remains:

```text
capability-supply
  → capability-contract
  → hosted-capability-runtime
  → protocol
```

No executable dependency on Application federation/distribution, commercial packages, governance/runtime/Action owners, telemetry/action-ledger, deployment, Experience marketplace or provider/cloud/payment SDKs.

The new hosted-binding serializer is an extension of the existing canonical binding owner, not a new semantic owner or authority. It reparses input through the canonical binding parser and returns deterministic serialization of the canonical parsed binding.

Lookup remains exact `capabilityId + capabilityVersion` with nullable provider/location filters. A miss returns an empty result. No ranking, failover, substitute provider, implicit latest or execution decision exists.

The package defines no endpoint, secret, provider health/SLA, VM/container/serverless/Kubernetes placement, durable jobs, autoscaling or generic cloud-compute semantics.

## Verification surface

Final focused suites for the new freeze:

```text
tests/contract/capability-supply.test.ts
tests/contract/capability-supply-hardening.test.ts
tests/contract/hosted-capability-binding-serialization.test.ts
```

Local execution remains Q7. This document records static architecture/security review only and does not fabricate runtime results.

## Conclusion

Q5 PASS / Q6 PASS on executable/test head `b44f2363571f59369e450cf4571c27635709f2b9`.

The original Q7 on `8a01eb001949327d1d34aaa780fd72f2687012ac` is historical only and invalidated for final merge because Q8 caused executable/test changes. Full local Q7 must be rerun on the new exact freeze before Q8 restarts.
