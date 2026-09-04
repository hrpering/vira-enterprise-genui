# Vira Enterprise GenUI — Engineering Execution Plan

**Authority date:** 2026-09-04  
**Repository:** `hrpering/vira-enterprise-genui`  
**Authoritative main entering MASTER-29:** `7c6716f90810528b4dfc4f2f040755ab5f96ecb1`

This file is the engineering execution authority. Long-range product strategy lives in `docs/strategy/APPLICATION_NETWORK_THESIS.md`. Repository truth overrides older plan snapshots.

## Current status

| Program | Phase | Status |
|---|---|---|
| Foundation | MASTER-01..24 | IMPLEMENTED / IN `main` |
| Enterprise GenUI release | MASTER-25 + MASTER-25R | MERGED / RC1 CLOSED |
| Reconciliation | CLEAN-00 | MERGED / PR #184 |
| Application Network — Semantic freeze | MASTER-26 | MERGED / PR #186 |
| Application Network — Application Package | MASTER-27 | MERGED / PR #187 |
| Application Network — Capability Contract | MASTER-28 | MERGED / PR #188 |
| Application Network — WorkContext | MASTER-29 | ACTIVE |
| Application Network — Application Graph | MASTER-30 | PLANNED |
| Application Network — Canvas | MASTER-31..36 | PLANNED |
| Application Network — Distribution | MASTER-37..41 | PLANNED |
| Application Network — Commercial / Capability Cloud | MASTER-42..47 | PLANNED |
| Application Network — External Proofs / Network RC | MASTER-48..51 | PLANNED |

## Active execution order

```text
Enterprise GenUI RC1 ✅
  ↓
MASTER-26 semantic freeze ✅
  ↓
MASTER-27 Application Package ✅
  ↓
MASTER-28 Capability Contract ✅
  ↓
MASTER-29 WorkContext
  ↓
MASTER-30 Application Graph
  ↓
MASTER-31 → 36 Canvas
  ↓
MASTER-37 → 41 protocol + distribution
  ↓
MASTER-42 → 47 commercial network + capability cloud
  ↓
MASTER-48 → 51 external proofs + Application Network RC
```

## Constitutional invariants

- Every phase starts from latest authoritative `main`, never from a stacked future branch.
- One semantic concept has one canonical owner; extend nearest owner before creating another.
- Experience, Pack, Studio publication, Action Boundary, governance and runtime authorities are referenced, not duplicated.
- Capability semantics are provider-neutral. Provider/API/MCP/SaaS/hosted execution bindings do not define canonical meaning.
- `protocol.Capability` remains protocol/wire identity, not the semantic CapabilityDefinition owner.
- WorkContext is bounded work state/provenance; it is not chat history, user memory, prompt storage, EnterpriseContext scope, runtime lifecycle or execution authority.
- Protected effects remain behind governance + Action Boundary; Capability/Context cannot create a direct effect bypass or duplicate effect/idempotency truth.
- Canvas is authoring/proposal, never execution authority.
- Network is discovery/distribution, never execution authority.
- Exact identity/version resolution is explicit; no implicit latest or silent fallback.
- Untrusted/malformed input fails closed.
- Commercial entitlement remains distinct from authorization/governance/runtime permission.
- Core does not become a generic agent framework, workflow engine, policy language, provider-integration empire, MCP/A2UI replacement, IDE/design clone, cloud-compute platform or foundation model.
- PR creation is not phase completion. Merge requires contract review, security/architecture review, verification, independent reverse engineering and exact-head evidence appropriate to the diff.

## Active records

- `docs/pr-plans/MASTER-29.md`
- `docs/pr-plans/ACTIVE_PHASE.md`
- `docs/evidence/MASTER-29/RE_REPORT.md`
- `APPLICATION_MODEL.md`
- `APPLICATION_AUTHORITY.md`
- `APPLICATION_LIFECYCLE.md`
- `APPLICATION_VERSION_MODEL.md`
- `PACKAGE_OWNERSHIP.md`
