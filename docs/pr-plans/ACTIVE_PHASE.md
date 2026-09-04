# Active Phase

**Phase:** MASTER-46 — Capability Supply Catalog + Exact Discovery  
**Status:** Q0–Q8 PASS / Q9 READY  
**Base SHA:** `88a05193c189ce02a214bf0acb74743144981cc5`  
**Final frozen executable SHA:** `b44f2363571f59369e450cf4571c27635709f2b9`  
**Previous frozen SHA:** `8a01eb001949327d1d34aaa780fd72f2687012ac` — invalidated by Q8 owner-drift finding  
**Previous:** MASTER-45 merged via PR #206  
**Branch:** `master/46-capability-supply`  
**PR:** #207 (draft until final closure compare)  
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

- canonical Capability + Hosted binding composition only;
- exact binding-to-Capability identity match;
- `action` Capability supply fails `ACTION_BOUNDARY_REQUIRED`;
- exact Capability and exact binding conflicts fail closed across sources;
- source repetition is provenance only;
- exact lookup only; no latest/fallback/source priority/majority/ranking;
- provider/location filters are deterministic filters, not selection authority;
- no endpoints, credentials, health/SLA, authorization, commercial entitlement/pricing, deployment scheduling or cloud-compute semantics;
- supply never invokes a provider;
- Capability serialization stays in `capability-contract`;
- Hosted binding parse/serialization stays in `hosted-capability-runtime`.

Q7 attempt 1 passed on `8a01eb001949327d1d34aaa780fd72f2687012ac`, then Q8 found duplicated Hosted binding wire serialization inside capability-supply and invalidated that freeze. Evidence: `docs/evidence/MASTER-46/Q8_ATTEMPT_1.md`.

The owner-local remediation produced final frozen executable SHA `b44f2363571f59369e450cf4571c27635709f2b9`. Q5/Q6 were re-reviewed on that freeze. The operator reran the exact full local Q7 command set and reported it green. Evidence: `docs/evidence/MASTER-46/Q7_RERUN_PASS.md`.

Final independent Q8 PASS. Evidence: `docs/evidence/MASTER-46/Q8_REVIEW.md`. No submitted reviews, inline threads or PR comments were present at final review. Latest hosted CI remained infrastructure non-signal because checked jobs exposed `steps=null`.

MASTER-46 is Q9 READY subject to one final compare proving final frozen executable → closure head remains documentation/evidence only. Any executable/package/test/boundary drift blocks merge.
