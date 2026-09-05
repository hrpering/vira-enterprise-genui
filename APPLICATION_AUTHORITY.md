# Vira Application Authority

## Purpose

This document freezes authority boundaries for the Application Network. It is semantic documentation, not a new executable boundary graph. `tooling/package-boundaries.config.mjs` remains executable dependency authority.

## Authority rule

**Composition may reference an owner; it does not inherit that owner's authority.**

An Application can reference Experiences, Capabilities, Context and Actions, but it cannot become their competing parser, registry, policy engine, runtime or effect boundary.

## Canonical authority matrix

| Concern | Canonical authority | Application/Canvas/Network must not |
|---|---|---|
| Studio document semantics | `studio-schema` | define a second Experience document schema |
| Studio compilation/publication | `studio-compiler`, `studio-publish` | compile or publish through an alternate path |
| Experience Pack semantics | `experience-packs` | invent a parallel pack format |
| Experience registry | `experience-registry` | become an implicit-latest registry |
| Enterprise/private approval | `enterprise-registry` | bypass exact enterprise approval |
| Experience resolution | `experience-resolver` | silently substitute another identity/version |
| Deployment/integrity | `deployment-plane` | redefine artifact signing/promotion/deployment truth |
| Runtime state/lifecycle/patches/permissions/errors | `runtime-core` | own execution state or platform runtime forks |
| Protected effects | `action-boundary` | execute protected side effects directly |
| Governance | `governance`, `enterprise-governance` | become a policy language or bypass verdicts/approvals |
| Enterprise scope | `enterprise-context` | weaken tenant/project/environment boundaries |
| Action audit/replay evidence | `action-ledger` | create a competing effect ledger |
| Operational telemetry/observability | `telemetry`, `experience-observability` | be treated as commercial usage truth by implication |
| Platform host/render mapping | existing Web/native host/runtime owners | redefine business semantics per platform |
| Application semantic composition | `application-package`, `application-graph` | absorb the authorities listed above |
| Capability semantics | `capability-contract` | let MCP/SaaS/customer/provider bindings define canonical meaning |
| Hosted query Capability execution | `hosted-capability-runtime` | become Action execution, authorization, provider attestation or generic cloud compute |
| Capability supply discovery | `capability-supply` | become execution, provider trust, ranking/failover, commercial access or cloud scheduling authority |
| Work Context semantics | `work-context` | treat chat history, prompt dump or user memory as canonical Context |
| Canvas | `application-canvas` family | become runtime, publication, governance or effect authority |
| Network | `application-distribution`, `application-federation`, `capability-supply` | become runtime/execution/governance authority |
| Entitlement/commercial access | `commercial-entitlement` | be treated as authorization/governance/runtime permission |
| Commercial usage metering/rating | `commercial-metering` | become monetary billing or execution authority |
| Commercial plan/rate-card + quote evidence | `commercial-pricing` | become invoice/payment/subscription/settlement or security authority |
| Publisher/platform settlement allocation evidence | `commercial-settlement` | become payment/payout/funds movement/accounting or security authority |

## Application authority

The Application owners may canonically own only application-level semantics such as:

- Application identity/release identity;
- semantic graph membership and edges;
- exact dependency references;
- application-level declarations that do not duplicate the referenced owner's payload;
- integrity/provenance binding for the Application release.

They do not own the internals of an Experience, Capability provider, Context implementation, Action execution, policy decision or deployment plane.

`application-package` also owns exact Application reference syntax. Public exact-reference parse/serialize APIs are an owner-local interoperability surface; downstream packages must consume them rather than create another exact-reference authority.

## Canvas authority

Canvas may:

- create/edit/propose Application semantics;
- visualize ApplicationGraph relationships;
- invoke existing validators/publishers;
- retain editor-only projection state.

Canvas may not:

- write around a canonical parser/validator;
- turn x/y position into runtime semantics unless explicitly represented in the semantic model;
- directly execute protected Actions;
- persist a competing runtime truth store;
- make an unpublished draft executable by implication.

## Network authority

Network may:

- discover Application releases and Capability supply;
- distribute exact identities/artifacts;
- expose compatibility/availability/provenance metadata where a canonical owner exists;
- route demand toward resolvable supply.

Network may not:

- change the meaning of the artifact it distributes;
- resolve `latest` implicitly for protected execution;
- bypass enterprise registry/deployment/governance;
- execute a protected effect because distribution succeeded;
- conflate commercial entitlement with authorization;
- treat supply-source repetition as provider trust, ranking, health or execution permission.

