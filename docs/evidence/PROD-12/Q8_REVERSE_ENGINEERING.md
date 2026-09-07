# PROD-12 — Q8 Reverse Engineering / Technical Closure

## Exact tested parent

- Branch: `prod/12-durable-execution-fencing-outbox-private-runner`
- Exact tested HEAD: `eeb563610f024df3b2fc89bd15b6f8c602a57195`
- Parent: PROD-11 exact head `9f4c3ba781f3462b8ef4b0ad881214f3e13b31d0`
- PR: #230
- Merge state at closure: draft, open, unmerged, not merge-authorized

This document is intentionally committed on the PROD-13 child branch. The PROD-12 branch is left byte-for-byte at the exact tested SHA so evidence is not invalidated by a documentation-only commit.

## Closure command

GitHub Actions was unavailable because repository billing capacity was exhausted. Closure therefore used the repository-owned exact-head local verifier:

```bash
pnpm verify:prod12:local -- --full
```

The operator confirmed the full gate green on the exact SHA above.

The verifier itself requires and revalidates:

1. exact PROD-12 branch;
2. 40-character exact HEAD;
3. clean working tree before execution;
4. focused durable restart/recovery tests;
5. worker fencing/composition tests;
6. transactional outbox tests;
7. Private Runner tests;
8. PostgreSQL durable-execution contract tests;
9. full root `pnpm verify`;
10. live production PostgreSQL gate;
11. browser E2E;
12. iOS Simulator;
13. Android Emulator;
14. final same HEAD / branch / clean-tree state.

Closure semantics are:

```json
{
  "headSha": "eeb563610f024df3b2fc89bd15b6f8c602a57195",
  "passed": true,
  "closureEligible": true,
  "gitStateStable": true
}
```

## Closed invariants

- tenant-scoped durable execution queue;
- `FOR UPDATE SKIP LOCKED` claim;
- monotonic revision CAS and worker/lease-epoch fencing;
- atomic grant nonce, idempotency and exact-effect reservation;
- same-epoch duplicate permit rejection;
- recovery-only higher-epoch exact reservation rebind;
- crash before dispatch → recoverable;
- crash after dispatch → `uncertain`, never blind retry;
- restart-safe frozen TransactionPlan + signed grant authority snapshot;
- transactional outbox and per-consumer idempotent receipts;
- bounded worker batch composition;
- lease renewal before Stage B;
- credential resolution isolated inside Private Runner;
- credential exfiltration rejected;
- durable dispatch fence before adapter invocation;
- adapter acceptance means only `verifying`, never external success.

## Reverse-engineering findings carried into PROD-13

PROD-12 deliberately does **not** own external truth. It ends after durable dispatch/outcome classification and hands accepted dispatch to `verifying`.

PROD-13 therefore owns the next trust boundary:

```text
verifying execution
  → independent provider reread
  → exact precondition / TOCTOU decision
  → protected provider write
  → independent post-effect reread
  → verified | partial | mismatch | uncertain
  → durable append-only Action Ledger
```

No PROD-13 implementation may weaken the PROD-12 rules above to make provider integration easier.

## Technical closure

**PROD-12 TECHNICALLY CLOSED** on `eeb563610f024df3b2fc89bd15b6f8c602a57195`.

PR #230 remains unmerged until explicit merge authorization.