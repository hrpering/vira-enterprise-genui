# Active Phase

**Phase:** MASTER-47 — Commercial Settlement Allocation + Publisher Economics  
**Status:** Q0–Q2 PASS / Q3 ACTIVE  
**Base SHA:** `a7083edbb3bafc9326546fbba10286e696f86a06`  
**Previous:** MASTER-46 merged via PR #207  
**Branch:** `master/47-commercial-settlement`  
**Next:** MASTER-48 after MASTER-47 merge from new authoritative `main`

MASTER-47 adds deterministic publisher/platform allocation evidence downstream of canonical commercial pricing without becoming invoice/payment/payout/accounting or security/runtime authority.

Canonical composition:

```text
application-package      → Application id/version + publisher + exact-reference semantics
commercial-pricing      → canonical quote evidence
commercial-settlement   → quote-linked publisher/platform allocation evidence
```

Executable dependency target:

```text
commercial-settlement → application-package, commercial-pricing, protocol
```

Core invariants:

- settlement rules are selected by exact `settlementRef` only;
- exact rule Application id/version and publisherId must match canonical Application package;
- rule planRef must exactly match canonical quote planRef;
- allocation uses integer basis points only;
- publisher allocation is deterministic floor; fractional nano remainder stays with platform;
- unsafe intermediate multiplication is avoided by quotient/remainder arithmetic;
- allocation evidence embeds canonical pricing quote rather than copying quote semantics;
- no entitlement proof, invoice/payment state, payout/funds movement, tax/FX/accounting or runtime/security authority;
- no default/latest/fallback settlement policy.

Full Q1/Q2 contract: `docs/pr-plans/MASTER-47.md`.
