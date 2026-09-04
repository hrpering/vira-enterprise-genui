# Active Phase

**Phase:** MASTER-47 — Commercial Settlement Allocation + Publisher Economics  
**Status:** Q0–Q7 PASS / Q8 ACTIVE  
**Base SHA:** `a7083edbb3bafc9326546fbba10286e696f86a06`  
**Frozen executable SHA:** `25ee1c25223863f3ceeb53210142acd1da331405`  
**Previous:** MASTER-46 merged via PR #207  
**Branch:** `master/47-commercial-settlement`  
**PR:** #208 (draft)  
**Next:** MASTER-48 after MASTER-47 merge from new authoritative `main`

MASTER-47 adds deterministic publisher/platform allocation evidence downstream of canonical commercial pricing without becoming invoice/payment/payout/accounting or security/runtime authority.

Canonical composition:

```text
application-package      → Application release + publisher + exact-reference semantics
commercial-pricing       → canonical quote evidence
commercial-settlement    → quote-linked publisher/platform allocation evidence
```

Executable dependency boundary:

```text
commercial-settlement → application-package, commercial-pricing, protocol
```

Final invariants:

- exact Application reference parsing/serialization stays in `application-package`;
- settlement rules are selected by exact `settlementRef` only;
- publisherId must match the Application identity namespace;
- exact rule Application release must match canonical Application input;
- exact rule planRef must match canonical quote planRef;
- no default/latest/fallback settlement policy;
- publisherShareBps is integer `0..10000`;
- allocation uses quotient/remainder safe-integer arithmetic, not direct unsafe gross×bps multiplication;
- fractional nano remainder deterministically stays with platform;
- allocation evidence embeds and reparses canonical pricing quote instead of copying quote semantics;
- allocation evidence independently verifies split arithmetic;
- parsing evidence does not authenticate settlement-policy provenance;
- no entitlement proof, invoice/payment state, payout/funds movement, subscription/refund, tax/FX/accounting or runtime/security authority.

Q5/Q6 static security/architecture review PASS on frozen executable/test/boundary head `25ee1c25223863f3ceeb53210142acd1da331405`.

Q7 local gate PASS on the same exact frozen SHA, operator-reported green. No counts/timings are reconstructed. Evidence: `docs/evidence/MASTER-47/Q7_LOCAL_PASS.md`.

Q8 independent PR reverse engineering is active. Any executable/package/test/boundary drift after the freeze blocks closure and requires a new freeze/Q7.
