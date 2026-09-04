# Vira Enterprise GenUI — Engineering Execution Plan

**Authority date:** 2026-09-04  
**Repository:** `hrpering/vira-enterprise-genui`  
**Authoritative main entering MASTER-40:** `86def2e33f3f845fff8e3fb234099e60ffbdaf20`

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
| Application Network — Canvas Simulation + Replay | MASTER-34 | MERGED / PR #194 |
| Application Network — Canvas Multiplayer + Semantic Review | MASTER-35 | MERGED / PR #195 |
| Application Network — Design System / External Design Import | MASTER-36 | MERGED / PR #196 |
| Application Network — Application Distribution Contract | MASTER-37 | MERGED / PR #197 |
| Application Network — Application Protocol Projection | MASTER-38 | MERGED / PR #198 |
| Application Network — Application Publisher SDK | MASTER-39 | MERGED / PR #199 |
| Application Network — AI-host SDK | MASTER-40 | ACTIVE |
| Application Network — Federated Distribution | MASTER-41 | PLANNED |
| Application Network — Commercial / Capability Cloud | MASTER-42..47 | PLANNED |
| Application Network — External Proofs / Network RC | MASTER-48..51 | PLANNED |

## Active execution order

```text
Enterprise GenUI RC1 ✅
  ↓
MASTER-26..39 ✅
  ↓
MASTER-40 AI-host SDK
  ↓
MASTER-41 Federated Distribution
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
- Canvas authors/proposes canonical semantics but editor projection is not Application semantics.
- Application distribution wraps the canonical `ViraApplicationPackage`; it does not duplicate Application metadata or authority.
- Application distribution integrity declaration is distinct from integrity verification, deployment approval, governance approval, entitlement and execution permission.
- Application protocol projections bind exact source distributions + exact source-declared projection refs and report `lossless | lossy | unsupported` explicitly.
- Projection fidelity is adapter-reported interoperability state, not generic proof of arbitrary protocol equivalence.
- Publisher SDKs compose canonical Application/Distribution owners; they do not define a second Application artifact or registry protocol.
- Publisher SDK `publisherId` is host-asserted identity parity, not authentication or proof of publisher ownership.
- Publisher SDK digest-provider output is a declared SHA-256 identity and does not by itself assert verification/trust.
- AI-host SDK source success requires explicit Distribution integrity verification before host compatibility can succeed.
- AI-host compatibility is canonical Vira-version + required-host-capability evaluation only; it is not authorization, entitlement, deployment or execution permission.
- Host protocol support is exact id+version intersection only; empty intersection does not itself redefine runtime compatibility and no implicit projection is selected.
- Publisher/AI-host SDK core contains no signing credentials, URL/transport, registry/federation, deployment, governance or protected execution authority.
- Network is discovery/distribution, never execution authority.
- Exact identity/version resolution is explicit; no implicit latest or silent fallback.
- Untrusted/malformed input fails closed.
- Commercial entitlement remains distinct from authorization/governance/runtime permission.
- Core does not become a generic agent framework, workflow engine, policy language, provider-integration empire, MCP/A2UI replacement, IDE/design clone, cloud-compute platform or foundation model.
- PR creation is not phase completion. Merge requires contract review, security/architecture review, verification, independent reverse engineering and exact-head evidence appropriate to the diff.

## Active records

- `docs/pr-plans/MASTER-40.md`
- `docs/pr-plans/ACTIVE_PHASE.md`
- `docs/evidence/MASTER-40/RE_REPORT.md`
- `APPLICATION_MODEL.md`
- `APPLICATION_AUTHORITY.md`
- `APPLICATION_LIFECYCLE.md`
- `APPLICATION_VERSION_MODEL.md`
- `PACKAGE_OWNERSHIP.md`
