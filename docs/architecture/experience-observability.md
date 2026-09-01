# Experience Observability

Experience Observability is the semantic layer that names meaningful Vira experience occurrences and maps them into the existing provider-neutral telemetry contract.

It does not own transport, storage, traces, exporters, analytics backends, or a second telemetry event schema.

```text
Experience semantics
        ↓
@vira-enterprise-genui/experience-observability
        ↓
@vira-enterprise-genui/telemetry
        ↓
TelemetryChannel / TelemetryExporterPort
        ↓
provider adapter later
```

## Canonical boundary

`TelemetryEvent` remains the canonical event envelope. Experience Observability owns only a closed semantic definition table and safe construction of those events through `createTelemetryEvent()`.

The observing subsystem remains the telemetry `source`. Experience Observability does not introduce itself as a new telemetry source because that would hide where an occurrence was actually observed.

## V1 privacy posture

The semantic layer carries no arbitrary attributes or raw payloads. In particular it does not accept prompts, messages, user IDs, tenant IDs, session IDs, trace IDs, span IDs, URLs, or arbitrary context objects.

This preserves the existing telemetry boundary where unknown fields are rejected.

## V1 event model

Most Experience events are checkpoints or state changes and therefore do not accept durations. `experience.interactive` is the one v1 performance checkpoint and requires a bounded `durationMs`, representing elapsed time to the interactive checkpoint.

Long-running operations and richer correlation should be modeled by a future explicit tracing/telemetry evolution rather than hidden inside this semantic wrapper.

## Provider neutrality

OpenTelemetry is an interoperability target, not a core dependency. A later adapter can translate canonical Vira telemetry into OpenTelemetry signals without changing Experience semantic names or making provider APIs part of Vira's canonical contract.
