# CLEAN-00 Branch Cleanup Inventory

**Snapshot date:** 2026-09-04  
**Observed branch count:** 219

## Keep now

- `main`
- `clean/00-repository-reconciliation` while CLEAN-00 is active
- a future exact-head external-proof/release branch only when MASTER-25R actually starts

## Historical families requiring audit before deletion

The repository currently contains branches in these broad families:

- `master/01-*` through `master/25-*`, including clean/temp/implementation variants,
- `phase-0/*` through `phase-14/*`,
- `studio/*` including Canvas v2 and implementation/rebuild variants,
- historical `feat/*`, `fix/*`, `hotfix/*`, `integration/*`, `demo/*`, `genui/*`,
- merge/stabilization branches,
- explicit `noop-*` / placeholder branches.

These are **delete candidates, not approved deletions** in CLEAN-00.

## Mandatory deletion audit

For every candidate:

```text
branch
  ↓
PR association
  ↓
merged / closed / superseded status
  ↓
same functionality present on authoritative main
  ↓
unique-delta inspection
  ↓
historical/provenance value
  ↓
KEEP or DELETE
```

Because the repository has squash/consolidation merges, `git merge-base` or a simple “not ancestor” result is not sufficient proof that a branch contains valuable unmerged work, nor sufficient proof that deletion is safe.

## CLEAN-00 decision

No bulk destructive branch deletion is performed by this documentation reconciliation PR. The repository now has an explicit audit inventory and criterion; branch deletion can be executed separately only after branch-specific proof. This prevents losing unique historical deltas while still defining the intended steady state: `main` + current phase branch + temporary proof branch when required.
