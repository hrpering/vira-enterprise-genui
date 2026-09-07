# PROD-01 — Production Workspace and Deployable Shell

**Stacked parent:** `PROD-00@91e8fad8b54fd78c99359d968f75ebec4bcc3562`  
**Branch:** `prod/01-production-shell`  
**Status:** provisional stacked work; merge is forbidden until PROD-00 Q9 and live `main` protection close.

## Objective

Create the first production composition roots without introducing domain behavior or a second semantic owner. Web, API and worker must be independently buildable, deployable, health-checkable and identifiable by immutable build/release metadata.

## Frozen scope

- `apps/vira-web`, `apps/vira-api`, `apps/vira-worker`;
- `integrations/*`, `ops/docker`, `ops/deploy`, `ops/runbooks` roots;
- workspace/typecheck/build/lint coverage;
- Vercel web definition in Frankfurt (`fra1`) with Vercel preview/custom-staging normalized to Vira `staging` and exact deployment ID metadata;
- Railway API/worker IaC in Amsterdam (`europe-west4-drams3a`) with explicit dev/staging/prod mapping, candidate-branch staging support and production `main`-only source;
- `/healthz`, `/readyz`, `/build` only for server shells;
- typed startup environment validation;
- exact release manifest using Vercel deployment ID plus independent Railway API/worker deployment UUIDs and supporting deployment URL evidence;
- deterministic root and Railway IaC lockfiles.

## Non-goals

No auth, database, tenant runtime, Application execution, Capability execution, provider connection, billing, product API, background job semantics or BFF behavior is authorized here.

## Quality chain

### Q0 — Baseline
Evidence: `docs/evidence/PROD-01/Q0_BASELINE.md`.

### Q1 — Reverse engineering
Evidence: `docs/evidence/PROD-01/Q1_REVERSE_ENGINEERING.md`.

### Q2 — Contract freeze
Evidence: `docs/evidence/PROD-01/Q2_FREEZE.md`.

### Q3 — Red proof
Evidence: `docs/evidence/PROD-01/Q3_RED_PROOF.md`.

### Q4 — Implementation
Evidence: `docs/evidence/PROD-01/Q4_IMPLEMENTATION.md`.

### Q5/Q6 — Security + architecture review
Evidence: `docs/evidence/PROD-01/Q5_Q6_REVIEW.md`.

### Q7 — Exact-head verification
Required on one exact final head:

```text
pnpm install --frozen-lockfile
npm ci --prefix .railway
pnpm verify:production-shell
pnpm verify:all
hosted ci / verify
hosted ci / ios-native
hosted ci / android-native
```

External environment evidence remains distinct: Vercel preview smoke and Railway staging/restart/rollback smoke cannot be fabricated by source-only tests.

### Q8 — Independent re-audit
Re-read the full diff, workspace, lockfiles, deploy definitions, environment parser, shell routes, release promotion contract and parent PROD-00 state from zero.

### Q9 — Closure
- PROD-00 Q9 closed first;
- exact-head checks green;
- Vercel preview smoke recorded and correlated to exact Vercel deployment ID;
- Railway staging smoke recorded from the frozen candidate source;
- API and worker independent restart and rollback recorded against exact Railway deployment UUIDs;
- no domain behavior in shell apps;
- bootstrap workflow absent;
- exact-head merge only after the stack is rebased/ordered safely.