## Commercial entitlement authority

`commercial-entitlement` may determine only whether one explicitly selected exact Application entitlement reference has a matching commercial grant for the exact Application release, enterprise principal/scope, optional Capability and location selectors. It may return exact plan evidence and declarative `meteringRef + quantity` limits.

`entitled` means **commercial eligibility only**. It is not an authorization, governance approval, runtime permission, deployment approval or protected Action permission. Downstream execution must still independently pass the canonical registry/resolution, enterprise scope, governance, runtime/deployment and Action Boundary gates that apply to that operation.

Commercial entitlement also does not define meter units/windows, count mutable usage, compute remaining quota, rate usage, price invoices or own payment/subscription provider state. Those concerns are separately owned downstream.

## Commercial metering authority

`commercial-metering` may define exact provider-neutral meter units/windows, validate explicit commercial usage records, enforce append-only usage-id idempotency and deterministically rate one exact meter against an existing entitlement limit.

A metering rating may state only usage evidence such as:

```text
used / limit / remaining / excess
unlimited | within-limit | limit-reached | over-limit
```

It does not authorize or deny runtime execution. An over-limit result is commercial evidence for a higher-level product/commercial decision; it cannot bypass or replace governance, runtime permission or the Action Boundary.

Operational telemetry, Experience observations and Action receipts are not billable usage by implication. A trusted integration may explicitly normalize external evidence into the canonical commercial usage-record contract, but `sourceId` remains provenance only and the core parser does not authenticate or integrity-verify that source.

Commercial metering also does not own monetary price/rate cards, currency, charges, invoice/payment/subscription lifecycle or publisher settlement. Those economic layers consume canonical metering evidence rather than mutate security or usage truth.

Canonical rating parsing/serialization belongs to `commercial-metering`. Parsing rating evidence validates structural/semantic consistency; it does not authenticate the origin of that evidence.

## Commercial pricing authority

`commercial-pricing` may define exact provider-neutral price plans/rate cards and deterministically transform canonical metering rating evidence into monetary quote evidence.

Pricing may own only evidence such as:

```text
exact planRef
currency
asOf
fixedAmountNanos
meter line quantity × amountNanosPerUnit
totalAmountNanos
```

Money is represented as non-negative safe-integer currency nanos. Core performs no floating-point monetary arithmetic. Currency validation is lexical only; it does not establish ISO membership, exchange rates, tax jurisdiction or legal-tender status.

A quote is **not**:

- entitlement evidence by itself;
- an invoice;
- a payment intent/capture;
- a subscription state;
- a tax calculation;
- an FX conversion;
- accounting truth;
- settlement/revenue-share/payout evidence;
- authorization, governance approval or runtime permission.

An exact `planRef` can be quoted without proving the requesting principal is entitled to that plan. Entitlement remains an independent upstream commercial decision. Likewise, quote validity cannot convert a governance/runtime denial into execution success.

Pricing consumes canonical metering ratings and may not reconstruct or rewrite usage truth. Quote parsing/serialization belongs to the pricing owner so downstream settlement/payment layers consume one canonical quote shape rather than define another pricing schema.

## Commercial settlement authority

`commercial-settlement` may deterministically allocate one canonical pricing quote's gross nanos between the canonical Application publisher and the platform according to one explicitly selected exact settlement rule.

Settlement may own only evidence such as:

```text
exact settlementRef
exact Application id/version
canonical publisherId
publisherShareBps
canonical pricing quote
publisherAmountNanos
platformAmountNanos
```

Rules are selected by exact `settlementRef`; there is no implicit latest/default/fallback settlement policy. Rule Application identity/publisher namespace and exact `planRef` must match the canonical Application/quote inputs used for evaluation.

Publisher share is integer basis points `0..10000`. Allocation uses safe-integer quotient/remainder arithmetic, not floating-point ratios or unsafe direct gross-by-bps multiplication. Fractional nano remainder deterministically remains with platform.

Settlement allocation evidence is **not**:

- entitlement proof;
- an invoice;
- a payment intent/capture;
- funds movement;
- a publisher payout;
- bank/processor settlement;
- subscription/refund state;
- tax/VAT calculation;
- FX conversion;
- accounting or revenue-recognition truth;
- authorization, governance approval or runtime permission.

