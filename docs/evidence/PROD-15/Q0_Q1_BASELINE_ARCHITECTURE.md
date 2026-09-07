# PROD-15 Q0/Q1 — Baseline and target architecture

## Baseline

`apps/vira-web` was a dependency-free HTML/CSS/JavaScript build-metadata shell. The secure browser BFF already existed at `apps/vira-web/api/bff.ts`; semantic owners for Applications, runtime, transactions, artifacts, provider connections and commercial exports already existed below `packages/` and `integrations/`.

## Target

The web app is a presentation and interaction adapter only. React renders role-aware surfaces; Radix supplies accessible dialog and tabs primitives; Vite owns production bundling. `src/api.ts` forwards only bounded `/v1/*` target paths and exact organization/project/environment scope to the same-origin BFF. No `@vira-enterprise-genui/*` semantic owner is imported into the app.

The signature interaction is an evidence rail connecting intent, verified reads, immutable transaction planning, approval and execution wait states.
