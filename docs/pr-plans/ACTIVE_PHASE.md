# Active Phase

**Phase:** MASTER-47 — Commercial Settlement Allocation + Publisher Economics  
**Status:** Q0–Q6 PASS / Q7 RERUN PENDING / Q8 BLOCKED  
**Base SHA:** `a7083edbb3bafc9326546fbba10286e696f86a06`  
**Frozen executable SHA:** `b42ae481700094f118328f111f8011ab44136877`  
**Previous frozen SHA:** `25ee1c25223863f3ceeb53210142acd1da331405` — invalidated by Q8 owner-implementation finding  
**Previous:** MASTER-46 merged via PR #207  
**Branch:** `master/47-commercial-settlement`  
**PR:** #208 (draft)  
**Next:** MASTER-48 after MASTER-47 merge from new authoritative `main`

MASTER-47 adds deterministic publisher/platform allocation evidence downstream of canonical commercial pricing without becoming invoice/payment/payout/accounting or security/runtime authority.

Canonical composition:

```text
application-package      → Application release + publisher + one exact-reference parser implementation
commercial-pricing       → canonical quote evidence
commercial-settlement    → quote-linked publisher/platform allocation evidence
```

Executable dependency boundary:

```text
commercial-settlement → application-package, commercial-pricing, protocol
```

Final invariants:

- exact Application reference parsing/serialization has one canonical implementation in `application-package`;
- Application package validation delegates nested references to that parser and only remaps error paths;
- settlement rules are selected by exact `settlementRef` only;
- publisherId must match the Application identity namespace;
- exact rule Application release must match canonical Application input;
- exact rule planRef must match canonical quote planRef;
- no default/latest/fallback settlement policy;
- publisherShareBps is integer `0..10000`;
- allocation uses quotient/remainder safe-integer arithmetic, not unsafe direct gross×bps multiplication;
- fractional nano remainder deterministically stays with platform;
- allocation evidence embeds/reparses canonical pricing quote and independently verifies split arithmetic;
- persisted allocation evidence rejects authority/payment/tax/credential smuggling and unsafe object inputs;
- parsing evidence does not authenticate settlement-policy provenance;
- no entitlement proof, invoice/payment state, payout/funds movement, subscription/refund, tax/FX/accounting or runtime/security authority.

Q7 attempt 1 passed on old freeze `25ee1c25223863f3ceeb53210142acd1da331405`, but independent Q8 found duplicate exact-reference parser implementations inside `application-package`. Evidence: `docs/evidence/MASTER-47/Q8_ATTEMPT_1.md`.

The owner-local remediation removed the duplicate parser implementation, added parity coverage and hardened persisted allocation evidence. Q5/Q6 static re-review PASS on new freeze `b42ae481700094f118328f111f8011ab44136877`.

The original Q7 PASS is historical only and invalidated for final merge. Full local Q7 must be rerun detached at the new exact SHA before Q8 restarts.
