# Vira Enterprise GenUI Platform Model

## Purpose

Web, iOS and Android are equal product surfaces in the Vira architecture. Native support is not a later wrapper around a web-only semantic contract.

This document defines the cross-platform invariants that MASTER-02 through MASTER-19 must preserve.

## One semantic Experience

Vira persists one platform-neutral semantic Experience.

Current canonical source:

```text
StudioExperienceDocument
        ↓
StudioPublication
```

Future interoperability/codegen may create platform-native models for this same contract, but it must not create three independent authoring schemas.

Forbidden:

```text
experience.web.json
experience.ios.json
experience.android.json
```

Required:

```text
canonical Experience
        │
        ├── Web host mapping
        ├── iOS host mapping
        └── Android host mapping
```

## Semantic components, native implementations

An Experience references semantic component identities, not implementation source code.

Example target concept:

```text
brand.primaryButton
    ├── web     → trusted React/DOM implementation
    ├── ios     → trusted SwiftUI implementation
    └── android → trusted Compose implementation
```

The component's semantic purpose, props, events and accessibility meaning are part of the shared contract. Layout or interaction details may adapt to platform conventions when they preserve those semantics.

## Native means native

A production Vira native Experience target is not defined as a WebView containing the web renderer.

MASTER-07B and MASTER-07C target:

- Swift/SwiftUI on iOS;
- Kotlin/Compose on Android;
- native platform lifecycle integration;
- native accessibility semantics;
- native host component/action registries.

Native Vira Experiences do not require a JavaScript runtime or WebView.

A separately labeled web-compatibility surface may exist for external HTML-based protocols, but that is not equivalent to a native Vira Experience and must not be silently upgraded or represented as one.

## Current implementation status

Today the repository is web-first in implementation:

- `runtime-web` owns DOM/browser rendering for the original runtime;
- `react` and `web-component` wrap that runtime;
- `genui` and `genui-web-component` expose the public Studio publication/runtime path on web;
- Studio runtime React rendering is implemented;
- iOS and Android native SDKs described by the master plan are not yet implemented.

MASTER-01 does not change this code. It freezes the requirement that future architecture work must not make the existing web implementation the semantic definition of the product.

## Common Host Contract — target

All first-class hosts report compatible information through one platform-neutral host contract.

A host is responsible for:

- platform identity/version;
- supported semantic components and versions/capabilities;
- supported action/data capabilities;
- lifecycle state;
- renderer/action registry bindings;
- telemetry bridge;
- verified cached-artifact support where applicable.

Platform-specific handles such as DOM nodes, UIKit objects or Android `Context` do not enter the canonical Experience schema or `runtime-core`.

## Host Capability Manifest — target

Before runtime mount, the resolver/host combination evaluates whether the exact Experience can run safely on that host.

Conceptually:

```text
Experience requirements
        +
Host Capability Manifest
        ↓
compatible / incompatible
```

Incompatible behavior is explicit:

1. fail closed; or
2. use an author-declared compatible fallback whose semantics were validated.

An agent cannot invent a fallback component or omit a required interaction because the current device lacks support.

## Capability identity

Capability identity must be deterministic and version-aware enough to avoid accidental compatibility from matching names alone.

Later phase design may distinguish:

- platform capability;
- component semantic version/capability;
- action capability;
- offline/cache capability;
- accessibility/localization capability.

MASTER-04 owns the exact contract. MASTER-01 only freezes the requirement.

## Runtime kernel boundary

`runtime-core` remains platform neutral.

It may model shared lifecycle concepts but not call platform APIs directly.

Target common lifecycle concepts include:

- foreground;
- background;
- resume;
- disconnect;
- reconnect;
- session restore;
- verified cached Experience activation.

Adapters translate:

```text
browser / UIKit / Android lifecycle
              ↓
canonical lifecycle semantics
              ↓
runtime kernel
```

## State and revision semantics

A cross-platform Experience must not develop separate truth stores per renderer.

Current architecture already treats runtime state as canonical and Studio host snapshots as revisioned. Native hosts must reuse the same semantic state/revision rules rather than introduce a competing Swift/Kotlin state machine that changes action meaning.

Local UI-only presentation state is allowed when it does not become enterprise semantic state or bypass canonical actions.

## Action semantics across platforms

The same user intent on web, iOS and Android must produce semantically equivalent canonical action input.

Example target invariant:

```text
select-flight on Web
select-flight on iOS
select-flight on Android
          ↓
same semantic action type/payload contract
          ↓
same Action Boundary
```

Platform events (`click`, gesture, accessibility action) are adapters. They are not the business action contract.

## Instance isolation

Each mounted Experience has an exact instance identity.

No host may route a command/action through:

- last rendered Experience;
- active tab global;
- latest mounted instance;
- current domain singleton.

Resolver and action routing use explicit instance identity.

## Offline and reconnect — target

Native clients may cache verified passive Experience artifacts and restore UI state according to explicit policy.

Offline support does not imply offline permission to execute every action.

On reconnect:

- artifact integrity is re-established where necessary;
- relevant deployment/version validity is checked according to policy;
- stale expected revisions fail closed for protected mutations;
- retries use idempotency semantics rather than blind replay.

## Platform-specific adaptation

A renderer may adapt presentation to platform conventions without changing core semantics.

Acceptable examples:

- native navigation affordances;
- system date/time pickers;
- platform typography metrics;
- touch target sizing;
- keyboard/IME integration.

Not acceptable without a contract-level fallback:

- dropping a required action;
- changing a required field into optional;
- silently substituting a different business operation;
- rendering an unsupported arbitrary component;
- bypassing approval because a platform lacks an approval UI.

## Accessibility semantics

Cross-platform conformance includes accessibility meaning, not visual screenshot parity.

Targets:

- web: keyboard, ARIA, screen-reader behavior;
- iOS: VoiceOver, Dynamic Type, native focus/traits and HIG-consistent behavior;
- Android: TalkBack, font scaling, Compose semantics and native focus behavior.

Semantic component definitions must carry enough information for each host to expose equivalent meaning.

## Localization semantics

Locale-sensitive values are semantic data with platform-native formatting, not preformatted opaque strings when that would destroy correctness.

Later phases must account for:

- locale;
- RTL;
- currency;
- date/time/time zone;
- number formatting;
- pluralization where relevant.

## Preview model — target

Studio supports two levels:

### Fast preview

A web-based semantic approximation for authoring speed.

### Real preview

The exact published preview artifact runs in the actual iOS simulator/test host or Android emulator/test host.

A resized browser viewport is not sufficient proof of native compatibility.

## Cross-platform conformance gate

MASTER-18 will verify semantic parity using shared fixtures. Required checks include:

- component interpretation;
- bindings and state;
- navigation/routes;
- action type and payload;
- policy invocation context;
- revision behavior;
- lifecycle behavior;
- accessibility metadata;
- outcome semantics.

Visual snapshots may supplement this suite but cannot replace semantic assertions.

## Platform change rule

Any proposal that requires forking the persisted Experience schema to ship a new platform feature must first prove that the feature cannot be represented as a host capability, semantic component mapping, author-declared fallback or platform adapter. Schema forking is the last option and contradicts the default architecture.