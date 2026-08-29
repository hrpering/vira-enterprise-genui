# Telemetry exporter port

The exporter port is a provider-neutral lifecycle boundary inspired by mature telemetry exporter designs, while remaining independent of OpenTelemetry or any vendor SDK.

```text
validated TelemetryEvent batch
        |
        v
TelemetryExporterPort
  exportBatch()
  flush()
  shutdown()
        |
        v
host/vendor exporter implementation
```

Port creation snapshots the three required data methods without invoking them. Class instances are supported and method calls preserve the original provider object as `this`, so provider-owned internal state can evolve while later method replacement cannot silently change the trusted boundary.

All operations normalize to `Promise<TelemetryExporterOperationResult>`. Provider return payloads are discarded. Synchronous throws and asynchronous rejections are converted to a generic `PROVIDER_FAILURE` machine result with only the operation name; raw provider error text is not surfaced through the Telemetry API.

The port does not validate events, create batches, queue data, retry, perform network I/O itself, or manage idempotent shutdown state. Those orchestration responsibilities belong to the telemetry channel/lifecycle layer.

There is no OpenTelemetry runtime dependency. A future adapter may map this port to OpenTelemetry, OTLP, a first-party collector, or an enterprise-specific telemetry system without changing the canonical event contract.
