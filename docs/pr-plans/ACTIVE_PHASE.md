# Active Phase

**Phase:** MASTER-45 — Commercial Pricing + Rate Card  
**Status:** Q0–Q6 PASS / Q7 RERUN PENDING / Q8 BLOCKED  
**Base SHA:** `f1ee6ec68b9c1a53f3413b9f201eae355517fc52`  
**Frozen executable SHA:** `0984b0145381f8344dc458cd28d3e1b26db79e78`  
**Previous frozen SHA:** `5876a177a5c14dfa4ae90d1b1e2a618c01d30eb2` — invalidated by Q8 producer-consistency finding  
**Previous:** MASTER-44 merged via PR #205  
**Branch:** `master/45-commercial-pricing`  
**PR:** #206 (draft)  
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

MASTER-45 also extends `commercial-metering` with canonical rating evidence parse/serialize so pricing never copies rating semantics. `commercial-pricing` owns its own quote parse/serialize for safe downstream interoperability.

Pricing invariants:

- integer currency nanos only; no floating-point money;
- exact `planRef` and `meteringRef` identities;
- lexical uppercase three-letter currency only; no ISO/FX/legal-tender authority claim;
- bounded fixed amount and per-meter `used | excess` nanos-per-unit rates;
- canonical rating evidence is revalidated by the metering owner;
- canonical rating `usedQuantity >= includedRecordCount` because every included usage record has positive quantity;
- impossible rating record-count/usage combinations fail closed;
- every plan rate requires exactly one matching canonical rating;
- missing, duplicate or undeclared ratings fail closed;
- quote and rating `asOf` must exactly match;
- multiplication and total accumulation fail before safe-integer overflow;
- quote evidence parser revalidates line arithmetic and total arithmetic;
- quote evaluation never mutates usage/entitlement/payment state;
- pricing evidence is not entitlement/invoice/payment/subscription/settlement/tax/authorization/governance/runtime authority.

Q5 security/fail-closed review PASS and Q6 architecture/ownership review PASS on the original executable surface. Evidence: `docs/evidence/MASTER-45/Q5_Q6_REVIEW.md`.

Q7 originally PASS on exact SHA `5876a177a5c14dfa4ae90d1b1e2a618c01d30eb2` by operator-reported green. During Q8, independent reverse engineering found one real producer-consistency gap in the new rating evidence parser: forged evidence with `usedQuantity < includedRecordCount` could pass despite canonical usage records requiring positive quantities. Evidence: `docs/evidence/MASTER-45/Q8_ATTEMPT_1.md`.

The parser and focused test were hardened. New frozen executable SHA is `0984b0145381f8344dc458cd28d3e1b26db79e78`. The previous Q7 PASS is invalidated for final merge purposes. Full local Q7 must be rerun at this exact SHA before Q8 restarts.

Hosted `verify`, `ios-native`, and `android-native` failures remain infrastructure non-signal because the latest jobs expose no executed steps. PR #206 has no submitted reviews or inline review threads at the latest Q8 check.
