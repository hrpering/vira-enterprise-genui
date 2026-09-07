# Active Phase

**Phase:** PROD-01 — Production workspace and deployable shell  
**Status:** PROVISIONAL STACK; Q0–Q6 SOURCE REVIEW COMPLETE; Q7 SOURCE CI PASS; EXTERNAL SMOKES OPEN  
**Stacked parent:** `PROD-00@91e8fad8b54fd78c99359d968f75ebec4bcc3562`  
**Branch:** `prod/01-production-shell`  
**Roadmap:** `docs/production/VIRA_UNIFIED_ARCHITECTURE_PRODUCTION_PLAN_FINAL.md`

## Stack rule

The user elected to perform the repository-administration `main` protection step at the end. This branch may therefore advance as provisional stacked work, but it may not merge or become production-authoritative until PROD-00 Q9 is closed and live repository protection is proven.

## Goal

Create independently deployable Web/API/worker production shells with deterministic dependencies, health/readiness/build metadata, typed startup environment validation and exact platform deployment identity, while mounting no domain behavior.

## Invariants

- canonical semantics stay in their existing package owners;
- `apps/*` are composition/entrypoint surfaces, not semantic owners;
- `integrations/*` is reserved only; no adapter is implemented in PROD-01;
- server shells expose only `/healthz`, `/readyz`, `/build`;
- production/startup configuration fails closed;
- Vercel preview/custom staging normalizes to Vira `staging`, and exact `VERCEL_DEPLOYMENT_ID` is the Web release identity;
- Railway dev/staging/prod mapping is explicit; staging may use a frozen candidate branch and production is `main`-only;
- Vercel and Railway locations follow PROD-00 vendor/region ADR;
- old Railway `railway.json`/`railway.toml` Config-as-Code is forbidden;
- final branch contains no lockfile-bootstrap writer workflow.

## Source verification

Executable/source candidate `3864f457f7a43a061cf911ecd5500e302314cbcb` passed hosted CI run `33983524414` / #1724 with all three jobs green: `verify`, `ios-native`, and `android-native`. The final evidence-only rewrite must pass the same regression gates before being treated as the current exact head.

## Open Q7/Q9 evidence

- dedicated Vercel `vira-enterprise-genui` preview smoke and exact deployment-ID correlation;
- Railway staging smoke from the frozen candidate branch;
- independent API/worker restart and rollback against exact Railway deployment UUIDs;
- live `main` branch protection remains deferred by explicit user choice and blocks merge/production authority.
