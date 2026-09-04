# Vira Enterprise GenUI — Engineering Execution Plan

**Authority date:** 2026-09-04  
**Repository:** `hrpering/vira-enterprise-genui`  
**Authoritative main entering MASTER-27:** `1980368befeafa3c7b0de5c38bcfb2429ffb6f5e`

This file is the engineering execution authority. Long-range company/product strategy lives in `docs/strategy/APPLICATION_NETWORK_THESIS.md`. Repository truth always overrides an older plan snapshot.

## Current status

| Program | Phase | Status |
|---|---|---|
| Foundation | MASTER-01..24 | IMPLEMENTED / IN `main` |
| Enterprise GenUI release | MASTER-25 + MASTER-25R | MERGED / RC1 CLOSED |
| Reconciliation | CLEAN-00 | MERGED / PR #184 |
| Application Network — Semantic freeze | MASTER-26 | MERGED / PR #186 |
| Application Network — Application Package | MASTER-27 | ACTIVE |
| Application Network — Capability / Context / Graph | MASTER-28..30 | PLANNED |
| Application Network — Canvas | MASTER-31..36 | PLANNED |
| Application Network — Distribution | MASTER-37..41 | PLANNED |
| Application Network — Commercial / Capability Cloud | MASTER-42..47 | PLANNED |
| Application Network — External Proofs / Network RC | MASTER-48..51 | PLANNED |

Enterprise GenUI RC1 is closed. MASTER-26 froze Application semantics. MASTER-27 now implements only the canonical higher-order Application release/reference package.

## Active execution order

```text
Enterprise GenUI RC1 ✅
  ↓
MASTER-26 — Application semantic freeze ✅
  ↓
MASTER-27 — Vira Application Package
  ↓
MASTER-28 — Capability Contract
  ↓
MASTER-29 — WorkContext
  ↓
MASTER-30 — Application Graph
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
- Application is a higher-order semantic composition; it is not a competing runtime, workflow engine or provider framework.
- Canvas is an authoring/proposal surface; it is never runtime or execution authority.
- Network is discovery/distribution authority; it is never execution authority.
- Providers and protocol adapters are never Vira canonical semantic authority.
- Exact identity/version resolution is explicit. No implicit-latest execution and no silent fallback.
- Untrusted or malformed input fails closed.
- Commercial entitlement is distinct from authorization/governance/runtime permission.
- Core does not become a generic agent framework, workflow engine, policy language, MCP/A2UI replacement, IDE, design-tool clone, cloud-compute platform or foundation model.
- PR creation is not phase completion. Merge requires contract/semantic review, security/architecture review, verification, independent reverse engineering and exact-head evidence appropriate to the diff.

## Active phase records

See:

- `docs/pr-plans/MASTER-27.md`
- `docs/pr-plans/ACTIVE_PHASE.md`
- `docs/evidence/MASTER-27/RE_REPORT.md`
- `APPLICATION_MODEL.md`
- `APPLICATION_AUTHORITY.md`
- `APPLICATION_LIFECYCLE.md`
- `APPLICATION_VERSION_MODEL.md`
- `PACKAGE_OWNERSHIP.md`
- `docs/strategy/APPLICATION_NETWORK_THESIS.md`
