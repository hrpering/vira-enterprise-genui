# Active Phase

**Phase:** MASTER-46 — Capability Supply Catalog + Exact Discovery  
**Status:** Q0–Q2 PASS / Q3 ACTIVE  
**Base SHA:** `88a05193c189ce02a214bf0acb74743144981cc5`  
**Previous:** MASTER-45 merged via PR #206  
**Branch:** `master/46-capability-supply`  
**Next:** MASTER-47 after MASTER-46 merge from new authoritative `main`

MASTER-46 adds the missing provider-neutral Capability supply/discovery layer for the Application Network without turning discovery into execution, provider trust, commercial authority or generic cloud compute.

Canonical composition:

```text
capability-contract          → CapabilityDefinition meaning
hosted-capability-runtime    → exact hosted binding + query execution
capability-supply            → bounded supply provenance + exact discovery/conflict semantics
```

Executable dependency target:

```text
capability-supply → capability-contract, hosted-capability-runtime, protocol
```

Core invariants:

- supply records contain canonical CapabilityDefinition + canonical HostedCapabilityBinding;
- binding `capabilityRef` must exactly match the enclosed Capability id/version;
- hosted supply accepts canonical `query` Capabilities only;
- `action` Capabilities fail closed with `ACTION_BOUNDARY_REQUIRED`;
- same exact Capability cannot diverge semantically across sources;
- same exact bindingRef cannot resolve to different provider/location/capability bindings across sources;
- identical supply may repeat across sources and retains all provenance;
- exact lookup only; no latest/fallback/source priority/majority winner;
- deterministic provider/location filtering is not ranking;
- source/provider/binding/location IDs are provenance/routing only, not authentication/attestation;
- no endpoints, credentials, health/SLA, failover, commercial pricing/entitlement, deployment scheduling or cloud-compute semantics.

Full Q1/Q2 contract: `docs/pr-plans/MASTER-46.md`.