The allocation parser independently reparses the embedded canonical quote and verifies split arithmetic. That validates internal evidence semantics only; it does not authenticate who selected the settlement schedule/rule or prove external policy provenance.

A valid allocation cannot convert a failed entitlement, authorization, governance, deployment or runtime decision into success. Monetary allocation validity is never execution permission or proof that money moved.

## Hosted Capability runtime authority

`hosted-capability-runtime` may validate one exact provider binding against one canonical `ViraCapabilityDefinition`, carry canonical enterprise principal/scope, minimize Context disclosure to the exact declared `contextRequirements`, validate typed JSON input/output identity and invoke one explicitly supplied trusted provider adapter for a canonical **query** Capability.

A hosted execution result is provider-neutral execution evidence only. It does **not** mean:

- authenticated provider identity or attested isolation;
- authorized principal;
- governance approval;
- commercial entitlement;
- deployment approval;
- monetary usage/charge;
- protected Action permission.

A Capability whose canonical invocation kind is `action` is rejected by this runtime before adapter invocation. Protected effect execution remains behind `action-boundary`; MASTER-44 does not reproduce Action permits, confirmations, idempotency or receipts.

`providerId`, `bindingRef` and `locationId` are routing/provenance evidence only. A canonical `query` declaration also does not cryptographically prove that an external provider implementation is side-effect-free; the explicitly supplied adapter is a trusted integration boundary, not a new semantic/security authority.

The hosted Capability runtime owns no provider catalog, endpoint/transport, credentials, secret delivery, durable job queue, container/VM/Kubernetes/serverless scheduling, autoscaling, failover/ranking or generic cloud-compute semantics.

## Capability supply authority

`capability-supply` may compose canonical `ViraCapabilityDefinition` artifacts with canonical `ViraHostedCapabilityBinding` artifacts into bounded supply snapshots and provide deterministic exact discovery.

A supply record means only:

```text
source provenance
+ exact Capability semantics
+ exact hosted binding identity/provider/location
```

It does **not** mean:

- authenticated or attested provider identity;
- provider health, availability or SLA;
- authorization/governance approval;
- commercial entitlement or price validity;
- deployment approval;
- endpoint/credential readiness;
- provider ranking, failover preference or recommendation;
- execution success;
- protected Action permission.

The same exact Capability `id@version` may appear across sources only when canonical Capability serialization is identical. The same exact `bindingRef` may appear across sources only when canonical Hosted binding serialization is identical. Divergence fails closed; there is no source priority, majority vote, implicit latest or silent fallback winner.

Identical supply repeated across sources aggregates `sourceId` provenance only. Repetition never becomes trust/confidence/priority evidence.

Hosted supply accepts only canonical `query` Capabilities. A canonical `action` Capability fails with `ACTION_BOUNDARY_REQUIRED`; protected effects stay behind the Action Boundary.

`capability-supply` does not invoke providers and owns no endpoints, credentials, health checks, deployment placement, durable jobs, autoscaling, cloud scheduling, commercial pricing or security decisions.

## Provider authority

Providers implement/bind functionality. They are never Vira canonical semantic owners merely because they expose an API, MCP server, SDK, model, SaaS integration or hosted execution environment.

A provider binding must map to a provider-neutral Capability/Action contract and fail explicitly if the mapping is lossy or unsupported.

## Resolution precedence

For execution, authority is evaluated in this order conceptually:

```text
Application exact release
      ↓
exact semantic dependency references
      ↓
Application / Capability discovery where needed
      ↓
canonical registry/resolver/deployment authorities
      ↓
commercial entitlement / metering / pricing / settlement evidence where commercially required
      ↓
enterprise scope + governance / authorization where required
      ↓
exact hosted Capability binding + hosted query runtime OR Experience runtime / host
      ↓
Action Boundary for protected effects
```

Commercial settlement allocation may occur downstream of pricing as economic evidence, but it neither proves payment nor changes the security order above. Discovery can surface exact candidate supply, but it cannot select around a later denial or convert provenance into security/runtime authority. An upstream composition, commercial layer or hosted provider binding cannot overrule a downstream security/execution authority. Hosted query execution is not an alternate path around protected Action execution. Monetary validity is never execution permission.

## Failure rule

Ambiguous, missing, stale, conflicting, unapproved, incompatible or untrusted authority resolution fails closed. A higher-level Application declaration, discovered Capability supply, entitlement, commercial usage rating, pricing quote, settlement allocation or hosted binding cannot convert an underlying denial/failure into success.
