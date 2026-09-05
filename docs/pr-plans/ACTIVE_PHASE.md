# Active Phase

**Phase:** MASTER-51 — Cross-Surface Exact Semantics + Application Network RC  
**Status:** Q0–Q7 PASS / Q8 ACTIVE  
**Base SHA:** `6f02e4437210c0cd662f1852759c88fca328462c`  
**Frozen executable/test/config SHA:** `e8f568834752ce92796c9cddec5745b373b07d69`  
**Invalidated previous freeze:** `a3ba23a68f68aee894f818823ba1003511024f19`  
**Earlier invalidated freezes:** `952e3445d46d0b3770a499522abc1ad77315a228`, `0c4913931d8fcc19f5e3676be4e3ea9c4a84b67f`  
**Previous:** MASTER-50 merged via PR #211  
**Branch:** `master/51-network-rc`  
**PR:** #212 (draft)  
**Next:** Application Network roadmap closure after MASTER-51 exact-head merge

MASTER-51 is the final planned Application Network closure phase. It creates no new semantic owner. It proves canonical exact semantics across publisher/discovery/AI-host/provider surfaces and composes the existing Enterprise + Network proof gates into one fail-closed RC command.

Q8 attempt 1 found duplicate Capability release identity validation between `capability-contract` and `capability-supply`. The remediation made `capability-contract` the single public owner of Capability `{ id, version }` release syntax and made CapabilityDefinition + supply lookup delegate to that API.

Q7 attempt 3 on `a3ba23a68f68aee894f818823ba1003511024f19` exposed only a contract-test harness resolution error: the new parity test used bare workspace package imports from `tests/contract`, causing two TS2307 failures. The internal test was corrected to the repository's established relative source-entrypoint import pattern. Production semantics were unchanged.

The operator then reported the exact full Q7 rerun **green** on frozen SHA `e8f568834752ce92796c9cddec5745b373b07d69`. This is the current final local verification authority. No test counts, timings or warning counts are reconstructed beyond that operator report.

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
- internal `tests/contract` parity tests use established relative source-entrypoint imports; independent `@acme` proofs continue to use public package-root imports;
- no floating/latest/wildcard Application Capability references;
- exact Application federation release lookup only;
- explicit Distribution integrity verification before AI-host compatibility;
- exact provider miss is empty success with no substitute/latest/fallback/ranking;
- binding mismatch and action Capability paths fail before provider invocation;
- hosted provider invocation remains one-shot;
- source/provider/binding/location IDs remain routing/provenance only;
- RC success grants no authentication, attestation, authorization, entitlement, deployment or generic cloud authority.

Evidence history:

- `docs/evidence/MASTER-51/Q7_ATTEMPT_1_FAIL.md`;
- `docs/evidence/MASTER-51/Q7_ATTEMPT_2_ENV_BLOCKED.md`;
- `docs/evidence/MASTER-51/Q7_FINAL_PASS.md` — historical after later executable changes;
- `docs/evidence/MASTER-51/Q8_ATTEMPT_1_OWNER_DRIFT.md`;
- `docs/evidence/MASTER-51/Q7_ATTEMPT_3_TYPECHECK_FAIL.md`;
- `docs/evidence/MASTER-51/Q7_RERUN_PASS.md` — current operator-reported Q7 PASS on exact frozen SHA.

Q5/Q6 static review is PASS on current freeze `e8f568834752ce92796c9cddec5745b373b07d69`.

Q8 is now active and must independently re-read the current PR, canonical adjacent owners, reviews/threads/comments, hosted Actions and freeze→closure drift before any ready-for-review or merge action.
