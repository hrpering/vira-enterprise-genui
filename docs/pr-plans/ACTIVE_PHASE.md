# Active Phase

**Phase:** MASTER-47 — Commercial Settlement Allocation + Publisher Economics  
**Status:** Q0–Q7 PASS / Q8 FINAL RESTART ACTIVE  
**Base SHA:** `a7083edbb3bafc9326546fbba10286e696f86a06`  
**Frozen executable SHA:** `95c9a0674742c702cc5265b8e1fb35f82dea04ad`  
**Previous frozen SHA:** `b42ae481700094f118328f111f8011ab44136877` — invalidated by Q8 Application-release owner finding  
**Earlier frozen SHA:** `25ee1c25223863f3ceeb53210142acd1da331405` — invalidated by Q8 exact-reference owner finding  
**Previous:** MASTER-46 merged via PR #207  
**Branch:** `master/47-commercial-settlement`  
**PR:** #208 (draft)  
**Next:** MASTER-48 after MASTER-47 merge from new authoritative `main`

MASTER-47 adds deterministic publisher/platform allocation evidence downstream of canonical commercial pricing without becoming invoice/payment/payout/accounting or security/runtime authority.

Canonical composition:

```text
application-package      → canonical Application release + publisher + exact-reference semantics
commercial-pricing       → canonical quote evidence
commercial-settlement    → quote-linked publisher/platform allocation evidence
```

Executable dependency boundary:

```text
commercial-settlement → application-package, commercial-pricing, protocol
```

Current invariants:

- exact Application reference parsing/serialization has one canonical implementation in `application-package`;
- exact Application release id/version parsing/serialization has one canonical implementation in `application-package`;
- Application package validation delegates both nested exact references and root Application release identity/version to those owner APIs;
- settlement schedule and persisted allocation evidence delegate Application release validation to the same owner API;
- settlement rules are selected by exact `settlementRef` only;
- publisherId must match the canonical Application identity namespace;
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

Q8 attempt 1 found duplicate exact-reference parser implementations. Evidence: `docs/evidence/MASTER-47/Q8_ATTEMPT_1.md`.

Q8 attempt 2 found duplicated Application release id/version semantics inside settlement. Evidence: `docs/evidence/MASTER-47/Q8_ATTEMPT_2.md`.

Both owner findings are remediated in frozen executable/test/boundary SHA `95c9a0674742c702cc5265b8e1fb35f82dea04ad`. Q5/Q6 static re-review PASS on that exact freeze.

The repository operator reran the complete final local Q7 gate detached at exact freeze `95c9a0674742c702cc5265b8e1fb35f82dea04ad` and reported it green. Evidence: `docs/evidence/MASTER-47/Q7_FINAL_RERUN_PASS.md`. No counts or timings are reconstructed.

Final independent Q8 restart is active. Merge remains blocked until Q8 PASS plus final frozen-to-closure executable drift zero.
