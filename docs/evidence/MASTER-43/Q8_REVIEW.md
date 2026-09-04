# MASTER-43 Q8 Independent PR Reverse Engineering

**Date:** 2026-09-05  
**PR:** #204 — MASTER-43: add Commercial Usage Metering + Rating  
**Base SHA:** `e7598b99bd44b138911113a66179001946186f56`  
**Frozen executable SHA:** `2d3e7933fc4c8ab619771a07dc926ef94fc2cfde`

## Review scope

Fresh review covered the full PR changed-file set, executable package ownership/dependencies, meter/usage/rating contracts, append-only ledger semantics, focused/hardening tests, frozen-executable closure compare, PR review threads and hosted workflow signal.

## Executable findings

PASS.

- `commercial-metering` depends only on `application-package`, `commercial-entitlement`, `enterprise-context` and `protocol`.
- Application exact-release parsing remains owned by `application-package`; MASTER-43 consumes it rather than defining a second Application parser.
- Commercial eligibility remains owned by `commercial-entitlement`; `rateViraCommercialUsage()` calls the canonical entitlement evaluator instead of recreating entitlement matching.
- Exact Application/entitlement/meter/Capability references are required; floating aliases/ranges fail closed.
- Usage records are explicit commercial inputs. Telemetry, Experience observations and Action receipts are not automatically billable usage.
- `sourceId` is provenance only; no authentication/integrity authority is inferred.
- Cross-Application/entitlement/meter/principal/scope/Capability/location contamination fails with `USAGE_SCOPE_MISMATCH` rather than being silently filtered.
- Only same-context records outside the selected deterministic UTC window or after `asOf` are excluded from aggregation.
- Quantity inputs are positive safe integers and aggregate overflow fails closed.
- Rating returns only non-monetary usage evidence (`used`, `limit`, `remaining`, `excess`, status). It contains no authorization, governance, runtime permission, price, currency, charge, invoice, payment or payout semantics.
- `ViraCommercialUsageLedger` is append-only and idempotent by `usageId`; malformed/duplicate appends do not mutate existing state.
- The remediated commercial usage ceiling is `2_048` records per parsed batch and per in-process ledger instance, keeping the bounded core helper below the shared safe-JSON node budget.

## Q8 documentation correction

One non-executable mismatch was found during reverse engineering: earlier documentation stated that repeated bounded batches could grow one append-only ledger beyond 2,048 records. The executable ledger uses the same 2,048 ceiling, so that statement was incorrect.

The documentation/evidence was corrected to state the actual contract: one in-process ledger instance is bounded to 2,048 records; larger durable accounting histories require partitioning/persistence outside the bounded core helper. No executable change was required, so Q7 does not need another rerun.

## Verification evidence

Q7 rerun on exact frozen executable SHA `2d3e7933fc4c8ab619771a07dc926ef94fc2cfde` is operator-reported PASS and recorded in `Q7_LOCAL_PASS.md`.

Frozen executable → PR closure compare contains documentation/evidence changes only; no executable file changed after the frozen SHA.

Hosted PR-head CI remains infrastructure non-signal: `verify`, `ios-native` and `android-native` completed with no executable steps and no assigned runner (`steps=[]`, `runner_id=0`). This neither substitutes for nor invalidates Q7 local evidence.

PR #204 currently has no inline review threads and no submitted reviews.

## Verdict

**PASS after docs-only correction.**

No executable blocker remains. Q9 may proceed after final docs-only closure compare and exact PR-head verification.
