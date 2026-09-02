# Vira Enterprise GenUI Architecture

## Purpose

This document freezes the architectural boundaries that later MASTER phases build on. It distinguishes **current implemented owners** from **target architecture** so roadmap concepts are not mistaken for existing runtime guarantees.

## Product boundary

Vira owns the governed transition from an AI- or user-proposed experience into a trusted application action.

```text
AI / external system
        ↓
normalized input
        ↓
canonical Vira Experience
        ↓
host renders trusted components
        ↓
user / agent proposes action
        ↓
Vira Action Boundary
        ↓
trusted enterprise adapter
        ↓
application side effect
```

Vira does not require ownership of the model, agent framework, customer backend, policy language, or transport protocol.

## Current canonical artifacts

### `StudioExperienceDocument`

Current owner: `@vira-enterprise-genui/studio-schema`.

It is the persisted semantic authoring document. Its current v1 structure owns views, component references, props, bindings, interactions, routes and payload bindings.

It is not a renderer tree tied to React, SwiftUI or Compose.

### `StudioPublication`

Current owner path: `studio-publish` plus the existing Studio compiler/binding/design/flow gates.

A publication is the canonical approved runtime artifact produced from the authored document and its approved catalogs/contracts. Manual authoring and Studio authoring must converge on this same path.

### Experience Pack

Current owner: `@vira-enterprise-genui/experience-packs`.

A Pack is a bounded distribution envelope around approved artifacts and entrypoints. It must never become a second Experience document, compiler, or executable plugin format.

### Experience Registry

Current owner: `@vira-enterprise-genui/experience-registry`.

Registry owns canonical Pack membership and exact `id + version` lookup. It does not own Pack field semantics, artifact transport, execution, or marketplace ranking.

### Runtime state and actions

Current owner: `@vira-enterprise-genui/runtime-core` for the original runtime model and the canonical Studio runtime packages for Studio publication execution.

`runtime-core` already separates actions, permissions, lifecycle, patches, reducer and state. State transitions are deterministic and illegal transitions fail closed.

### Studio host boundary

Current owners: `studio-host` and `studio-host-runtime`.

The host provides versioned snapshots and dispatches approved action descriptors. The adapter currently enforces monotonic accepted snapshot revisions and duplicate-action forwarding protection for a runtime session.

These guarantees are important inputs to the future Vira Action Boundary, but they do not yet constitute the complete enterprise identity/policy/approval/idempotency contract described for MASTER-08.

## Current supporting owners

- `security` owns canonical security policy syntax/evaluators used by existing enforcement surfaces.
- `policy-engine` currently provides a provider-neutral decision facade over those existing security owners.
- `telemetry` owns the canonical provider-neutral telemetry envelope/channel.
- `experience-observability` maps fixed Experience semantics into telemetry; it does not own storage/export transport.
- `tool-bridge` owns provider-result normalization into canonical external tool results.
- `protocol-gateway` dispatches to existing protocol normalizers; it is not a general protocol runtime.
- `experience-marketplace` owns curated discovery projection over Registry; Registry membership alone does not mean public visibility.
- `tooling/package-boundaries.config.mjs` is the executable workspace dependency allowlist.

## Current data invariant

External model, tool or customer API data must be normalized before it can influence an Experience. Renderers receive validated semantic data and trusted component bindings, never arbitrary raw model/tool payloads.

```text
external payload
    ↓
normalizer / domain adapter
    ↓
canonical data
    ↓
Experience planning/composition or Studio bindings
    ↓
trusted renderer
```

## Current action invariant

Browser/framework events and business actions are separate concepts.

Current flow is conceptually:

```text
platform event
    ↓
registered Experience interaction
    ↓
canonical runtime action
    ↓
permission + lifecycle checks
    ↓
host action bridge
    ↓
customer adapter/backend/tool
```

The runtime must not contain customer API endpoints or arbitrary business networking.

## Target architecture

The target architecture extends the current canonical owners rather than replacing them with parallel schemas.

