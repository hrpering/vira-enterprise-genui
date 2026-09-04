# Active Phase

**Phase:** MASTER-45 — Commercial Pricing + Rate Card  
**Status:** Q0–Q7 PASS / Q8 ACTIVE  
**Base SHA:** `f1ee6ec68b9c1a53f3413b9f201eae355517fc52`  
**Frozen executable SHA:** `5876a177a5c14dfa4ae90d1b1e2a618c01d30eb2`  
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
- impossible rating record-count/usage combinations fail closed;
- every plan rate requires exactly one matching canonical rating;
- missing, duplicate or undeclared ratings fail closed;
- quote and rating `asOf` must exactly match;
- multiplication and total accumulation fail before safe-integer overflow;
- quote evidence parser revalidates line arithmetic and total arithmetic;
- quote evaluation never mutates usage/entitlement/payment state;
- pricing evidence is not entitlement/invoice/payment/subscription/settlement/tax/authorization/governance/runtime authority.

Q5 security/fail-closed review PASS and Q6 architecture/ownership review PASS. Evidence: `docs/evidence/MASTER-45/Q5_Q6_REVIEW.md`.

Q7 PASS on exact frozen executable SHA `5876a177a5c14dfa4ae90d1b1e2a618c01d30eb2`. The repository operator reran the full local boundaries/typecheck/focused-suite command set detached at that exact SHA and reported it green. Evidence: `docs/evidence/MASTER-45/Q7_LOCAL_PASS.md`. No counts or timings are reconstructed.

Q8 independent PR reverse engineering is active. Any executable change after the freeze invalidates Q7 and blocks merge until a new freeze/rerun.
