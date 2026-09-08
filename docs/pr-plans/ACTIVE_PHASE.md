# Active Phase

**Phase:** PROD-21 — Multi-party settlement and reconciliation
**Status:** LOCAL ROOT VERIFIED / HOSTED EXACT-HEAD CI PENDING
**Branch:** `prod/21-multi-party-settlement-reconciliation`
**Parent:** `main@6a259750c4d77053d52f735573c3e1ee2bbabdb9`
**Roadmap:** `docs/production/VIRA_UNIFIED_ARCHITECTURE_PRODUCTION_PLAN_FINAL.md`

## Current checkpoint

- deterministic five-party integer-nanos/basis-points allocation: implemented;
- signed payment/refund/payout evidence ingestion: implemented;
- duplicate, out-of-order, overflow and currency negatives: implemented;
- allocation evidence and reconciliation records remain separate: implemented;
- focused and root verification: passed (327 files, 1,821 tests; 2 skipped);
- hosted exact-head CI and independent re-audit: pending.

No production release status is implied. Live Vercel/Railway and UAT gates remain tracked in `docs/production/LIVE_GATE_BLOCKERS.md`.
