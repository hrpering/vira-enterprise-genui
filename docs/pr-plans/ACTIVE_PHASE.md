# Active Phase

**Phase:** MASTER-46 — Capability Supply Catalog + Exact Discovery  
**Status:** Q0–Q7 PASS / Q8 ACTIVE  
**Base SHA:** `88a05193c189ce02a214bf0acb74743144981cc5`  
**Frozen executable SHA:** `b44f2363571f59369e450cf4571c27635709f2b9`  
**Previous frozen SHA:** `8a01eb001949327d1d34aaa780fd72f2687012ac` — invalidated by Q8 owner-drift finding  
**Previous:** MASTER-45 merged via PR #206  
**Branch:** `master/46-capability-supply`  
**PR:** #207 (draft)  
**Next:** MASTER-47 after MASTER-46 merge from new authoritative `main`

MASTER-46 adds the provider-neutral Capability supply/discovery layer for the Application Network without turning discovery into execution, provider trust, commercial authority or generic cloud compute.

Canonical composition:

```text
capability-contract          → CapabilityDefinition meaning + serialization
hosted-capability-runtime    → exact hosted binding parse/serialize + query execution
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
- same exact bindingRef cannot diverge across sources;
- identical supply may repeat across sources and retains only source provenance;
- exact lookup only; no latest/fallback/source priority/majority winner;
- deterministic provider/location filtering is not ranking;
- source/provider/binding/location IDs are provenance/routing only, not authentication/attestation;
- source, per-source and aggregate supply ceilings are bounded;
- no endpoints, credentials, health/SLA, failover, commercial pricing/entitlement, deployment scheduling or cloud-compute semantics;
- supply discovery never invokes a provider;
- Capability serialization stays in `capability-contract`;
- Hosted binding parse/serialization stays in `hosted-capability-runtime`; capability-supply has no local binding wire serializer.

Q7 attempt 1 passed on `8a01eb001949327d1d34aaa780fd72f2687012ac`, but Q8 found local Hosted binding wire serialization duplicated inside capability-supply and invalidated that freeze. Evidence: `docs/evidence/MASTER-46/Q8_ATTEMPT_1.md`.

The owner was extended with `serializeViraHostedCapabilityBinding`; supply now delegates to it and focused serializer coverage was added. Current frozen executable SHA is `b44f2363571f59369e450cf4571c27635709f2b9`.

Q5/Q6 static re-review PASS on the current freeze. Evidence: `docs/evidence/MASTER-46/Q5_Q6_REVIEW.md`.

The repository operator reran the full local Q7 command set detached at the exact current freeze and reported it green. Evidence: `docs/evidence/MASTER-46/Q7_RERUN_PASS.md`. No counts or timings are reconstructed.

Q8 independent PR reverse engineering is now active. Any executable/package/test/boundary drift from the current freeze invalidates the final Q7 and blocks merge.
