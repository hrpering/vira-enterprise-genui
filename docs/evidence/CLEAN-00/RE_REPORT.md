# CLEAN-00 Reverse-Engineering Report

## Baseline

- Repository: `hrpering/vira-enterprise-genui`
- Authoritative `main`: `bd7f03c0dae3e2b31e35bfb065b07546d8e4ed65`
- Baseline root tree: `bcfb0f32d76ddb29dfe46f8d9294b3a6a1371105`
- Open pull requests at phase start: **0**
- Observed branches: **219**

## Findings

1. `MASTER_PLAN.md` and `PACKAGE_OWNERSHIP.md` carried historical/planned language that no longer represented the integrated MASTER-01..25 repository state.
2. `docs/pr-plans/` mixed current release work with completed MASTER-01..24 plans, PR-001..072/074 plans and older REG/POL/MKT/XP/DSC/EOBS/STABILIZATION records, making historical work look active.
3. `README.md` documented `pnpm demo:flight-search` and `pnpm demo:pegasus-chat`, but exact baseline `package.json` exposes neither command. The only root demo script is `demo:experience-studio`.
4. `tooling/package-boundaries.config.mjs` remains the executable package/dependency authority; documentation must follow it rather than become a competing source of truth.
5. The branch namespace contains historical MASTER, phase-0..14, Studio v2, feature/fix/integration/hotfix/merge/noop branches. Squash/consolidation history means deletion requires PR association + supersession + unique-delta review; branch age/merge-base alone is insufficient.
6. Latest `main` integrates MASTER-08..25 while explicitly deferring external Pegasus proof, so RC1 cannot be represented as closed.
7. Independent normative-doc review found stale pre-integration status language in `ARCHITECTURE.md`, `TRUST_MODEL.md`, `ACTION_BOUNDARY.md` and `PLATFORM_MODEL.md` (for example MASTER-08 described as future, iOS/Android described as not implemented, MASTER-23 described as scheduled). These are KEEP/normative documents, so CLEAN-00 must update status wording while preserving their security/architecture invariants.
8. Current repository evidence confirms `packages/action-boundary` exports the implemented Action Boundary contract family, `packages/governance` exports provider-neutral governance/identity/approval composition and adapters, and native SDK trees exist under `sdk/ios` and `sdk/android`.

## Scope decision

CLEAN-00 is documentation/tree reconciliation and evidence only. No package source, runtime behavior, governance/action implementation, executable tooling or package-boundary configuration is modified.

## Correction log

During reconnaissance an initial working hypothesis suggested a flight demo root script might have been restored. Exact baseline `package.json` disproved it. Authoritative conclusion: `demo:flight-search` and `demo:pegasus-chat` are dead README commands; `demo:experience-studio` remains valid.

## CI baseline observation

PR #184 hosted jobs fail before executing steps (`steps: []`, `runner_id: 0`). The authoritative baseline `main` run at `bd7f03c0...` exhibits the same zero-step runner failure. This is evidence of a hosted runner baseline problem, not evidence that CLEAN-00 tests passed. Q7 remains pending until repository verification is actually executed successfully against the exact PR head.

## Authority map after reconciliation

- Current engineering execution: `MASTER_PLAN.md`
- Normative architecture/trust/platform/action: root architecture documents
- Product/company thesis: `docs/strategy/APPLICATION_NETWORK_THESIS.md`
- Executable dependency graph: `tooling/package-boundaries.config.mjs`
- Descriptive owner map: `PACKAGE_OWNERSHIP.md`
- Active/current release plans: `docs/pr-plans/`
- Historical plan provenance: `docs/archive/historical-pr-plans/`
