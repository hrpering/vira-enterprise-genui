# Active Phase

**Phase:** MASTER-51 — Cross-Surface Exact Semantics + Application Network RC  
**Status:** Q0–Q6 PASS / Q7 RERUN PENDING / Q8 BLOCKED  
**Base SHA:** `6f02e4437210c0cd662f1852759c88fca328462c`  
**Frozen executable/test/config SHA:** `a3ba23a68f68aee894f818823ba1003511024f19`  
**Invalidated previous freeze:** `952e3445d46d0b3770a499522abc1ad77315a228`  
**Earlier invalidated freeze:** `0c4913931d8fcc19f5e3676be4e3ea9c4a84b67f`  
**Previous:** MASTER-50 merged via PR #211  
**Branch:** `master/51-network-rc`  
**PR:** #212 (draft)  
**Next:** Application Network roadmap closure after MASTER-51 exact-head merge

MASTER-51 is the final planned Application Network closure phase. It creates no new semantic owner. It proves that canonical exact semantics survive the complete publisher/discovery/AI-host/provider path and composes the existing Enterprise + Network proof gates into one fail-closed RC command.

Q8 attempt 1 found a canonical-owner violation in adjacent Capability release identity: `capability-contract` and `capability-supply` independently validated the same Capability `id + release semver` semantic. The fix moved that release identity into the existing canonical Capability owner and made both CapabilityDefinition and supply lookup delegate to it.

Canonical cross-surface proof:

```text
external publisher
        ↓
canonical Application Distribution
        ↓
public federation exact lookup
        ↓
explicit Distribution integrity verification
        ↓
AI-host exact compatibility
        ↓
canonical Application Capability id@version
        ↓
Capability supply exact provider/location lookup
        ↓
hosted one-shot query execution
        ↓
execution evidence with the same exact Capability id@version
```

Application Network RC composition:

```text
verify:application-network-rc
  ├─ verify:enterprise-rc
  ├─ verify:external-publisher-proof
  ├─ verify:external-ai-host-proof
  ├─ verify:external-provider-proof
  └─ verify:application-network-cross-surface
```

Current invariants:

- integration/release gate only; no new Application/Capability/Network semantic owner;
- `capability-contract` owns CapabilityDefinition, exact references and Capability release identity;
- CapabilityDefinition and Capability supply release queries consume the same canonical Capability release parser;
- public Vira package-root imports only in integration proof;
- no floating/latest/wildcard Application Capability references;
- exact Application federation release lookup only;
- explicit Distribution integrity verification before AI-host compatibility;
- exact protocol projection compatibility;
- Application Capability `id@version` flows unchanged into Capability supply lookup;
- exact provider miss is empty success with no substitute/latest/fallback/ranking;
- binding mismatch and action Capability paths fail before provider invocation;
- hosted provider invocation remains one-shot;
- source/provider/binding/location IDs remain routing/provenance only;
- RC success grants no authentication, attestation, authorization, entitlement, deployment or generic cloud authority.

Evidence history:

- `docs/evidence/MASTER-51/Q7_ATTEMPT_1_FAIL.md` — original executable/lint blockers;
- `docs/evidence/MASTER-51/Q7_ATTEMPT_2_ENV_BLOCKED.md` — code/repository gates passed but local Xcode environment blocked native RC;
- `docs/evidence/MASTER-51/Q7_FINAL_PASS.md` — operator-reported final PASS on previous freeze after environment remediation; now historical because Q8 required executable changes;
- `docs/evidence/MASTER-51/Q8_ATTEMPT_1_OWNER_DRIFT.md` — Q8 owner-drift finding and remediation.

Q5/Q6 static review was repeated and PASS on current freeze `a3ba23a68f68aee894f818823ba1003511024f19`.

A full local Q7 rerun on this exact new freeze is required. Q8 remains blocked until that rerun passes.
