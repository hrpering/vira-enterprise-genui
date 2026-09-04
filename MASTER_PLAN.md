# Vira Enterprise GenUI — Engineering Execution Plan

**Authority date:** 2026-09-04  
**Repository:** `hrpering/vira-enterprise-genui`  
**Authoritative main entering MASTER-34:** `8d9c28d5ac70b20ea88556305977aafd9dc8f3f6`

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
| Application Network — WorkContext | MASTER-29 | MERGED / PR #189 |
| Application Network — Application Graph | MASTER-30 | MERGED / PR #190 |
| Application Network — Canvas Foundation | MASTER-31 | MERGED / PR #191 |
| Application Network — Canvas Mutation Session | MASTER-32 | MERGED / PR #192 |
| Application Network — Canvas AI Co-author | MASTER-33 | MERGED / PR #193 |
| Application Network — Canvas Simulation + Replay | MASTER-34 | ACTIVE |
| Application Network — Canvas Multiplayer + Semantic Review | MASTER-35 | PLANNED |
| Application Network — Design System / External Design Import | MASTER-36 | PLANNED |
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
MASTER-29 WorkContext ✅
  ↓
MASTER-30 Application Graph ✅
  ↓
MASTER-31 Canvas Foundation ✅
  ↓
MASTER-32 Canvas Mutation Session ✅
  ↓
MASTER-33 Canvas AI Co-author ✅
  ↓
MASTER-34 Canvas Simulation + Replay
  ↓
MASTER-35 Canvas Multiplayer + Semantic Review
  ↓
MASTER-36 Design System / External Design Import
  ↓
MASTER-37 → 41 protocol + distribution
  ↓
MASTER-42 → 47 commercial network + capability cloud
  ↓
MASTER-48 → 51 external proofs + Application Network RC
```

## Constitutional invariants

- Every phase starts from latest authoritative `main`, never from a stacked future branch.
- One semantic concept has one canonical owner; extend the nearest owner before creating another.
- Experience, Pack, Studio publication, Action Boundary, governance and runtime authorities are referenced, not duplicated.
- ApplicationGraph is relational semantics, not a workflow engine or runtime graph.
- Canvas authors/proposes canonical semantics but editor projection (coordinates, viewport, selection) is not Application semantics.
- Canvas editor revision is not runtime/deployment/Application release revision.
- Canvas mutation sessions require exact editor revision guards; stale writes fail closed and failed candidates cannot partially commit.
- Canvas AI is a proposal engine only: provider output must pass canonical validation, unsupported authority cannot be invented, and proposals cannot directly apply, publish, deploy, govern or execute protected effects.
- Canvas simulation/replay is authoring-time dry-run evidence only: explicit paths are validated, Capability/Action nodes are never invoked/executed, policy/governance is not evaluated, no WorkContext/ledger truth is created, and replay fails closed on exact semantic drift while ignoring projection-only changes.
- Canvas cannot directly publish, deploy, authorize, govern or execute protected effects by implication.
- Capability semantics are provider-neutral; provider/API/MCP/SaaS bindings do not define canonical meaning.
- WorkContext is bounded work state/provenance, not chat history/user memory/prompt storage/runtime lifecycle.
- Network is discovery/distribution, never execution authority.
- Exact identity/version resolution is explicit; no implicit latest or silent fallback.
- Untrusted/malformed input fails closed.
- Commercial entitlement remains distinct from authorization/governance/runtime permission.
- Core does not become a generic agent framework, workflow engine, policy language, provider-integration empire, MCP/A2UI replacement, IDE/design clone, cloud-compute platform or foundation model.
- PR creation is not phase completion. Merge requires contract review, security/architecture review, verification, independent reverse engineering and exact-head evidence appropriate to the diff.

## Active records

- `docs/pr-plans/MASTER-34.md`
- `docs/pr-plans/ACTIVE_PHASE.md`
- `docs/evidence/MASTER-34/RE_REPORT.md`
- `APPLICATION_MODEL.md`
- `APPLICATION_AUTHORITY.md`
- `APPLICATION_LIFECYCLE.md`
- `APPLICATION_VERSION_MODEL.md`
- `PACKAGE_OWNERSHIP.md`
