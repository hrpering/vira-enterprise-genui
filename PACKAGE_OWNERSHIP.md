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
| Commercial plan/rate-card semantics + deterministic monetary quote evidence | `commercial-pricing` |
| Publisher/platform settlement-allocation evidence | `commercial-settlement` |
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
| Provider-neutral hosted query Capability execution boundary | `hosted-capability-runtime` |
| Provider-neutral Capability supply snapshot + exact binding discovery/conflict semantics | `capability-supply` |
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

`application-package` remains the canonical Application identity/reference owner. MASTER-47 exposes owner-local `parseViraApplicationExactReference` / `serializeViraApplicationExactReference` APIs so downstream commercial owners consume the same exact-reference semantics instead of defining another reference parser.

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

`commercial-metering` also does **not** own monetary price/rate cards, currency, charges, invoices, payment/subscription state, publisher payouts, provider execution, authorization, governance or runtime/deployment permission. Its append-only ledger is a bounded domain helper; durable storage/database/partitioning infrastructure remains outside the package.

`commercial-metering` additionally owns canonical parsing/serialization of its `ViraCommercialUsageRating` evidence so downstream commercial layers consume one rating definition rather than copy its shape. Rating evidence parsing validates canonical window/status/quantity invariants but does not authenticate the source of persisted/transmitted evidence.

`commercial-pricing` depends only on `application-package`, `commercial-metering` and `protocol`. It owns provider-neutral exact price-plan/rate-card semantics, integer currency-nanos arithmetic, deterministic `used | excess` meter pricing and canonical monetary quote evidence.

`commercial-pricing` consumes canonical metering ratings rather than recomputing usage. It owns parsing/serialization of its own quote evidence so downstream commercial layers can consume one canonical pricing artifact.

`commercial-pricing` does **not** own entitlement, authentication, authorization, governance, runtime/deployment permission, telemetry/usage truth, tax, FX, invoices, payment intents/captures, subscription lifecycle, refunds, settlement, revenue share, publisher/provider payouts or accounting. An exact `planRef` quote does not prove that the principal is entitled to that plan. Currency validation is lexical only and does not assert ISO/legal-tender or FX authority.

`commercial-settlement` depends only on `application-package`, `commercial-pricing` and `protocol`. It owns bounded exact settlement schedules, deterministic publisher-share basis-point allocation over one canonical pricing quote, and canonical publisher/platform allocation evidence.

A settlement rule is selected by exact `settlementRef` only and binds one exact Application release namespace/publisher, one exact `planRef` and one integer `publisherShareBps` from `0..10000`. There is no implicit default/latest/fallback settlement rule.

`commercial-settlement` consumes canonical Application identity/publisher/reference semantics and canonical pricing quote parse/serialization rather than duplicating them. Allocation evidence embeds the canonical quote. Publisher allocation uses safe-integer basis-point arithmetic with explicit floor rounding; fractional nano remainder stays with platform.

`commercial-settlement` does **not** prove entitlement, create invoices, authorize/capture payments, move funds, create publisher payouts, own processor/bank settlement, subscription/refund lifecycle, tax/VAT, FX, accounting/revenue recognition, authentication, authorization, governance or runtime/deployment permission. Parsing allocation evidence validates internal semantics/arithmetic only and does not authenticate the settlement-rule provenance that produced it.

`hosted-capability-runtime` depends only on `capability-contract`, `enterprise-context`, `protocol` and `work-context`. It owns exact hosted binding parsing/serialization, exact Capability binding verification, canonical enterprise execution context carriage, strict WorkContext minimization, typed JSON input/output identity checks and one-shot trusted-adapter invocation for canonical `query` Capabilities.

`hosted-capability-runtime` does **not** own CapabilityDefinition semantics, provider catalog/discovery, provider authentication/attestation, network endpoints/transports, credentials/secrets, durable jobs, VM/container/Kubernetes/serverless scheduling, autoscaling, failover/provider ranking, commercial entitlement/metering, authorization/governance or monetary billing.

A Capability declaring `invocation.kind: "action"` is never executed by `hosted-capability-runtime`; it fails closed with `ACTION_BOUNDARY_REQUIRED` before adapter invocation. Protected effects remain exclusively behind `action-boundary` and its canonical permit/idempotency/confirmation/receipt semantics.

Hosted `providerId`, `bindingRef` and `locationId` are routing/provenance evidence only. A successful hosted query result does not authenticate the provider, attest isolation, authorize the principal, prove commercial entitlement or imply that an external provider implementation is cryptographically side-effect-free. The adapter remains an explicit trusted integration boundary.

`capability-supply` depends only on `capability-contract`, `hosted-capability-runtime` and `protocol`. It owns bounded supply-source provenance, canonical CapabilityDefinition + HostedCapabilityBinding composition, deterministic snapshot serialization, exact lookup and fail-closed cross-source semantic/binding conflict detection.

A supply record is valid only when the canonical hosted binding `capabilityRef` exactly matches the enclosed canonical Capability definition `id@version`. Hosted supply accepts only canonical `query` Capabilities; `action` Capabilities fail with `ACTION_BOUNDARY_REQUIRED` and remain behind the existing Action Boundary.

The same exact Capability `id@version` across sources is valid only when canonical Capability serialization is identical. The same exact `bindingRef` across sources is valid only when canonical Hosted binding serialization is identical. Divergence fails closed with no source priority, majority vote, implicit latest or fallback winner. Identical supply may repeat across sources and retains all `sourceId` provenance.

`capability-supply` does **not** own provider authentication/attestation, health/SLA, ranking/recommendation, failover, endpoints/transports, credentials/secrets, deployment placement, commercial entitlement/pricing, generic cloud scheduling or provider execution. `sourceId`, `providerId`, `bindingRef` and `locationId` remain provenance/routing identities only.

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
- Hosted Capability execution must not turn protocol adaptation, deployment, Experience runtime or CapabilityDefinition packages into generic cloud-compute owners.
- Capability supply discovery must remain separate from hosted execution, provider authentication/attestation, health/ranking/failover, commercial entitlement/pricing and cloud scheduling.
- Capability supply source repetition is provenance only; it must not become confidence, priority or authenticated identity.
- Same exact Capability or binding conflicts fail closed; no majority/source-priority/latest/fallback winner.
- Action-kind Capabilities remain behind the canonical Action Boundary; hosted supply/execution cannot become a protected-effect bypass.
- WorkContext remains bounded work state/provenance, not chat history, user memory or prompt dump.
- Entitlement expresses commercial access and remains distinct from authorization/governance/runtime permission.
- Meter unit/window semantics, usage accounting and rating consume exact entitlement/metering references without moving those concerns into `commercial-entitlement`.
- Operational telemetry and audit/replay evidence remain distinct from commercial usage truth.
- Pricing consumes canonical rating evidence and cannot rewrite usage, entitlement or security truth.
- Settlement consumes canonical pricing quote evidence and cannot redefine quote/rate-card arithmetic or infer entitlement/payment truth.
- Payment/subscription/payout/tax/FX/accounting layers, if added outside or downstream of core, must consume canonical commercial evidence rather than redefine entitlement/metering/pricing/settlement semantics.
- Monetary pricing, settlement allocation and actual funds movement remain distinct semantic owners; no commercial artifact acquires runtime/security authority by being monetarily valid.

## Change rule

Before adding a package or semantic noun, a phase must record the nearest owner, why extending it is insufficient, permitted dependency edges, invariants/failure semantics, and focused/repository verification.