```text
                       AI / AGENTS
          OpenAI / Claude / Gemini / MCP / other
                             │
                             ▼
                    Protocol Integration
                             │
                             ▼
                  Canonical Vira Experience
                             │
                  StudioPublication / Pack
                             │
                             ▼
                       Deployment
                             │
                             ▼
                    Exact Resolver
                             │
                    capability match
                             │
                 exact Experience instance
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
       Web Host          iOS Native        Android Native
          │                  │                  │
          └──────────────────┼──────────────────┘
                             ▼
                      ActionIntent
                             │
                             ▼
                    Vira Action Boundary
                             │
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
        Identity           Policy          Approval
           └─────────────────┼─────────────────┘
                             ▼
                 revision + idempotency
                             │
                             ▼
                  trusted action adapter
                             │
                             ▼
                    enterprise backend
                             │
                             ▼
                      ActionReceipt
```

## One Experience, multiple hosts

Web, iOS and Android consume the same semantic Experience contract. Platform renderers map registered semantic component identities to trusted platform-native implementations.

The platform implementation is not persisted inside the Experience document.

Forbidden architecture:

```text
Experience.web.json
Experience.ios.json
Experience.android.json
```

Target architecture:

```text
one canonical semantic Experience
              │
      Host Capability Manifest
       ┌──────┼──────┐
       ▼      ▼      ▼
      Web   SwiftUI Compose
```

## Brand integration boundary

Customer/brand-specific definitions belong behind a Brand Integration SDK and approved catalogs/mappings.

A brand may own:

- identity and design tokens;
- semantic components and platform mappings;
- data-source adapters;
- action adapters;
- policies/templates;
- authored Experiences.

Generic Vira packages must not branch on customer or domain names. Pegasus/airline code is a proof/integration concern and is scheduled for external extraction in MASTER-23.

## Resolver boundary

Resolution is exact and explicit.

Target:

```text
exact deployment
  → exact Pack version
  → exact publication
  → host capability compatibility
  → exact instanceId
```

No generic execution path may choose an implicit `latest`, globally active Experience, latest mounted instance, or domain-specific fallback.

## Runtime boundary

`runtime-core` remains platform neutral. Native lifecycle semantics may be modeled in the common kernel, but UIKit/SwiftUI/Android/Compose/browser APIs do not enter `runtime-core`.

Framework/OS hosts adapt platform events and lifecycle into canonical runtime semantics.

## Action boundary

All real side effects eventually cross one common Vira Action Boundary. It owns the target ordering of validation, identity context, policy, approval/challenge, concurrency/idempotency checks, trusted adapter invocation and receipt production.

Individual renderer callbacks, agents, protocol adapters and component implementations do not invoke protected enterprise side effects around this boundary.

See `ACTION_BOUNDARY.md`.

## Governance boundary

Vira may consume external policy/governance/identity systems, but provider decision models do not become the canonical Vira product model.

Adapters translate external decisions into provider-neutral Vira verdicts. Core safety and mandatory validation cannot be disabled by a provider result.

## Artifact and execution boundary

Experience artifacts contain passive, bounded, validated data. Remote arbitrary JavaScript, Swift, Kotlin, HTML or other executable application code is not an Experience distribution mechanism.

Trusted application code comes from the installed brand/host integration and approved native/web component catalogs.

## Secrets boundary

Artifacts and client runtime state may contain only references/identifiers required by an approved integration. Raw credentials and secrets belong to trusted server/control-plane infrastructure and are resolved only where needed by a trusted adapter.

## Deployment and version identities

Do not conflate:

- Experience Pack version;
- Brand Integration version;
- deployment revision;
- runtime instance identity.

A deployment selects exact immutable inputs; an instance identifies one concrete runtime execution context.

## Architecture non-goals

Core Vira is not:

- an arbitrary code hosting platform;
- a general browser-in-an-iframe runtime for native apps;
- a replacement for the customer's backend;
- a general policy language;
- an agent framework;
- a database/message queue;
- a payment system;
- a customer-domain workflow engine hidden inside generic packages.

## Change rule

A later implementation PR that appears to require a second semantic owner must stop and reconcile ownership first. The default answer is to extend or adapt the canonical owner, not copy its schema into a new package.