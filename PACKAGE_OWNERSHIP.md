# Package Ownership

This document explains ownership; it does not define executable dependency policy.

**Executable authority:** `tooling/package-boundaries.config.mjs`  
If this document and the executable boundary graph disagree, the executable graph wins and this document must be corrected.

## Current canonical owners

| Concern | Canonical owner / family |
|---|---|
| Application release identity/reference graph/distribution metadata | `application-package` |
| Application distribution envelope + artifact-integrity binding | `application-distribution` |
| Application protocol projection fidelity artifact | `application-protocol-projection` |
| Publisher-side Application distribution preparation ergonomics | `application-publisher-sdk` |
| AI-host-side Application integrity + compatibility ergonomics | `application-ai-host-sdk` |
| Public Application federation snapshot + exact-release discovery/conflict semantics | `application-federation` |
| Application semantic nodes/edges | `application-graph` |
| Canvas draft identity/editor revision/non-semantic projection + mutation session | `application-canvas` |
| Application-level Canvas AI semantic proposal/diff | `application-canvas-ai` |
| Canvas dry-run semantic path trace + exact replay | `application-canvas-simulation` |
| Canvas authoring collaboration/presence/semantic peer review | `application-canvas-collaboration` |
| Canvas external design source provenance + authoring import artifact | `application-canvas-design-import` |
| DTCG design-token compilation into Studio design options | `design-system-compiler` |
| Studio design catalog controls/options | `studio-design` |
| Full Studio brand definition/package assembly | `studio-brand` |
| Trusted Studio brand renderer activation | `studio-brand-loader` |
| Provider-neutral CapabilityDefinition semantics | `capability-contract` |
| Bounded WorkContext definition/snapshot/provenance semantics | `work-context` |
| Capability wire/protocol identity envelope | `protocol` |
| Runtime state, lifecycle, patches, permissions, errors | `runtime-core` |
| Protected effect boundary + Action effect/idempotency catalog | `action-boundary` |
| Governance semantics | `governance`, `enterprise-governance` |
| Policy evaluator simulation | `policy-simulation` |
| Enterprise organization/project/environment/principal/secret scope | `enterprise-context` |
| Enterprise/private registry concerns | `enterprise-registry` |
| Publication/deployment concerns | `deployment-plane` |
| Experience resolution | `experience-resolver` |
| Experience Pack semantics | `experience-packs` |
| Experience registry | `experience-registry` |
| Action receipts / ledger truth | `action-ledger` |
| Tool/protocol invocation adaptation | `protocol-gateway` |
| Studio document schema | `studio-schema` |
| Studio publication gate | `studio-publish` |
| Human Studio authoring inside one Experience | `studio-workbench` |
| Experience-level Studio AI proposal surface | `studio-ai` |
| Web/native render/host surfaces | existing runtime and Studio host/renderer packages governed by the executable boundary graph |

`application-distribution` remains the canonical provider-neutral distribution envelope/integrity owner.

`application-publisher-sdk` and `application-ai-host-sdk` remain thin integration layers over canonical Application/Distribution owners. They do not own registries, transports, deployment/runtime, governance or protected execution.

`application-federation` depends only on `application-distribution` and `protocol`. It owns public federation snapshot parsing, deterministic serialization, exact-release source provenance, exact lookup and fail-closed cross-source conflict detection.

`application-federation` does **not** own source authentication/identity proof, signatures/certificates, Distribution integrity verification, URLs/endpoints/transports, registry persistence, ranking/recommendation, source priority, implicit/latest resolution, deployment/runtime, governance/authorization/entitlement, protocol adapter execution, Capability invocation or protected Action execution.

Public federation accepts only releases whose canonical Application distribution metadata is `visibility: "public"` and `discoverable: true`. A federation `sourceId` is provenance data only. Distribution digest declarations remain unverified until an existing integrity-verification owner explicitly verifies them.

The same exact Application `id@version` across multiple sources is valid only when canonical Distribution serialization is identical. Divergent envelopes fail closed with no priority/majority/latest fallback.

`experience-registry` remains the Experience Pack registry owner and is not extended into Application federation. `enterprise-registry` remains tenant/private registry infrastructure and is not the public Application Network federation owner.

## Future ownership constraints

- Commercial/marketplace layers must consume canonical Application federation/distribution artifacts rather than define another Application wire schema.
- Federation must remain discovery/distribution, never execution or security authority.
- Federation source provenance must not be treated as authenticated identity without a separately owned trust mechanism.
- Distribution integrity verification remains distinct from federation membership and discovery.
- Public federation cannot leak private/organization/non-discoverable Application releases.
- Exact release conflicts fail closed; no implicit latest, source priority or silent conflict winner.
- AI-host compatibility remains separate from authorization, entitlement, governance, deployment and runtime execution.
- Publisher SDKs remain transport-neutral; registry/upload/provider credentials stay outside canonical SDK semantics.
- Protocol payload data cannot acquire transport/provider/deployment/governance/execution authority by projection success.
- Provider bindings must map to exact provider-neutral semantics and remain outside Canvas draft authority.
- WorkContext remains bounded work state/provenance, not chat history, user memory or prompt dump.
- Entitlement expresses commercial access and remains distinct from authorization/governance/runtime permission.

## Change rule

Before adding a package or semantic noun, a phase must record the nearest owner, why extending it is insufficient, permitted dependency edges, invariants/failure semantics, and focused/repository verification.
