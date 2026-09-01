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

The semantic layer carries no arbitrary attributes or raw payloads. In particular it does not accept prompts, messages, user IDs, tenant IDs, session IDs, trace IDs, span IDs, URLs, arbitrary context objects, or caller-defined property names.

Rejected unknown keys are not echoed into validation paths or messages. This avoids turning validation logs into an accidental content channel.

## V1 event model

Every EOBS v1 semantic is a point-in-time occurrence or state transition. The package does not accept `durationMs`.

A previous draft included `experience.interactive` as a duration-bearing performance checkpoint. Final review rejected that design because the repository has no canonical correlation/span contract that defines a single comparable start milestone. Performance duration semantics are therefore deferred until an explicit tracing/correlation contract exists.

Long-running operations and latency measurements should be modeled by that future tracing/telemetry evolution rather than hidden inside this semantic wrapper.

## Provider neutrality

OpenTelemetry is an interoperability target, not a core dependency. A later adapter can translate canonical Vira telemetry into OpenTelemetry signals without changing Experience semantic names or making provider APIs part of Vira's canonical contract.
