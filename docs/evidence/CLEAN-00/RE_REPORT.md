# CLEAN-00 Reverse-Engineering Report

## Baseline

- Repository: `hrpering/vira-enterprise-genui`
- Authoritative `main`: `bd7f03c0dae3e2b31e35bfb065b07546d8e4ed65`
- Baseline root tree: `bcfb0f32d76ddb29dfe46f8d9294b3a6a1371105`
- Open pull requests at phase start: **0**
- Observed branches: **219**

## Findings

1. `MASTER_PLAN.md` and `PACKAGE_OWNERSHIP.md` still carried historical/planned language that no longer represented the integrated MASTER-01..25 repository state.
2. `docs/pr-plans/` mixed current release work with completed MASTER-01..24 plans, PR-001..072/074 plans and older REG/POL/MKT/XP/DSC/EOBS/STABILIZATION records. This made historical work look active.
3. `README.md` documented `pnpm demo:flight-search` and `pnpm demo:pegasus-chat`, but the exact baseline root `package.json` exposes neither command. The only root demo script is `demo:experience-studio`.
4. `tooling/package-boundaries.config.mjs` remains the executable package/dependency authority. Documentation must describe it rather than become a competing source of truth.
5. The branch namespace contains historical MASTER, phase-0..14, Studio v2, feature, fix, integration, hotfix, merge and noop branches. Squash/integration history means branch deletion requires PR association + supersession + unique-delta review; branch-name age or merge-base alone is insufficient.
6. The latest `main` commit explicitly integrates MASTER-08..25 while deferring external Pegasus proof. Therefore RC1 cannot be represented as closed in repository status.

## Scope decision

CLEAN-00 is limited to documentation/tree organization and evidence. No package source, runtime behavior, governance/action semantics, tooling implementation or executable package-boundary configuration is modified.

## Correction log

During reconnaissance an initial working hypothesis suggested a flight demo root script might have been restored. Exact baseline `package.json` disproved that hypothesis. The authoritative conclusion is: `demo:flight-search` and `demo:pegasus-chat` are dead README commands and must be removed; `demo:experience-studio` remains valid.

## Authority map after reconciliation

- Current engineering execution: `MASTER_PLAN.md`
- Product/company thesis: `docs/strategy/APPLICATION_NETWORK_THESIS.md`
- Executable dependency graph: `tooling/package-boundaries.config.mjs`
- Descriptive owner map: `PACKAGE_OWNERSHIP.md`
- Active/current release plans: `docs/pr-plans/`
- Historical plan provenance: `docs/archive/historical-pr-plans/`
