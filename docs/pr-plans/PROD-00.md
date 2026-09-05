# PROD-00 — Program, Owner, Threat and Operations Freeze

**Base:** `main@34eb60b9bcc076aa2be49c9ed9b1b38091135734`  
**Branch:** `prod/00-program-freeze`  
**Type:** program/governance + release-foundation configuration; no production runtime domain implementation

## Objective

Make the Final/V6 production roadmap executable from the latest repository truth. PROD-00 closes program ambiguity, restores trustworthy CI, freezes the production operating assumptions and records the owners/dependencies future phases are allowed to extend.

## Non-goals

- no `apps/*`, `integrations/*` or `ops/*` production service shell yet;
- no PostgreSQL schema/migrations;
- no OIDC runtime;
- no Application V2 contract migration;
- no new production semantic package;
- no Machine Commerce implementation.

## Deliverables

- activate `PROD-00..PROD-22` in `MASTER_PLAN.md` and `ACTIVE_PHASE.md`;
- reconcile draft PR #214 into deferred `PROD-20` and leave no parallel roadmap active;
- current owner matrix + planned owner constraints/dependency permissions;
- reference Application, GitHub/Google use cases and pilot personas;
- OIDC/KMS/Secret Manager/Object Store/observability vendor + region ADRs;
- data classification, retention/deletion and DPA/compliance scope;
- SLO, RPO/RTO, incident severity and support ownership;
- API versioning, migration, rollback and feature-flag policy;
- iOS `ViraNative` scheme/workflow alignment;
- Android generated-source task dependency repair;
- healthy hosted runner evidence;
- `main` PR-only protection + required checks;
- committed `pnpm-lock.yaml` + frozen CI install;
- `verify:plan-coherence`.

## Quality chain

### Q0 — Baseline

Evidence: `docs/evidence/PROD-00/Q0_BASELINE.md`.

### Q1 — Reverse engineering

Evidence: `docs/evidence/PROD-00/Q1_REVERSE_ENGINEERING.md`.

### Q2 — Contract/operations freeze

Required before Q3/Q4 can be treated as stable:

- program/owner ADR;
- vendor/region ADR;
- security/data handling ADR;
- SLO/DR/incident/support ADR;
- release/versioning/migration/rollback/feature flag ADR;
- CI/repository governance contract.

### Q3 — Red proof

Before declaring the fixes complete, capture failing or structurally negative proof for:

- wrong iOS scheme;
- missing Android generated-source producer dependency;
- absent lockfile/frozen install;
- unprotected `main`;
- active legacy roadmap marker.

### Q4 — Implementation

Only the frozen PROD-00 scope.

### Q5 — Security review

Repository governance, supply-chain install determinism, secret handling assumptions, tenant/security owner map and fail-closed boundaries.

### Q6 — Architecture/UX review

Owner/dependency coherence, no second semantic owner, platform/native parity, accessibility/performance budget ownership and future phase dependency graph.

### Q7 — Exact-head verification

Minimum:

```text
pnpm verify:plan-coherence
pnpm check:boundaries
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm build:experience-studio
pnpm verify:browser
hosted ci / verify
hosted ci / ios-native
hosted ci / android-native
branch protection API/ruleset proof
```

All executable/config/test/source checks must refer to one exact PR-head SHA.

### Q8 — Independent re-audit

Re-read owner map, CI definition, native build graph, roadmap state, lockfile/frozen install, branch protection and open PR state from zero. Prior narrative is not evidence.

### Q9 — Closure

- freeze-to-head diff reviewed;
- executable drift absent after Q7, or Q7 repeated;
- required checks green on exact head;
- PR #214 no longer an active roadmap;
- `main` protection actually enabled;
- no vendor/security/SLO decision left open;
- exact-head squash merge only after all above.

## Current blockers

At activation:

- `pnpm-lock.yaml` is absent;
- `main` protection is disabled;
- vendor/region/security/SLO ADRs are not yet frozen;
- native CI fixes require hosted proof before closure.

These blockers are phase work, not reasons to weaken the exit gate.
