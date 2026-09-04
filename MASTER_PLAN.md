# Vira Enterprise GenUI — Engineering Execution Plan

**Authority date:** 2026-09-05  
**Repository:** `hrpering/vira-enterprise-genui`  
**Authoritative main entering MASTER-44:** `e987f3447953761b70c4aa548761bf359b3e07f0`

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
| Application Network — AI-host SDK | MASTER-40 | MERGED / PR #200 |
| Application Network — Federated Distribution | MASTER-41 | MERGED / PR #201 |
| Application Network — Commercial Entitlement Contract | MASTER-42 | MERGED / PR #202 |
| Application Network — Commercial Usage Metering + Rating | MASTER-43 | MERGED / PR #204 |
| Application Network — Hosted Capability Runtime Foundation | MASTER-44 | ACTIVE |
| Application Network — Remaining Commercial / Capability Cloud | MASTER-45..47 | PLANNED |
| Application Network — External Proofs / Network RC | MASTER-48..51 | PLANNED |

## Active execution order

```text
Enterprise GenUI RC1 ✅
  ↓
MASTER-26..43 ✅
  ↓
MASTER-44 Hosted Capability Runtime Foundation
  ↓
MASTER-45 → 47 remaining commercial network + capability cloud
  ↓
MASTER-48 → 51 external proofs + Application Network RC
```

## Constitutional invariants

- Every phase starts from latest authoritative `main`, never from a stacked future branch.
- One semantic concept has one canonical owner; extend the nearest owner before creating another.
- Experience, Pack, Studio publication, Action Boundary, governance and runtime authorities are referenced, not duplicated.
- Application distribution wraps canonical `ViraApplicationPackage` and does not duplicate Application metadata or authority.
- Distribution integrity declaration is distinct from integrity verification, authorization, entitlement, deployment and execution permission.
- Protocol projection fidelity is adapter-reported interoperability state, not generic proof of protocol equivalence.
- Publisher and AI-host SDKs compose canonical owners; neither defines a second wire schema or acquires network/runtime authority.
- AI-host source success requires explicit Distribution integrity verification before compatibility can succeed.
- AI-host compatibility is canonical Vira-version + required-host-capability evaluation only; it is not authorization, entitlement, deployment or execution permission.
- Federated distribution consumes canonical Distribution envelopes only.
- Public federation may expose only canonical Application releases declared `visibility: public` and `discoverable: true`.
- Federation source IDs are provenance data, not authentication; federation parsing does not imply integrity verification.
- The same exact Application `id@version` cannot resolve differently across federation sources. Divergent canonical envelopes fail closed; there is no source priority, majority vote, implicit latest or fallback.
- Network is discovery/distribution, never execution authority.
- Exact identity/version resolution is explicit; no implicit latest or silent fallback.
- Untrusted/malformed input fails closed.
- Commercial entitlement remains distinct from authorization/governance/runtime permission.
- Entitlement limit declarations reference exact metering identities only.
- Commercial usage records are explicit canonical inputs; telemetry, observability and Action receipts are not automatically billable usage.
- Commercial metering may define provider-neutral units/windows and usage-to-entitlement rating, but monetary pricing/currency/invoice/payment/payout semantics remain separate.
- Usage source provenance is not authentication or evidence verification.
- Hosted Capability execution consumes canonical CapabilityDefinition, WorkContext and enterprise scope; it must not redefine them.
- Hosted Capability provider/binding/location identities are routing/provenance evidence, not authentication, attestation, authorization or commercial entitlement.
- Hosted query execution cannot directly execute a Capability declared as `action`; protected effects remain behind `action-boundary`.
- Hosted Capability core does not own provider endpoints, credentials, durable jobs, container/VM/Kubernetes/serverless orchestration, autoscaling, failover/ranking or generic cloud compute.
- A successful hosted query result is execution evidence only and cannot override independent authentication, authorization, governance, entitlement or deployment requirements.
- Core does not become a generic agent framework, workflow engine, policy language, provider-integration empire, MCP/A2UI replacement, IDE/design clone, cloud-compute platform or foundation model.
- PR creation is not phase completion. Merge requires contract review, security/architecture review, verification, independent reverse engineering and exact-head evidence appropriate to the diff.

## Active records

- `docs/pr-plans/MASTER-44.md`
- `docs/pr-plans/ACTIVE_PHASE.md`
- `APPLICATION_MODEL.md`
- `APPLICATION_AUTHORITY.md`
- `APPLICATION_LIFECYCLE.md`
- `APPLICATION_VERSION_MODEL.md`
- `PACKAGE_OWNERSHIP.md`
