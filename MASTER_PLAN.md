# Vira Enterprise GenUI — Engineering Execution Plan

**Authority date:** 2026-09-05  
**Repository:** `hrpering/vira-enterprise-genui`  
**Authoritative main entering MASTER-51:** `6f02e4437210c0cd662f1852759c88fca328462c`

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
| Application Network — Hosted Capability Runtime Foundation | MASTER-44 | MERGED / PR #205 |
| Application Network — Commercial Pricing + Rate Card | MASTER-45 | MERGED / PR #206 |
| Application Network — Capability Supply Catalog + Exact Discovery | MASTER-46 | MERGED / PR #207 |
| Application Network — Commercial Settlement Allocation + Publisher Economics | MASTER-47 | MERGED / PR #208 |
| Application Network — Independent External Publisher Proof | MASTER-48 | MERGED / PR #209 |
| Application Network — Independent AI Host Proof | MASTER-49 | MERGED / PR #210 |
| Application Network — Independent Provider Proof | MASTER-50 | MERGED / PR #211 |
| Application Network — Cross-Surface Exact Semantics + Network RC | MASTER-51 | ACTIVE — Q7 RERUN PENDING / Q8 BLOCKED |

## Active execution order

```text
Enterprise GenUI RC1 ✅
  ↓
MASTER-26..50 ✅
  ↓
MASTER-51 Cross-Surface Exact Semantics + Application Network RC
```

## Constitutional invariants

- Every phase starts from latest authoritative `main`, never from a stacked future branch.
- One semantic concept has one canonical owner; extend the nearest owner before creating another.
- Experience, Pack, Studio publication, Action Boundary, governance and runtime authorities are referenced, not duplicated.
- Application exact-reference syntax remains owned by `application-package`; downstream packages consume its owner-local parse/serialize surface.
- Application release id/version syntax remains owned by `application-package`; downstream lookup/settlement/proof surfaces delegate to the canonical release-reference API rather than carrying local semver validators.
- Application distribution wraps canonical `ViraApplicationPackage` and does not duplicate Application metadata or authority.
- Distribution integrity declaration is distinct from integrity verification, authorization, entitlement, deployment and execution permission.
- Protocol projection fidelity is adapter-reported interoperability state, not generic proof of protocol equivalence.
- Publisher and AI-host SDKs compose canonical owners; neither defines a second wire schema or acquires network/runtime authority.
- Independent proof consumers must use public package-root exports rather than Vira `src/*` internals.
- AI-host source success requires explicit Distribution integrity verification before compatibility can succeed.
- AI-host host protocol projection references consume canonical Application exact-reference semantics rather than carrying a second versionRef parser.
- AI-host compatibility is canonical Vira-version + required-host-capability evaluation only; it is not authorization, entitlement, deployment or execution permission.
- A successful external AI-host proof verifies interoperability only; it does not authenticate the host or grant runtime/security authority.
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
- Commercial metering owns non-monetary rating truth and canonical rating evidence parsing; pricing must consume it rather than recompute usage.
- Commercial pricing uses integer currency nanos, exact plan/meter references and deterministic rate-card arithmetic; no floating-point money.
- Pricing quote evidence is not entitlement, invoice, payment, subscription, tax, FX, settlement, payout, authorization, governance or runtime permission.
- Commercial settlement consumes canonical pricing quote evidence rather than duplicating quote/rate-card semantics.
- Settlement rules use exact refs and exact Application/publisher/plan linkage; there is no default/latest/fallback settlement policy.
- Publisher/platform allocation uses safe integer basis points with deterministic floor-to-publisher rounding; no floating-point money or unsafe gross-by-share multiplication.
- Settlement allocation evidence is not invoice/payment/payout/funds movement/subscription/tax/FX/accounting truth and cannot acquire runtime/security authority.
- Usage/rating/quote/settlement evidence parsing validates semantics but does not authenticate external provenance or policy selection by itself.
- Capability exact-reference syntax remains owned by `capability-contract`; CapabilityDefinition, hosted binding and typed hosted values consume the same owner-local parse/serialize surface rather than carrying competing floating/versionRef validators.
- Capability release id/version syntax remains owned by `capability-contract`; CapabilityDefinition and Capability supply queries consume the same canonical release-reference API rather than carrying local semver validators.
- Hosted Capability execution consumes canonical CapabilityDefinition, WorkContext and enterprise scope; it must not redefine them.
- Hosted Capability provider/binding/location identities are routing/provenance evidence, not authentication, attestation, authorization or commercial entitlement.
- Hosted query execution cannot directly execute a Capability declared as `action`; protected effects remain behind `action-boundary`.
- Hosted Capability core does not own provider endpoints, credentials, durable jobs, container/VM/Kubernetes/serverless orchestration, autoscaling, failover/ranking or generic cloud compute.
- A successful hosted query result is execution evidence only and cannot override independent authentication, authorization, governance, entitlement or deployment requirements.
- Capability supply composes canonical CapabilityDefinition + HostedCapabilityBinding artifacts and canonical owner serialization; it does not redefine either owner.
- Capability supply accepts hosted `query` Capabilities only; `action` Capabilities remain behind `action-boundary`.
- The same exact Capability `id@version` cannot diverge semantically across supply sources, and the same exact `bindingRef` cannot map to divergent canonical bindings.
- Capability supply source repetition is provenance only, not authentication, attestation, confidence, health or ranking.
- Capability supply lookup is exact and deterministic; no implicit latest, source priority, majority winner, ranking, substitute provider or fallback.
- Capability supply owns no endpoints, credentials, provider health/SLA, commercial entitlement/pricing, deployment scheduling or generic cloud-compute semantics.
- A successful external provider proof demonstrates public-contract interoperability and one-shot hosted execution only; it does not authenticate/attest a provider, select a trusted provider, grant authorization/entitlement, or introduce retry/failover/cloud scheduling authority.
- MASTER-51 Network RC is a composition/release gate, not a new semantic owner; RC success does not grant authentication, attestation, authorization, entitlement, deployment or cloud authority.
- Environment-only failures in native/device gates do not authorize repository semantic changes; exact frozen executable/config SHA remains valid unless repository executable/package/test/boundary/config content changes.
- Core does not become a generic agent framework, workflow engine, policy language, provider-integration empire, payment processor, banking/ledger system, MCP/A2UI replacement, IDE/design clone, cloud-compute platform or foundation model.
- PR creation is not phase completion. Merge requires contract review, security/architecture review, verification, independent reverse engineering and exact-head evidence appropriate to the diff.

## Active records

- `docs/pr-plans/MASTER-51.md`
- `docs/pr-plans/ACTIVE_PHASE.md`
- `docs/evidence/MASTER-51/Q5_Q6_REVIEW.md`
- `docs/evidence/MASTER-51/Q7_ATTEMPT_1_FAIL.md`
- `docs/evidence/MASTER-51/Q7_ATTEMPT_2_ENV_BLOCKED.md`
- `docs/evidence/MASTER-51/Q7_FINAL_PASS.md`
- `docs/evidence/MASTER-51/Q8_ATTEMPT_1_OWNER_DRIFT.md`
- `docs/evidence/MASTER-51/Q7_ATTEMPT_3_TYPECHECK_FAIL.md`
- `APPLICATION_MODEL.md`
- `APPLICATION_AUTHORITY.md`
- `APPLICATION_LIFECYCLE.md`
- `APPLICATION_VERSION_MODEL.md`
- `PACKAGE_OWNERSHIP.md`
