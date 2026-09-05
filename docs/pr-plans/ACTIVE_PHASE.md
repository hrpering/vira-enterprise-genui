# Active Phase

**Phase:** MASTER-50 — Independent External Provider Proof  
**Status:** Q0–Q9 PASS / MERGE READY  
**Base SHA:** `46f4d8ec163790765d162d13747dd4f64bf0e8ea`  
**Frozen executable SHA:** `5ed6832fa9f233b0b7eb44a8fc5f10f143d00905`  
**Previous:** MASTER-49 merged via PR #210  
**Branch:** `master/50-external-provider-proof`  
**PR:** #211 (ready transition / exact-head merge pending)  
**Next:** MASTER-51 after MASTER-50 merge from new authoritative `main`

MASTER-50 proves that an independently named provider can compose Vira's public Capability contract, exact supply discovery and hosted query execution boundary without private imports, hidden trust semantics or generic cloud/runtime authority.

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

Q7 operator-reported PASS on exact freeze `5ed6832fa9f233b0b7eb44a8fc5f10f143d00905`: `docs/evidence/MASTER-50/Q7_LOCAL_PASS.md`.

Independent Q8 PASS: `docs/evidence/MASTER-50/Q8_REVIEW.md`.

Final Q9 closure gate PASS: `docs/evidence/MASTER-50/Q9_CLOSURE_GATE.md`.

Frozen-to-closure executable/package/test/boundary drift is zero. PR #211 is ready for draft→ready transition, fresh exact-head read and squash merge guarded by `expected_head_sha`.
