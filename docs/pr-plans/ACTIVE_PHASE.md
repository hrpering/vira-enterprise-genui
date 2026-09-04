# Active Phase

**Phase:** MASTER-43 — Commercial Usage Metering + Rating  
**Status:** Q0–Q2 PASS / Q3 IMPLEMENTATION  
**Base SHA:** `e7598b99bd44b138911113a66179001946186f56`  
**Previous:** MASTER-42 merged via PR #202  
**Branch:** `master/43-usage-rating-metering`  
**Next after merge:** MASTER-44 from new authoritative `main`

MASTER-43 introduces `@vira-enterprise-genui/commercial-metering` as the canonical provider-neutral commercial usage truth and deterministic entitlement-limit rating boundary.

Existing owners remain separate:

- `application-package` declares exact `commercial.meteringRefs[]` only;
- `commercial-entitlement` owns commercial eligibility and `{ meteringRef, quantity }` limits;
- `telemetry` owns operational events, not commercial quantities;
- `experience-observability` owns Experience observations, not accounting;
- `action-ledger` owns Action/governance audit/replay evidence, not billable usage;
- `capability-contract` owns provider-neutral invocation semantics, not meters.

Frozen executable dependency direction:

```text
commercial-metering → application-package, commercial-entitlement, enterprise-context, protocol
```

MASTER-43 owns exact meter definitions, explicit idempotent usage records, deterministic `lifetime | utc-day | utc-month` aggregation and usage-to-entitlement rating (`used / limit / remaining / excess`). It deliberately does not own monetary pricing, currency, invoices, payments, publisher payouts, authorization/governance or runtime execution permission.

Telemetry or Action receipts are never automatically treated as billable usage. Explicit commercial usage records are required; source identity is provenance only, not authentication.

Q0 fresh-base PASS. Q1 targeted ownership reverse engineering PASS. Q2 contract freeze PASS in `docs/pr-plans/MASTER-43.md`. Q3 implementation is active.
