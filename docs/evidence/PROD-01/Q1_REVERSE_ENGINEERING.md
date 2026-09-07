# PROD-01 Q1 — Reverse Engineering

## Ownership

`packages/*` remains the executable semantic graph and `tooling/package-boundaries.config.mjs` remains its dependency authority. PROD-01 does not create a semantic package. `apps/*` are thin composition/entrypoint surfaces; `ops/*` owns deployment mechanics only; `integrations/*` is reserved for later adapter phases.

## Build graph

The parent workspace only includes `packages/*` and `examples/*`. Root `tsconfig.json` and `tsconfig.build.json` likewise omit production roots. Therefore simply adding app directories would create unverified code. PROD-01 must expand workspace/typecheck/build coverage and add a dedicated structural gate.

## Deployment state

No Vercel/Railway production definition exists at the parent. PROD-00 ADR fixes Vercel Frankfurt (`fra1`) and Railway Amsterdam (`europe-west4-drams3a`).

Railway's current project-level authoring surface is `.railway/railway.ts` through Infrastructure as Code. Legacy `railway.json`/`railway.toml` Config-as-Code is deprecated and cannot be selected for new services, so PROD-01 uses the IaC DSL and keeps one project file.

## Runtime contract

Railway injects `PORT` and deployment/Git metadata. The server must bind `0.0.0.0:$PORT`. Deployment healthchecks only gate activation, so `/readyz` is a readiness/deploy gate rather than a claim of continuous monitoring.
