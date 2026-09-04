# Active Phase

**Phase:** MASTER-45 — Commercial Pricing + Rate Card  
**Status:** Q0–Q8 PASS / Q9 READY  
**Base SHA:** `f1ee6ec68b9c1a53f3413b9f201eae355517fc52`  
**Final frozen executable SHA:** `0984b0145381f8344dc458cd28d3e1b26db79e78`  
**Previous frozen SHA:** `5876a177a5c14dfa4ae90d1b1e2a618c01d30eb2` — invalidated by Q8 producer-consistency finding  
**Previous:** MASTER-44 merged via PR #205  
**Branch:** `master/45-commercial-pricing`  
**PR:** #206 (draft until final closure compare)  
**Next:** MASTER-46 after MASTER-45 merge from new authoritative `main`

MASTER-45 introduces the canonical provider-neutral monetary pricing boundary downstream of entitlement/metering without becoming billing/payment/subscription/payout authority.

Canonical owner chain:

```text
commercial-entitlement  → exact eligibility + planRef
commercial-metering     → usage truth + non-monetary rating evidence
commercial-pricing      → rate-card + monetary quote evidence
```

Executable dependency boundary:

```text
commercial-pricing → application-package, commercial-metering, protocol
```

Final invariants:

- integer currency nanos only; no floating-point money;
- exact `planRef` and `meteringRef` identities;
- lexical uppercase three-letter currency only; no ISO/FX/legal-tender authority claim;
- canonical rating evidence is revalidated by the metering owner;
- canonical rating `usedQuantity >= includedRecordCount` because every included usage record has positive quantity;
- used/limit/remaining/excess/status and UTC window evidence is internally consistent;
- every plan rate requires exactly one matching canonical rating;
- missing, duplicate or undeclared ratings fail closed;
- quote and rating `asOf` must exactly match;
- multiplication and total accumulation fail before safe-integer overflow;
- quote evidence parser revalidates line and total arithmetic;
- quote evaluation never mutates usage/entitlement/payment state;
- pricing evidence is not entitlement/invoice/payment/subscription/settlement/tax/authorization/governance/runtime authority.

Q7 attempt 1 passed on `5876a177a5c14dfa4ae90d1b1e2a618c01d30eb2`, but Q8 independently found a real executable producer-consistency gap in rating evidence and invalidated that freeze. Evidence: `docs/evidence/MASTER-45/Q8_ATTEMPT_1.md`.

The parser/test hardening produced final frozen executable SHA `0984b0145381f8344dc458cd28d3e1b26db79e78`. The operator reran the full local Q7 command set detached at that exact SHA and reported it green. Final evidence: `docs/evidence/MASTER-45/Q7_RERUN_PASS.md`.

Final Q8 independent reverse engineering PASS at reviewed PR head `32ae25c2cbcf9bb6708d0449759db157a932a03f`. Evidence: `docs/evidence/MASTER-45/Q8_REVIEW.md`. Frozen executable → reviewed head contained documentation/evidence only.

PR #206 had no submitted reviews, inline review threads or comments at final Q8 check. Hosted `verify`, `ios-native` and `android-native` failures remain infrastructure non-signal because the latest checked jobs expose `steps=null`.

MASTER-45 is Q9 READY subject to one final frozen-executable → closure-head compare proving executable drift remains zero. Any executable/package/test/boundary change invalidates final Q7/Q8 and blocks merge.
