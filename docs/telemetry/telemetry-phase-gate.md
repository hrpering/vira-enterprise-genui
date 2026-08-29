# Telemetry MVP phase gate

Telemetry is MVP-complete when the public event contract, trusted exporter boundary, and bounded channel lifecycle work together without widening the data surface.

## Golden path

```text
host-owned timestamp + bounded metadata
              |
              v
      TelemetryEvent contract
              |
              v
      TelemetryChannel
       validate + snapshot
              |
              v
      TelemetryExporterPort
              |
              v
       host-owned provider
```

The golden integration gate proves four properties together:

1. Caller-owned canonical event data is preserved exactly and exported as a frozen snapshot.
2. Fields outside the telemetry contract, including prompt/user/domain payload-shaped data, are rejected before exporter code is invoked.
3. Provider exceptions are reduced to generic operation-level failure and do not cross the package boundary.
4. Shutdown deterministically closes admission and performs flush followed by provider shutdown.

## MVP boundary

Telemetry remains provider-neutral and transport-neutral. The package does not create traces automatically, inspect prompts/messages/domain payloads, generate identifiers, read a hidden clock, retry provider calls, create background workers, or persist a queue.

OpenTelemetry/OTLP adapters, sampling, batching workers, retry policy, trace propagation, and vendor exporters are post-MVP integrations owned by explicit host adapters rather than this phase gate.
