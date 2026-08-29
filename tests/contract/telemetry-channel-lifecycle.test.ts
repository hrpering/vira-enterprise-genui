import { describe, expect, it } from "vitest";
import {
  TELEMETRY_CHANNEL_MAX_BATCH_SIZE,
  createTelemetryChannel,
  createTelemetryEvent,
} from "../../packages/telemetry/src/index.js";
import type { TelemetryEvent } from "../../packages/telemetry/src/index.js";

function event(name = "runtime.mount.completed"): TelemetryEvent {
  const parsed = createTelemetryEvent({
    version: "1",
    name,
    source: "runtime-web",
    kind: "lifecycle",
    outcome: "success",
    occurredAt: "2026-08-29T06:00:00.000Z",
  });
  if (!parsed.ok) throw new Error(parsed.issue.message);
  return parsed.value;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe("telemetry channel lifecycle", () => {
  it("validates and exports canonical event batches without retaining caller batch state", async () => {
    const received: (readonly TelemetryEvent[])[] = [];
    const exporter = {
      exportBatch(events: readonly TelemetryEvent[]) {
        received.push(events);
      },
      flush() {},
      shutdown() {},
    };
    const created = createTelemetryChannel(exporter);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(Object.isFrozen(created.value)).toBe(true);
    expect(created.value.getState()).toBe("open");

    const callerBatch = [event()];
    expect(await created.value.emitBatch(callerBatch)).toEqual({ ok: true });
    callerBatch.push(event("runtime.mount.second"));

    expect(received).toHaveLength(1);
    expect(received[0]).toHaveLength(1);
    expect(Object.isFrozen(received[0])).toBe(true);
    expect(await created.value.flush()).toEqual({ ok: true });
  });

  it("fails closed on invalid, sparse, accessor-backed, custom, empty, or oversized batches", async () => {
    let getterReads = 0;
    let exportCalls = 0;
    const created = createTelemetryChannel({
      exportBatch() { exportCalls += 1; },
      flush() {},
      shutdown() {},
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(await created.value.emitBatch([])).toMatchObject({ ok: false, code: "INVALID_BATCH" });
    expect(await created.value.emitBatch(new Array(2))).toMatchObject({ ok: false, code: "INVALID_BATCH" });

    const accessorBatch: unknown[] = [];
    Object.defineProperty(accessorBatch, "0", {
      enumerable: true,
      get() {
        getterReads += 1;
        return event();
      },
    });
    accessorBatch.length = 1;
    expect(await created.value.emitBatch(accessorBatch)).toMatchObject({ ok: false, code: "INVALID_BATCH" });
    expect(getterReads).toBe(0);

    const customBatch = [event()] as unknown[] & { extra?: boolean };
    customBatch.extra = true;
    expect(await created.value.emitBatch(customBatch)).toMatchObject({ ok: false, code: "INVALID_BATCH" });

    const oversized = Array.from({ length: TELEMETRY_CHANNEL_MAX_BATCH_SIZE + 1 }, () => event());
    expect(await created.value.emitBatch(oversized)).toMatchObject({ ok: false, code: "INVALID_BATCH" });

    expect(await created.value.emit({
      version: "1",
      name: "Runtime.Invalid.Case",
      source: "runtime-web",
      kind: "lifecycle",
      outcome: "success",
      occurredAt: "2026-08-29T06:00:00.000Z",
    })).toMatchObject({
      ok: false,
      code: "INVALID_EVENT",
      operation: "emit",
      index: 0,
      issue: { code: "INVALID_NAME", path: "$.name" },
    });

    expect(exportCalls).toBe(0);
  });

  it("contains hostile reflection traps at the channel boundary", async () => {
    let exportCalls = 0;
    const created = createTelemetryChannel({
      exportBatch() { exportCalls += 1; },
      flush() {},
      shutdown() {},
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const trappedBatch = new Proxy([event()], {
      ownKeys() {
        throw new Error("SECRET_BATCH_TRAP");
      },
    });
    expect(await created.value.emitBatch(trappedBatch)).toEqual({
      ok: false,
      code: "INVALID_BATCH",
      operation: "emit",
    });

    const trappedEvent = new Proxy(event(), {
      getPrototypeOf() {
        throw new Error("SECRET_EVENT_TRAP");
      },
    });
    expect(await created.value.emit(trappedEvent)).toEqual({
      ok: false,
      code: "INVALID_BATCH",
      operation: "emit",
    });
    expect(exportCalls).toBe(0);
  });

  it("uses bounded single-flight behavior instead of building an implicit operation queue", async () => {
    const first = deferred<void>();
    let exportCalls = 0;
    const created = createTelemetryChannel({
      async exportBatch() {
        exportCalls += 1;
        await first.promise;
      },
      flush() {},
      shutdown() {},
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const accepted = created.value.emit(event());
    expect(await created.value.emit(event("runtime.mount.concurrent"))).toEqual({
      ok: false,
      code: "CHANNEL_BUSY",
      operation: "emit",
    });
    expect(await created.value.flush()).toEqual({
      ok: false,
      code: "CHANNEL_BUSY",
      operation: "flush",
    });
    expect(exportCalls).toBe(1);

    first.resolve();
    expect(await accepted).toEqual({ ok: true });
    expect(await created.value.emit(event("runtime.mount.after"))).toEqual({ ok: true });
    expect(exportCalls).toBe(2);
  });

  it("closes admission immediately, waits for accepted work, then flushes and shuts down exactly once", async () => {
    const first = deferred<void>();
    const calls: string[] = [];
    const created = createTelemetryChannel({
      async exportBatch() {
        calls.push("export:start");
        await first.promise;
        calls.push("export:end");
      },
      flush() { calls.push("flush"); },
      shutdown() { calls.push("shutdown"); },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const accepted = created.value.emit(event());
    const shutdownOne = created.value.shutdown();
    const shutdownTwo = created.value.shutdown();

    expect(shutdownTwo).toBe(shutdownOne);
    expect(created.value.getState()).toBe("closing");
    expect(await created.value.emit(event("runtime.mount.late"))).toEqual({
      ok: false,
      code: "CHANNEL_CLOSED",
      operation: "emit",
    });
    expect(calls).toEqual(["export:start"]);

    first.resolve();
    expect(await accepted).toEqual({ ok: true });
    expect(await shutdownOne).toEqual({ ok: true });
    expect(created.value.getState()).toBe("closed");
    expect(calls).toEqual(["export:start", "export:end", "flush", "shutdown"]);
    expect(await created.value.shutdown()).toEqual({ ok: true });
    expect(calls).toEqual(["export:start", "export:end", "flush", "shutdown"]);
  });

  it("always attempts shutdown after flush failure and exposes only generic provider operation failure", async () => {
    const calls: string[] = [];
    const created = createTelemetryChannel({
      exportBatch() {},
      flush() {
        calls.push("flush");
        throw new Error("SECRET_FLUSH_FAILURE");
      },
      shutdown() {
        calls.push("shutdown");
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(await created.value.shutdown()).toEqual({
      ok: false,
      code: "PROVIDER_FAILURE",
      operation: "flush",
    });
    expect(calls).toEqual(["flush", "shutdown"]);
    expect(created.value.getState()).toBe("closed");
  });

  it("delegates exporter validation without invoking getter-backed lifecycle methods", () => {
    let reads = 0;
    const exporter: Record<string, unknown> = {
      exportBatch() {},
      shutdown() {},
    };
    Object.defineProperty(exporter, "flush", {
      get() {
        reads += 1;
        return () => undefined;
      },
    });

    expect(createTelemetryChannel(exporter)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_FLUSH_METHOD", path: "$.flush" },
    });
    expect(reads).toBe(0);
  });

  it("contains exporter reflection traps during channel creation", () => {
    const trappedExporter = new Proxy({}, {
      getOwnPropertyDescriptor() {
        throw new Error("SECRET_EXPORTER_TRAP");
      },
    });

    expect(createTelemetryChannel(trappedExporter)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_EXPORTER", path: "$" },
    });
  });
});
