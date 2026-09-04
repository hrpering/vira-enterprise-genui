# Vira Enterprise GenUI — Engineering Execution Plan

**Authority date:** 2026-09-04  
**Repository:** `hrpering/vira-enterprise-genui`  
**Authoritative main entering MASTER-25R:** `9d451b809e14538edcf2c0ed2d913de8fc724377`

This file is the engineering execution authority. Long-range company/product strategy lives in `docs/strategy/APPLICATION_NETWORK_THESIS.md`. Repository truth always overrides an older plan snapshot.

## Current status

| Program | Phase | Status |
|---|---|---|
| Foundation | MASTER-01..24 | IMPLEMENTED / IN `main` |
| Release | MASTER-25 | IMPLEMENTED / RC EVIDENCE PENDING |
| Reconciliation | CLEAN-00 | MERGED / PR #184 |
| Release closure | MASTER-25R | ACTIVE — EXACT-HEAD EXTERNAL EVIDENCE REQUIRED |
| Application Network — Semantics | MASTER-26..30 | PLANNED |
| Application Network — Canvas | MASTER-31..36 | PLANNED |
| Application Network — Distribution | MASTER-37..41 | PLANNED |
| Application Network — Commercial / Capability Cloud | MASTER-42..47 | PLANNED |
| Application Network — External Proofs / Network RC | MASTER-48..51 | PLANNED |

RC1 is **not declared** until MASTER-25R binds external proof and the enterprise RC gate to the exact post-CLEAN-00 release tree and the phase completes Q0–Q9.

## Active execution order

```text
MASTER-25R — exact-head external proof + enterprise RC closure
  ↓
Enterprise GenUI RC1
  ↓
MASTER-26 → 30 — application semantics foundation
  ↓
MASTER-31 → 36 — Vira Canvas
  ↓
MASTER-37 → 41 — protocol + distribution
  ↓
MASTER-42 → 47 — commercial network + capability cloud
  ↓
MASTER-48 → 51 — external proofs + Vira Application Network RC
```

## Constitutional invariants

- Every phase starts from the latest authoritative `main`, never from a pre-stacked future branch.
- One semantic concept has one canonical owner. Extend the nearest owner before creating a package.
- Existing Experience, Experience Pack, Studio publication, Action Boundary, governance and runtime authorities are referenced, not duplicated.
- Canvas is an authoring/proposal surface; it is never runtime or execution authority.
- Network is discovery/distribution authority; it is never execution authority.
- Providers and protocol adapters are never Vira canonical semantic authority.
- Exact identity/version resolution is explicit. No implicit-latest execution and no silent fallback.
- Untrusted or malformed input fails closed.
- Core does not become a generic agent framework, workflow engine, policy language, MCP/A2UI replacement, IDE, design-tool clone, cloud-compute platform or foundation model.
- PR creation is not phase completion. Merge requires contract, negative tests where applicable, security/architecture review, repository verification, independent reverse engineering and exact-head evidence.

## Active phase records

Current phase plans live only under `docs/pr-plans/`. Completed implementation plans are historical provenance under `docs/archive/` or dedicated evidence directories.

See:

- `docs/pr-plans/MASTER-25R.md`
- `docs/pr-plans/MASTER-25.md`
- `PACKAGE_OWNERSHIP.md`
- `docs/strategy/APPLICATION_NETWORK_THESIS.md`
