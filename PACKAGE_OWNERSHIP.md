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
| Commercial entitlement grant + deterministic eligibility semantics | `commercial-entitlement` |
| Commercial meter definitions + append-only usage records + entitlement-limit rating | `commercial-metering` |
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
| Operational telemetry events | `telemetry` |
| Experience telemetry naming/observation mapping | `experience-observability` |
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

`commercial-entitlement` depends only on `application-package`, `enterprise-context` and `protocol`. It owns bounded commercial grant parsing, exact Application/Capability/entitlement matching, enterprise principal/scope selectors, opaque exact plan references, declarative `meteringRef + quantity` limits and the provider-neutral `entitled | not-entitled` commercial result.

`commercial-entitlement` does **not** own authentication, authorization, governance, runtime/deployment permission, protected Action or Capability execution, registry/network transport, provider bindings, mutable usage counters, remaining-quota computation, meter unit/window definitions, rating, pricing, invoice/payment state or subscription-provider lifecycle. An `entitled` result is commercial eligibility evidence only and cannot override an independent security or execution authority.

`commercial-metering` depends only on `application-package`, `commercial-entitlement`, `enterprise-context` and `protocol`. It owns bounded exact meter definitions, explicit immutable usage-record semantics, append-only in-process ledger/idempotency behavior, deterministic UTC usage windows and non-monetary usage-to-entitlement rating (`used`, `limit`, `remaining`, `excess`).

`commercial-metering` deliberately does **not** depend on or redefine `telemetry`, `experience-observability` or `action-ledger`. Telemetry events and Action receipts may be evidence used by an external trusted ingestion adapter, but they are never automatically converted into billable usage by core. Usage `sourceId` is provenance only, not authenticated identity or integrity proof.

`commercial-metering` also does **not** own monetary price/rate cards, currency, charges, invoices, payment/subscription state, publisher payouts, provider execution, authorization, governance or runtime/deployment permission. Its append-only ledger is a domain contract; durable storage/database infrastructure remains outside the package.

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
- Meter unit/window semantics, usage accounting and rating consume exact entitlement/metering references without moving those concerns into `commercial-entitlement`.
- Operational telemetry and audit/replay evidence remain distinct from commercial usage truth.
- Monetary pricing, settlement and publisher economics must consume canonical metering/rating evidence rather than mutate usage or entitlement truth.

## Change rule

Before adding a package or semantic noun, a phase must record the nearest owner, why extending it is insufficient, permitted dependency edges, invariants/failure semantics, and focused/repository verification.
