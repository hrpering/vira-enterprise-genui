# Telemetry channel lifecycle

The telemetry channel is the minimal orchestration layer between canonical telemetry events and the trusted exporter port.

```text
unknown event input
      |
      v
TelemetryEvent validation
      |
      v
bounded immutable batch
      |
      v
TelemetryChannel
  open -> closing -> closed
      |
      v
TelemetryExporterPort
```

## Admission and validation

`emit()` and `emitBatch()` accept unknown input and revalidate every event through the canonical `TelemetryEvent` contract before exporter code can run. Batch input is bounded to `TELEMETRY_CHANNEL_MAX_BATCH_SIZE`, must be dense, and may not contain accessor-backed indexes, custom properties, or symbol properties. Normalized events are placed into a fresh frozen batch so later caller mutation cannot alter exporter input.

## Concurrency

The MVP channel is deliberately single-flight. It does not create a hidden unbounded queue or background worker. While one export/flush operation is active, another `emit` or `flush` request fails closed with `CHANNEL_BUSY`. Hosts that need throughput should submit an explicit bounded batch.

## Shutdown

The first `shutdown()` call moves the channel to `closing` immediately, so no new events are admitted. Any already accepted single-flight operation is allowed to finish. The channel then invokes exporter `flush()` followed by exporter `shutdown()` exactly once. Shutdown is idempotent and subsequent calls reuse the same result.

Exporter cleanup is attempted even if flush fails. After shutdown finishes, channel state is `closed` regardless of provider success so failed provider cleanup cannot reopen telemetry admission or create implicit retries.

## Failure boundary

Provider failures are represented only as generic `PROVIDER_FAILURE` plus the exporter operation name. Raw provider return payloads, exceptions, messages, stack traces, endpoints, credentials, prompts, user identifiers, and domain payloads are never added by the channel.

The channel performs no network I/O itself, has no retry/backoff policy, uses no hidden clock or generated identifiers, and has no OpenTelemetry/vendor runtime dependency.
