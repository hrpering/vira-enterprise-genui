# Active Phase

**Phase:** MASTER-43 — Commercial Usage Metering + Rating  
**Status:** Q0–Q6 PASS / Q7 RERUN PENDING  
**Base SHA:** `e7598b99bd44b138911113a66179001946186f56`  
**Frozen executable SHA:** `2d3e7933fc4c8ab619771a07dc926ef94fc2cfde`  
**Previous:** MASTER-42 merged via PR #202  
**Branch:** `master/43-usage-rating-metering`  
**PR:** #204  
**Next after merge:** MASTER-44 from new authoritative `main`

MASTER-43 introduces `@vira-enterprise-genui/commercial-metering` as the canonical provider-neutral commercial usage truth and deterministic entitlement-limit rating boundary.

Existing owners remain separate:

- `application-package` declares exact `commercial.meteringRefs[]` only;
- `commercial-entitlement` owns commercial eligibility and `{ meteringRef, quantity }` limits;
- `telemetry` owns operational events, not commercial quantities;
- `experience-observability` owns Experience observations, not accounting;
- `action-ledger` owns Action/governance audit/replay evidence, not billable usage;
- `capability-contract` owns provider-neutral invocation semantics, not meters.

Executable dependency boundary:

```text
commercial-metering → application-package, commercial-entitlement, enterprise-context, protocol
```

MASTER-43 owns exact meter definitions, explicit canonical usage records, append-only `usageId` idempotency, deterministic `lifetime | utc-day | utc-month` aggregation and non-monetary usage-to-entitlement rating (`used / limit / remaining / excess`).

Telemetry or Action receipts are never automatically treated as billable usage. Explicit commercial usage records are required; `sourceId` is provenance only, not authentication or integrity proof.

The package deliberately does not own monetary pricing, currency, invoices, payments, subscriptions, publisher payouts, authorization/governance or runtime execution permission.

Q5 security/fail-closed review PASS. Q6 architecture/ownership review PASS.

Q7 attempt 1 on executable SHA `a62aeeb6068edb8d0df123ee3b86a0186e464c3c` found one real contract/boundary mismatch: the initial 10,000-record commercial batch ceiling was unreachable before the shared safe-JSON 100,000-node budget. Boundaries and typecheck passed, but focused tests were 22 passed / 1 failed. Evidence is recorded in `docs/evidence/MASTER-43/Q7_ATTEMPT_1.md`.

The remediation does not bypass the safe parser. `VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS` is now `2_048`, keeping a full canonical bound-regression batch below the shared parser node budget while repeated bounded batches remain supported by the append-only ledger. New frozen executable SHA is `2d3e7933fc4c8ab619771a07dc926ef94fc2cfde`; Q7 must be rerun exactly on that SHA.
