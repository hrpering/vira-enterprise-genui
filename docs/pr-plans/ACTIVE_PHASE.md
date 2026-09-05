# Active Phase

**Phase:** MASTER-50 — Independent External Provider Proof  
**Status:** Q0–Q8 PASS / Q9 READY  
**Base SHA:** `46f4d8ec163790765d162d13747dd4f64bf0e8ea`  
**Frozen executable SHA:** `5ed6832fa9f233b0b7eb44a8fc5f10f143d00905`  
**Previous:** MASTER-49 merged via PR #210  
**Branch:** `master/50-external-provider-proof`  
**PR:** #211 (draft; ready transition pending Q9)  
**Next:** MASTER-51 after MASTER-50 merge from new authoritative `main`

MASTER-50 proves that an independently named provider can compose Vira's public Capability contract, exact supply discovery and hosted query execution boundary without private imports, hidden trust semantics or generic cloud/runtime authority.

Canonical proof composition:

```text
@acme/vira-external-provider-proof
        ↓
capability-contract
        ↓ canonical Capability + exact refs
capability-supply
        ↓ exact provider/location discovery only
hosted-capability-runtime
        ↓ one-shot explicit adapter boundary
external provider adapter
```

Final invariants:

- `capability-contract` remains the canonical CapabilityDefinition and exact-reference owner;
- CapabilityDefinition nested references and hosted binding/request references consume `parseViraCapabilityExactReference()`;
- external proof imports only public Vira package roots;
- supply discovery does not invoke the provider;
- exact misses return empty success with no latest/substitute/ranking/fallback;
- source/provider/binding/location identities remain provenance/routing only;
- binding capabilityRef must exactly match CapabilityDefinition id/version;
- action Capabilities fail before provider invocation and remain behind `action-boundary`;
- adapter invocation is one-shot with no retry/failover;
- provider output remains exact typed evidence;
- provider result authority/commercial/credential smuggling fails closed;
- successful provider execution does not authenticate, attest, authorize or entitle the provider/principal;
- no endpoint, credential, provider-health, autoscaling, deployment or generic cloud-compute owner is introduced.

Q5/Q6 static review PASS: `docs/evidence/MASTER-50/Q5_Q6_REVIEW.md`.

Q7 local execution is operator-reported PASS on exact freeze `5ed6832fa9f233b0b7eb44a8fc5f10f143d00905`. Evidence: `docs/evidence/MASTER-50/Q7_LOCAL_PASS.md`. No counts/timings were reconstructed.

Independent Q8 PASS: `docs/evidence/MASTER-50/Q8_REVIEW.md`. No executable/security/ownership blocker found; hosted Actions were infra non-signal because failed jobs exposed `steps = null`.

Q9 final closure gate is ready. Merge is permitted only if frozen executable SHA → closure head remains docs/evidence-only.
