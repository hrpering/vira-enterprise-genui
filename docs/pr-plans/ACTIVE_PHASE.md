# Active Phase

**Phase:** MASTER-46 — Capability Supply Catalog + Exact Discovery  
**Status:** Q0–Q7 PASS / Q8 ACTIVE  
**Base SHA:** `88a05193c189ce02a214bf0acb74743144981cc5`  
**Frozen executable SHA:** `8a01eb001949327d1d34aaa780fd72f2687012ac`  
**Previous:** MASTER-45 merged via PR #206  
**Branch:** `master/46-capability-supply`  
**PR:** #207 (draft)  
**Next:** MASTER-47 after MASTER-46 merge from new authoritative `main`

MASTER-46 adds the missing provider-neutral Capability supply/discovery layer for the Application Network without turning discovery into execution, provider trust, commercial authority or generic cloud compute.

Canonical composition:

```text
capability-contract          → CapabilityDefinition meaning
hosted-capability-runtime    → exact hosted binding + query execution
capability-supply            → bounded supply provenance + exact discovery/conflict semantics
```

Executable dependency boundary:

```text
capability-supply → capability-contract, hosted-capability-runtime, protocol
```

Final invariants:

- supply records contain canonical CapabilityDefinition + canonical HostedCapabilityBinding;
- binding `capabilityRef` exactly matches enclosed Capability id/version;
- hosted supply accepts canonical `query` Capabilities only;
- `action` Capabilities fail closed with `ACTION_BOUNDARY_REQUIRED`;
- same exact Capability cannot diverge semantically across sources;
- same exact bindingRef cannot resolve to different provider/location/capability bindings across sources;
- identical supply may repeat across sources and retains only source provenance;
- exact lookup only; no latest/fallback/source priority/majority winner;
- deterministic provider/location filtering is not ranking;
- source/provider/binding/location IDs are provenance/routing only, not authentication/attestation;
- source, per-source and aggregate supply ceilings are bounded;
- no endpoints, credentials, health/SLA, failover, commercial pricing/entitlement, deployment scheduling or cloud-compute semantics;
- supply discovery never invokes a provider.

Q5 security/fail-closed review PASS and Q6 architecture/ownership review PASS on frozen executable/test/boundary head `8a01eb001949327d1d34aaa780fd72f2687012ac`. Evidence: `docs/evidence/MASTER-46/Q5_Q6_REVIEW.md`.

Q7 PASS on exact frozen executable SHA `8a01eb001949327d1d34aaa780fd72f2687012ac`. The repository operator reran the full local boundaries/typecheck/focused-suite command set detached at that exact SHA and reported it green. Evidence: `docs/evidence/MASTER-46/Q7_LOCAL_PASS.md`. No counts or timings are reconstructed.

Q8 independent PR reverse engineering is active. Any executable/package/test/boundary change after the freeze invalidates Q7 and blocks merge until a new freeze/rerun.
