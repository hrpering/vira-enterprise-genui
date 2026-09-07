# Active Phase

**Phase:** PROD-14 — Verified commercial usage, pricing and invoice export
**Status:** PROVISIONAL CODE-COMPLETE CANDIDATE / LIVE RELEASE GATES OPEN
**Branch:** `prod/14-verified-commercial-usage-pricing-invoice-export`
**Pull request:** #232
**Parent:** `prod/13-real-provider-write-postcondition-action-ledger`
**Roadmap:** `docs/production/VIRA_UNIFIED_ARCHITECTURE_PRODUCTION_PLAN_FINAL.md`

## Current checkpoint

- trusted verified-Action usage normalization: implemented;
- duplicate-safe append-only usage persistence: implemented;
- deterministic usage history, rating/pricing and budget/quota preflight: implemented;
- invoice-grade deterministic export and immutable PostgreSQL revisions: implemented;
- local full root verification: passed on source candidate `053c35e`;
- hosted exact-head CI: required on the evidence commit;
- live production gates: deferred in `docs/production/LIVE_GATE_BLOCKERS.md`.

After hosted CI and PR integration, the next active phase is PROD-15 from updated `main`. No RC label is authorized while live blockers remain.
