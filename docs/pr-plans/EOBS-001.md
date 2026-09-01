# EOBS-001 — Experience Observability semantic contract

## Status

Rebased onto authoritative `main` `5266db3e56f4c3e2de4a91f3dcb70e3108dbd2d4` after DSC-001 merged.

This PR is independent from Design System Compiler and the open Studio product-completion branches. It must not import from any unmerged branch.

## Reverse-engineering baseline

The repository already has a provider-neutral `@vira-enterprise-genui/telemetry` package with:

- a canonical `TelemetryEvent` v1 contract;
- fail-closed `createTelemetryEvent()` validation;
- fixed source/kind/outcome enums;
- canonical caller-supplied UTC timestamps;
- bounded optional duration at the generic telemetry layer;
- exporter and channel abstractions;
- explicit rejection of arbitrary attributes, payloads, prompts, messages, user IDs and trace IDs.

Therefore Experience Observability must be a semantic layer over telemetry, not telemetry v2.

## Goal

Add a small provider-neutral package that turns a closed Experience semantic taxonomy into the existing `TelemetryEvent` contract.

```text
Experience lifecycle occurrence
        ↓
experience-observability
        ↓
semantic definition lookup
        ↓
existing createTelemetryEvent()
        ↓
existing TelemetryChannel / TelemetryExporterPort
```

## V1 taxonomy

All v1 observations are point-in-time:

- `experience.requested` → lifecycle / neutral
- `experience.planned` → lifecycle / success
- `experience.render.started` → lifecycle / neutral
- `experience.render.completed` → lifecycle / success
- `experience.render.failed` → error / failure
- `experience.action.started` → action / neutral
- `experience.action.completed` → action / success
- `experience.action.denied` → security / failure
- `experience.view.changed` → lifecycle / neutral
- `experience.binding.resolved` → integration / success

The v1 taxonomy deliberately excludes performance-duration, Pack, Policy Engine, Marketplace, conversion and abandonment semantics so those systems are not standardized before their owning correlation/contracts exist.

## Final-review correction

An earlier draft included `experience.interactive` with `durationMs`. That was removed after review because the repository has no canonical start milestone or trace/span correlation contract. Accepting a duration without that boundary would allow incomparable measurements under one semantic name.

EOBS v1 therefore accepts no duration-bearing semantic at all. A later tracing/correlation evolution may introduce performance spans once origin and identity semantics are explicit.

## Input contract

`createExperienceObservation(input)` accepts only:

- `name`: one of the closed v1 Experience observation names;
- `source`: an existing canonical `TelemetrySource`, representing the component that observed the occurrence;
- `occurredAt`: canonical timestamp delegated to telemetry validation.

Callers cannot override telemetry `kind`, `outcome` or version and cannot provide `durationMs` through the typed EOBS v1 input.

## Fail-closed rules

Reject:

- unknown observation names;
- unknown fields;
- arbitrary attributes/context/payload/body/message/prompt;
- tenant/user/session/trace/span identifiers;
- duration fields;
- invalid source/timestamp via the existing telemetry validator;
- accessor-backed or symbol-backed input state without executing accessors.

Unknown rejected property names must not be echoed into validation paths or messages, because property names themselves may contain sensitive/customer content.

## Security/privacy boundary

EOBS-001 must not create a generic attribute bag. The existing telemetry contract intentionally rejects raw content and identifying/context fields. This PR preserves that boundary.

No network, filesystem, persistence, exporter provider, OpenTelemetry SDK or external service dependency is allowed.

## Open-source reconnaissance

OpenTelemetry semantic conventions are design guidance only in EOBS-001. The core package remains provider-neutral.

Relevant principles applied:

- event names are stable, low-cardinality and domain-qualified;
- dynamic values do not appear in event names;
- events represent point-in-time occurrences/state changes/outcomes;
- operations with meaningful duration should generally be represented by spans rather than overloaded event schemas.

An OpenTelemetry adapter may be added later as a separate package after the Vira semantic contract is stable.

## Package boundary

New package:

```text
@vira-enterprise-genui/experience-observability
  → @vira-enterprise-genui/telemetry
```

No other internal dependency is permitted.

## Acceptance tests

1. Every v1 semantic name maps deterministically to the intended telemetry kind/outcome.
2. Produced values are accepted by the existing `createTelemetryEvent()` path.
3. Unknown semantic names fail closed.
4. Unknown/raw-content/context/identifier fields fail closed without echoing arbitrary property names.
5. Caller cannot override kind/outcome/version.
6. `durationMs` is outside the typed and runtime EOBS v1 contract.
7. Invalid source/timestamp errors remain canonical telemetry validation failures.
8. Accessor-backed input is rejected without invoking getters.
9. Output remains immutable.
10. Package boundary checker allows only `telemetry`.
11. Existing TelemetryChannel/exporter accepts mapped output unchanged.
12. No changes to existing telemetry production files.

## Merge gate

Before merge:

1. reverse-engineering/QC pass on final diff;
2. PR must be current with latest authoritative `main`;
3. user runs local repository CI on the exact PR head;
4. all review findings resolved with regression coverage where appropriate;
5. final diff/dependency/security/secret/overlap review;
6. squash merge only after final PASS.
