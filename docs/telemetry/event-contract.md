# Telemetry event contract

Telemetry starts with a privacy-first machine envelope rather than an arbitrary logging payload.

```text
caller-owned event facts
        |
        v
createTelemetryEvent
        |
        v
immutable TelemetryEvent
```

The MVP event contains only:

- a bounded lowercase machine event name,
- a fixed package/source identifier,
- a fixed event kind,
- success/failure/neutral outcome,
- a caller-supplied canonical UTC timestamp,
- optional bounded numeric duration.

There is deliberately no prompt, message, payload, user identifier, arbitrary attributes map, trace identifier, domain data, stack trace, or generated timestamp in this contract. Unknown fields fail closed.

`occurredAt` must already be canonical UTC ISO 8601 with millisecond precision (`YYYY-MM-DDTHH:mm:ss.sssZ`). The Telemetry package does not read the clock or generate correlation IDs. This keeps event creation deterministic and makes time/identity ownership explicit at the integration boundary.

The event envelope is provider-neutral. Exporter/provider lifecycle belongs to a later contract and must not change the event schema.
