# Vira Enterprise GenUI Platform Model

## Purpose

Web, iOS and Android are equal first-class product surfaces. One platform-neutral semantic Experience is rendered through trusted platform implementations; no platform owns a forked business-semantic schema.

The integrated repository contains Web runtime/host surfaces plus native SDK source under `sdk/ios` and `sdk/android`. Portable/native conformance and simulator/emulator gates have been part of the Enterprise GenUI release program; MASTER-25R must re-bind final release evidence to the exact post-CLEAN-00 `main` SHA.

## One semantic Experience

Canonical authoring/publication path:

```text
StudioExperienceDocument
        ↓
StudioPublication
        ↓
exact Pack / deployment / resolver
        ↓
Web / iOS / Android host mapping
```

Forbidden:

```text
experience.web.json
experience.ios.json
experience.android.json
```

Platform-native models/adapters may project the same semantics but do not become independent authoring authorities.

## Semantic components, native implementations

An Experience references approved semantic component identities and contracts, not implementation source code.

```text
semantic component
    ├── web     → trusted web implementation
    ├── ios     → trusted Swift/SwiftUI implementation
    └── android → trusted Kotlin/Compose implementation
```

Semantic purpose, bounded props/events/action meaning and accessibility meaning are shared. Presentation adapts to platform conventions only when semantics remain equivalent.

## Native means native

A first-class native Vira Experience is not defined as a WebView containing the web renderer. A separately labeled HTML/protocol compatibility surface may exist, but it is not silently represented as native Vira rendering.

Native hosts adapt platform lifecycle/events/accessibility into canonical Vira semantics and registered host component/action mappings.

## Host capability and compatibility

Hosts expose explicit platform/capability support sufficient for deterministic compatibility resolution. Required semantic components/actions/capabilities are checked before execution.

Incompatible behavior is explicit:

1. fail closed; or
2. use an author-declared compatible fallback that is itself validated.

An agent, renderer or resolver may not silently drop required interaction, invent a component or substitute a different business action because a device lacks support.

## Runtime kernel boundary

`runtime-core` remains platform neutral. DOM/UIKit/SwiftUI/Android/Compose handles and APIs do not enter the canonical Experience schema or platform-neutral kernel.

Platform adapters translate lifecycle/event concepts into canonical runtime semantics.

## State and revision

Renderers do not create separate enterprise semantic truth stores. Canonical runtime/host revision semantics remain authoritative; local presentation-only UI state is permitted only when it cannot change protected action meaning or bypass canonical state/action processing.

Host snapshot, runtime state revision, deployment revision and artifact/Pack version are distinct concepts and must not be ambiguously conflated.

## Action parity

Equivalent user intent across Web/iOS/Android produces the same semantic action contract and crosses the same governance/Action Boundary.

```text
platform event
      ↓
registered semantic interaction
      ↓
canonical action / ActionIntent
      ↓
governance + Action Boundary
```

Click/gesture/accessibility actions are platform adapters, not business-action semantics.

## Instance isolation

Every mounted Experience has explicit instance/deployment context. Hosts may not route commands/actions via last rendered Experience, active tab singleton, latest mounted instance or domain-global state.

## Offline, reconnect and cache

Verified passive artifacts may be cached/restored according to explicit policy. Offline rendering does not imply offline permission for every protected action.

Reconnect/retry must preserve artifact/version integrity, relevant deployment validity, revision semantics and idempotency rather than blind side-effect replay.

## Platform adaptation

Allowed when semantics remain equivalent:

- native navigation affordances;
- system pickers and keyboard/IME integration;
- platform typography and layout metrics;
- touch target/focus behavior;
- platform accessibility APIs.

Not allowed as silent adaptation:

- dropping a required action;
- making a required field optional;
- substituting a different business operation;
- rendering unsupported arbitrary executable content;
- bypassing approval/governance because a platform lacks matching UI.

## Accessibility and localization

Cross-platform conformance is semantic, not screenshot equality.

Each platform exposes equivalent accessible meaning using its native mechanisms. Locale-sensitive data should retain semantic representation so hosts can correctly format locale/RTL/currency/date/time/number/pluralization behavior rather than relying on opaque preformatted strings where correctness would be lost.

## Preview and proof

A resized browser is not proof of native compatibility. Native claims require simulator/emulator/device-host evidence against the exact relevant artifact/repository head.

Cross-platform conformance focuses on component interpretation, bindings/state, navigation, action payload/meaning, governance context, revision/lifecycle behavior, accessibility metadata and outcome semantics.

## Application Network extension

Future Canvas/Network work must preserve this platform model. Canvas projection state is not semantic runtime state; Network distribution selects compatible projections/surfaces but does not redefine Experience or execution semantics.

## Platform change rule

A proposal that requires forking the persisted Experience schema for a platform feature must first prove the feature cannot be represented through host capability, semantic component mapping, validated fallback or platform adapter. Schema forking is the last option and contradicts the default architecture.
