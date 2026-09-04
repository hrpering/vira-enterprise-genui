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

`application-protocol-projection` remains the Application-level projection fidelity owner; protocol payloads remain non-canonical interoperability data.

`application-publisher-sdk` depends only on `application-package`, `application-distribution` and `protocol`. It owns publisher-side composition ergonomics only and does not own publisher authentication, signing, transport, registry/federation, deployment/runtime, governance or execution.

`application-ai-host-sdk` depends only on `application-distribution`, `application-package` and `protocol`. It owns host-side integration ergonomics: strict host descriptor parsing, explicit Distribution integrity-verifier delegation, canonical Vira-version/required-capability evaluation, and exact source/host protocol-projection intersection.

`application-ai-host-sdk` does **not** own host authentication/identity proof, network endpoints/transports, provider credentials, registry/federation, protocol adapter execution, projection artifact generation, deployment/runtime state, governance/authorization/entitlement, Capability invocation or protected Action execution. Compatibility success is not a permission receipt. Empty protocol intersection is not automatically runtime incompatibility.

`protocol-gateway` remains the existing tool/protocol invocation adaptation owner.

`application-canvas` remains the only owner of Canvas editor revision and atomic draft mutation. `application-canvas-ai` remains proposal-only. `application-canvas-simulation` remains dry-run authoring evidence only. `application-canvas-design-import` remains a provider-neutral DTCG authoring import boundary delegating token semantics to `design-system-compiler`.

## Future ownership constraints

- Federated distribution must consume canonical Distribution envelopes and cannot grant execution/security authority.
- AI-host SDKs must consume canonical Distribution/Application declarations rather than define a new wire schema.
- AI-host compatibility must remain separate from authorization, entitlement, governance, deployment and runtime execution.
- AI-host protocol overlap must use exact source-declared refs; no implicit/latest protocol negotiation or adapter execution.
- Publisher SDKs must remain transport-neutral; registry/upload/provider credentials stay outside canonical SDK semantics.
- Publisher identity parity is not authentication. Any external publisher authentication/signature mechanism stays an adapter/host concern unless a future explicitly-owned trust contract is frozen.
- Digest computation and digest verification remain distinct.
- Application Network registry/catalog/federation layers must consume `application-distribution` envelopes rather than define a second Application artifact format.
- Distribution integrity verification is not deployment approval, governance approval, entitlement or execution permission.
- Application protocol projection must consume exact source-declared projection refs; it cannot invent implicit/latest protocol targets.
- Protocol projections must report `lossless`, `lossy`, or `unsupported` explicitly; lossy adapters enumerate canonical Application semantic losses.
- Protocol payload data cannot acquire transport/provider/deployment/governance/execution authority by projection success.
- Provider bindings must map to exact provider-neutral semantics and remain outside Canvas draft authority.
- WorkContext remains bounded work state/provenance, not chat history, user memory or prompt dump.
- Entitlement expresses commercial access and remains distinct from authorization/governance/runtime permission.

## Change rule

Before adding a package or semantic noun, a phase must record the nearest owner, why extending it is insufficient, permitted dependency edges, invariants/failure semantics, and focused/repository verification.
