# EOBS-001 — Experience Observability semantic contract

## Status

Planned from authoritative `main` `6095198f8d0abad26b31774e66dccc0051d1393f`.

This PR is independent from Design System Compiler and the open Studio product-completion branches. It must not import from any unmerged branch.

## Reverse-engineering baseline

The repository already has a provider-neutral `@vira-enterprise-genui/telemetry` package with:

- a canonical `TelemetryEvent` v1 contract;
- fail-closed `createTelemetryEvent()` validation;
- fixed source/kind/outcome enums;
- canonical caller-supplied UTC timestamps;
- bounded optional duration;
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

Point-in-time events:

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

Performance checkpoint:

- `experience.interactive` → performance / success, requires `durationMs`

The v1 taxonomy deliberately excludes Pack, Policy Engine, Marketplace, conversion and abandonment events so those future systems are not standardized before their contracts exist.

## Input contract

`createExperienceObservation(input)` accepts only:

- `name`: one of the closed v1 Experience observation names;
- `source`: an existing canonical `TelemetrySource`, representing the component that observed the occurrence;
- `occurredAt`: canonical timestamp delegated to telemetry validation;
- `durationMs`: allowed only when the semantic definition requires it.

Callers cannot override telemetry `kind`, `outcome` or version.

## Fail-closed rules

Reject:

- unknown observation names;
- unknown fields;
- arbitrary attributes/context/payload/body/message/prompt;
- tenant/user/session/trace/span identifiers;
- duration on point-in-time events;
- missing duration on `experience.interactive`;
- invalid source/timestamp/duration via the existing telemetry validator;
- accessor-backed or symbol-backed input state without executing accessors.

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
4. Unknown/raw-content/context/identifier fields fail closed.
5. Caller cannot override kind/outcome/version.
6. Point-in-time events reject duration.
7. `experience.interactive` requires a valid telemetry duration.
8. Invalid source/timestamp/duration errors remain canonical telemetry validation failures.
9. Accessor-backed input is rejected without invoking getters.
10. Output remains immutable.
11. Package boundary checker allows only `telemetry`.
12. No changes to existing telemetry production files.

## Merge gate

Before merge:

1. reverse-engineering/QC pass on final diff;
2. PR must be current with latest authoritative `main`;
3. user runs local repository CI on the exact PR head;
4. all review findings resolved with regression coverage where appropriate;
5. final diff/dependency/security/secret/overlap review;
6. squash merge only after final PASS.
