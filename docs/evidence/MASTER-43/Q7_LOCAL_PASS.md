# MASTER-43 Q7 Local Rerun Evidence

Date: 2026-09-05

Frozen executable SHA:

`2d3e7933fc4c8ab619771a07dc926ef94fc2cfde`

Operator-reported local rerun: PASS.

Commands:

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/commercial-metering.test.ts \
  tests/contract/commercial-metering-hardening.test.ts \
  tests/contract/commercial-metering-ledger.test.ts
```

The prior failed Q7 attempt is retained separately in `Q7_ATTEMPT_1.md`; that failure led to the commercial usage ceiling remediation from 10,000 to 2,048 records. The 2,048 bound applies to a parsed usage batch and to one in-process `ViraCommercialUsageLedger` instance; larger durable histories require partitioned/persistent integration outside the bounded core helper.

No test counts are recorded here because the rerun confirmation was provided as a green/pass status without pasted rerun counts.

Verdict: PASS.
