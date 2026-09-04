# Active Phase

**Phase:** MASTER-45 — Commercial Pricing + Rate Card  
**Status:** Q0–Q2 PASS / Q3 ACTIVE  
**Base SHA:** `f1ee6ec68b9c1a53f3413b9f201eae355517fc52`  
**Previous:** MASTER-44 merged via PR #205  
**Branch:** `master/45-commercial-pricing`  
**Next:** MASTER-46 after MASTER-45 merge from new authoritative `main`

MASTER-45 introduces the canonical provider-neutral monetary pricing boundary downstream of entitlement/metering without becoming billing/payment/subscription/payout authority.

Nearest-owner findings:

- `commercial-entitlement` owns exact `planRef` selection but deliberately leaves price semantics opaque;
- `commercial-metering` owns exact meter definitions and non-monetary usage ratings;
- `application-package` only references commercial entitlement/meter identities;
- legacy `experience-marketplace` is Experience catalog/search and is not Application Network economics authority.

New canonical owner:

```text
@vira-enterprise-genui/commercial-pricing
```

Executable dependency target:

```text
commercial-pricing → application-package, commercial-metering, protocol
```

MASTER-45 also adds the missing canonical rating parser/serializer to the existing `commercial-metering` owner so pricing can consume persisted/transmitted rating evidence without copying rating semantics.

Pricing invariants:

- integer currency nanos only; no floating-point money;
- exact `planRef` and `meteringRef` identities;
- lexical three-letter uppercase currency code only; no ISO/FX authority claim;
- bounded fixed amount and per-meter `used | excess` nanos-per-unit rates;
- every plan rate requires exactly one canonical rating;
- missing, duplicate or undeclared ratings fail closed;
- quote and rating `asOf` must exactly match;
- multiplication and total accumulation fail before safe-integer overflow;
- quote evaluation never mutates usage/entitlement/payment state;
- pricing evidence is not invoice/payment/subscription/settlement/tax/authorization/governance/runtime authority.

Full Q1/Q2 contract: `docs/pr-plans/MASTER-45.md`.
