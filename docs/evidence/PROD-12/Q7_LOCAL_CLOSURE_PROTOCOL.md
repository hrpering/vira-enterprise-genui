# PROD-12 Q7 — Exact-Head Local Closure Protocol

Status: ACTIVE / EVIDENCE PROTOCOL / NOT TECHNICALLY CLOSED

GitHub Actions is not an authoritative PROD-12 closure source while repository Actions execution is unavailable due to billing capacity. This does **not** weaken the production gates. PROD-12 closure moves to an exact-head local protocol on the same branch and requires the same repository, database, browser and native regressions.

## Authoritative branch

`prod/12-durable-execution-fencing-outbox-private-runner`

Parent authority remains PROD-11 final exact head:

`9f4c3ba781f3462b8ef4b0ad881214f3e13b31d0`

## Verification commands

Development/focused verification:

```bash
pnpm verify:prod12:local
```

This is useful during implementation but **must not** be interpreted as technical closure unless the emitted JSON says `closureEligible: true`.

Final closure candidate verification:

```bash
pnpm verify:prod12:local -- --full
```

`--full` expands the local gate to include:

- focused durable restart/recovery tests,
- worker fencing/composition tests,
- transactional outbox tests,
- Private Runner tests,
- PostgreSQL durable execution tests,
- full root `pnpm verify`,
- production PostgreSQL live verification,
- browser E2E,
- iOS Simulator regression,
- Android Emulator regression.

## Exact-head requirements

The verifier fails before running tests unless all are true:

1. current Git branch is exactly `prod/12-durable-execution-fencing-outbox-private-runner`,
2. `git rev-parse HEAD` is a 40-character SHA,
3. working tree is clean.

The final JSON evidence records:

- `headSha`,
- branch,
- clean-working-tree evidence,
- requested platform flags,
- every gate exit status and duration,
- `passed`,
- `closureEligible`.

## Closure rule

PROD-12 may be marked technically closed only when a committed exact HEAD produces:

```json
{
  "passed": true,
  "closureEligible": true
}
```

and the evidence corresponds to the same SHA recorded in the final Q8 reverse-engineering/closure document.

A focused-only pass, stale output from another SHA, dirty-tree output, GitHub Actions history from an older candidate, or a run missing one of live DB/browser/iOS/Android is **not** closure evidence.

## Scope preservation

This protocol validates PROD-12 only. It does not authorize:

- real GitHub/Google protected write activation,
- PROD-13 TOCTOU/postcondition truth semantics,
- durable Action Ledger/hash-chain expansion,
- merge of PR #230.

**DRAFT / NOT MERGE AUTHORIZED.**
