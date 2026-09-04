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
| Platform host/render mapping | existing Web/native host/runtime owners | redefine business semantics per platform |
| Application semantic composition | `application-package`, `application-graph` | absorb the authorities listed above |
| Capability semantics | `capability-contract` | let MCP/SaaS/customer/provider bindings define canonical meaning |
| Work Context semantics | `work-context` | treat chat history, prompt dump or user memory as canonical Context |
| Canvas | `application-canvas` family | become runtime, publication, governance or effect authority |
| Network | `application-distribution`, `application-federation` | become runtime/execution/governance authority |
| Entitlement/commercial access | `commercial-entitlement` | be treated as authorization/governance/runtime permission |

## Application authority

The Application owners may canonically own only application-level semantics such as:

- Application identity/release identity;
- semantic graph membership and edges;
- exact dependency references;
- application-level declarations that do not duplicate the referenced owner's payload;
- integrity/provenance binding for the Application release.

They do not own the internals of an Experience, Capability provider, Context implementation, Action execution, policy decision or deployment plane.

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
- expose compatibility/availability/provenance metadata;
- route demand toward resolvable supply.

Network may not:

- change the meaning of the artifact it distributes;
- resolve `latest` implicitly for protected execution;
- bypass enterprise registry/deployment/governance;
- execute a protected effect because distribution succeeded;
- conflate commercial entitlement with authorization.

## Commercial entitlement authority

`commercial-entitlement` may determine only whether one explicitly selected exact Application entitlement reference has a matching commercial grant for the exact Application release, enterprise principal/scope, optional Capability and location selectors. It may return exact plan evidence and declarative `meteringRef + quantity` limits.

`entitled` means **commercial eligibility only**. It is not an authorization, governance approval, runtime permission, deployment approval or protected Action permission. Downstream execution must still independently pass the canonical registry/resolution, enterprise scope, governance, runtime/deployment and Action Boundary gates that apply to that operation.

Commercial entitlement also does not define meter units/windows, count mutable usage, compute remaining quota, rate usage, price invoices or own payment/subscription provider state. Those concerns are separately owned downstream.

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
canonical registry/resolver/deployment authorities
      ↓
commercial entitlement where commercially required
      ↓
enterprise scope + governance
      ↓
runtime / host
      ↓
Action Boundary for protected effects
```

An upstream composition or commercial layer cannot overrule a downstream security/execution authority.

## Failure rule

Ambiguous, missing, stale, unapproved, incompatible or untrusted authority resolution fails closed. A higher-level Application declaration or commercial entitlement cannot convert an underlying denial/failure into success.
