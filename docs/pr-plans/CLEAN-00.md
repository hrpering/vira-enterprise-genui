# CLEAN-00 — Repository Reconciliation, Documentation Reset & Historical Cleanup

## Responsibility

Reconcile repository documentation and historical state before Application Network work begins. This is not a feature phase and owns no runtime semantics.

**Base:** `bd7f03c0dae3e2b31e35bfb065b07546d8e4ed65`

## Owns

- root execution-plan reset,
- root consumer README correction,
- package-ownership documentation reset against executable boundaries,
- separation of long-range product thesis from engineering status,
- active-vs-historical PR-plan organization,
- branch cleanup inventory and policy,
- exact evidence of reconciliation and verification.

## Does not own

- runtime behavior,
- Experience/Studio semantics,
- action/governance behavior,
- package-boundary rules,
- external Pegasus proof,
- MASTER-26+ semantics.

## Invariants

- `tooling/package-boundaries.config.mjs` remains executable dependency authority.
- `MASTER-25.md` remains active until exact-head RC evidence is closed.
- Historical records are archived, not rewritten into current authority.
- No historical branch is deleted merely because Git ancestry looks stale after squash merges.
- No feature/package/runtime code changes are permitted in this phase.
- README documents only root commands actually exposed by current `package.json`.

## Acceptance

- [x] authoritative baseline recorded
- [x] open PR baseline checked: 0 at phase start
- [x] stale current-state root docs identified
- [x] historical active-plan contamination inventoried
- [x] branch inventory produced
- [ ] current-state docs committed to CLEAN-00 branch
- [ ] active plan directory contains only current/release work
- [ ] historical plans archived
- [ ] diff proves no semantic/runtime behavior change
- [ ] repository verification PASS
- [ ] independent docs/architecture reverse-engineering PASS
- [ ] PR READY-TO-MERGE

Final verification and head SHAs are recorded under `docs/evidence/CLEAN-00/`.
