# MASTER-43 Q7 Local Attempt 1

**Date:** 2026-09-05  
**Evidence source:** operator-reported local execution  
**Attempted frozen executable SHA:** `a62aeeb6068edb8d0df123ee3b86a0186e464c3c`  
**Verdict:** FAIL — executable remediation required

## Commands

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/commercial-metering.test.ts \
  tests/contract/commercial-metering-hardening.test.ts \
  tests/contract/commercial-metering-ledger.test.ts
```

## Reported result

- package boundary check: PASS;
- TypeScript typecheck: PASS;
- focused test files: 2 passed / 1 failed;
- focused tests: 22 passed / 1 failed;
- failing test: `Vira Commercial Metering v1 hardening > enforces meter and usage batch bounds`;
- expected domain error: `USAGE_LIMIT_EXCEEDED`;
- received generic safe-parser error: `INVALID_INPUT`.

## Root cause

The initial commercial usage batch ceiling was `10_000` records. A full canonical usage record contains enough nested JSON nodes that a `10_001`-record payload exceeds the shared protocol safe-JSON budget (`JSON_VALUE_MAX_NODES = 100_000`) before `parseViraCommercialUsageBatch()` can reach its domain-specific usage-count check.

This made the `10_000` commercial batch ceiling effectively unreachable under the canonical safe parser and made the domain-specific bound error non-deterministic.

## Remediation

Do not add a parser bypass or an alternate unsafe pre-parser.

The single-batch commercial usage ceiling is reduced to `2_048` records so the canonical full usage shape remains comfortably below the shared JSON node budget for the domain-bound regression case. The append-only usage ledger continues to support repeated bounded batches, so this does not convert the ledger into a 2,048-record lifetime limit.

Remediation executable commit:

```text
2d3e7933fc4c8ab619771a07dc926ef94fc2cfde
```

Because executable code changed after the failed run, `a62aeeb6068edb8d0df123ee3b86a0186e464c3c` is no longer a valid Q7 freeze. Q7 must be rerun from the new frozen executable SHA after docs-only closure is confirmed.
