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

`application-publisher-sdk` depends only on `application-package`, `application-distribution` and `protocol`. It owns publisher-side composition ergonomics: safe input, host-asserted publisher-id parity, canonical Application serialization delegation, injected SHA-256 digest-provider invocation, digest shape validation and canonical distribution-envelope parse/serialization delegation.

`application-publisher-sdk` does **not** own publisher authentication, identity proof, signatures/certificates/credentials, digest verification, registry upload, URL/transport/federation, protocol-specific adapters, deployment/runtime, governance/authorization/entitlement or Capability/Action execution. Its returned `publisherId` and digest are not trust assertions beyond the canonical data they represent.

`protocol-gateway` remains the existing tool/protocol invocation adaptation owner.

`application-canvas` remains the only owner of Canvas editor revision and atomic draft mutation. Collaboration final apply delegates to its mutation session rather than replacing or duplicating stale-write/canonical validation logic.

`application-canvas-ai` remains proposal-only and provider-facing. `application-canvas-collaboration` is provider-neutral.

`application-canvas-simulation` remains dry-run authoring evidence only.

`application-canvas-design-import` remains a provider-neutral DTCG authoring import boundary delegating token semantics to `design-system-compiler`.

## Future ownership constraints

- AI-host SDKs must consume canonical `application-distribution` / `application-protocol-projection` artifacts rather than define a new Application wire schema.
- Federated distribution must consume canonical distribution envelopes and cannot grant execution/security authority.
- Publisher SDKs must remain transport-neutral; registry/upload/provider credentials stay outside canonical SDK semantics.
- Publisher identity parity is not authentication. Any external publisher authentication/signature mechanism stays an adapter/host concern unless a future explicitly-owned trust contract is frozen.
- Digest computation and digest verification remain distinct. Publisher preparation may obtain a declared digest but cannot claim verification merely because the SDK produced an envelope.
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
