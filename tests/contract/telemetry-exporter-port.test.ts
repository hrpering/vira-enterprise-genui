import { describe, expect, it } from "vitest";
import {
  createTelemetryEvent,
  createTelemetryExporterPort,
} from "../../packages/telemetry/src/index.js";
import type { TelemetryEvent } from "../../packages/telemetry/src/index.js";

function telemetryEvent(): TelemetryEvent {
  const result = createTelemetryEvent({
    version: "1",
    name: "runtime.mount.completed",
    source: "runtime-web",
    kind: "lifecycle",
    outcome: "success",
    occurredAt: "2026-08-29T05:20:00.000Z",
    durationMs: 10,
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

describe("telemetry exporter port", () => {
  it("supports class instances without executing exporter methods during port creation", async () => {
    class Exporter {
      readonly log: string[] = [];

      exportBatch(events: readonly TelemetryEvent[]) {
        this.log.push(`export:${events.length}`);
        return { providerPayload: "ignored" };
      }

      flush() {
        this.log.push("flush");
      }

      async shutdown() {
        this.log.push("shutdown");
      }
    }

    const exporter = new Exporter();
    const created = createTelemetryExporterPort(exporter);
    expect(created.ok).toBe(true);
    expect(exporter.log).toEqual([]);
    if (!created.ok) return;
    expect(Object.isFrozen(created.value)).toBe(true);

    expect(await created.value.exportBatch([telemetryEvent()])).toEqual({ ok: true });
    expect(await created.value.flush()).toEqual({ ok: true });
    expect(await created.value.shutdown()).toEqual({ ok: true });
    expect(exporter.log).toEqual(["export:1", "flush", "shutdown"]);
  });

  it("snapshots trusted methods while preserving provider instance state as this", async () => {
    const log: string[] = [];
    const exporter = {
      prefix: "original",
      exportBatch() { log.push(`${this.prefix}:export`); },
      flush() { log.push(`${this.prefix}:flush`); },
      shutdown() { log.push(`${this.prefix}:shutdown`); },
    };
    const created = createTelemetryExporterPort(exporter);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    exporter.exportBatch = () => { log.push("replacement:export"); };
    exporter.flush = () => { log.push("replacement:flush"); };
    exporter.shutdown = () => { log.push("replacement:shutdown"); };
    exporter.prefix = "state-updated";

    await created.value.exportBatch([telemetryEvent()]);
    await created.value.flush();
    await created.value.shutdown();
    expect(log).toEqual([
      "state-updated:export",
      "state-updated:flush",
      "state-updated:shutdown",
    ]);
  });

  it("rejects getter-backed required methods without executing getters", () => {
    let reads = 0;
    const exporter: Record<string, unknown> = {
      exportBatch() {},
      shutdown() {},
    };
    Object.defineProperty(exporter, "flush", {
      enumerable: true,
      get() {
        reads += 1;
        return () => undefined;
      },
    });

    expect(createTelemetryExporterPort(exporter)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_FLUSH_METHOD", path: "$.flush" },
    });
    expect(reads).toBe(0);
  });

  it("normalizes sync throws and async rejections to machine failures without leaking provider errors", async () => {
    const created = createTelemetryExporterPort({
      exportBatch() {
        throw new Error("SECRET_EXPORT_FAILURE");
      },
      async flush() {
        throw new Error("SECRET_FLUSH_FAILURE");
      },
      shutdown() {
        return Promise.reject(new Error("SECRET_SHUTDOWN_FAILURE"));
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(await created.value.exportBatch([telemetryEvent()])).toEqual({
      ok: false,
      code: "PROVIDER_FAILURE",
      operation: "export",
    });
    expect(await created.value.flush()).toEqual({
      ok: false,
      code: "PROVIDER_FAILURE",
      operation: "flush",
    });
    expect(await created.value.shutdown()).toEqual({
      ok: false,
      code: "PROVIDER_FAILURE",
      operation: "shutdown",
    });
  });

  it("fails closed when any required lifecycle method is missing or non-callable", () => {
    expect(createTelemetryExporterPort(null)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_EXPORTER", path: "$" },
    });
    expect(createTelemetryExporterPort({ flush() {}, shutdown() {} })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_EXPORT_METHOD", path: "$.exportBatch" },
    });
    expect(createTelemetryExporterPort({ exportBatch() {}, flush: true, shutdown() {} })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_FLUSH_METHOD", path: "$.flush" },
    });
    expect(createTelemetryExporterPort({ exportBatch() {}, flush() {}, shutdown: "later" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_SHUTDOWN_METHOD", path: "$.shutdown" },
    });
  });
});
