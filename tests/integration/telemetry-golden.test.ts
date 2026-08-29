import { describe, expect, it } from "vitest";
import {
  createTelemetryChannel,
  createTelemetryEvent,
} from "../../packages/telemetry/src/index.js";
import type { TelemetryEvent } from "../../packages/telemetry/src/index.js";

const occurredAt = "2026-08-29T06:30:00.000Z";

function canonicalEvent() {
  return {
    version: "1",
    name: "runtime.mount.completed",
    source: "runtime-web",
    kind: "lifecycle",
    outcome: "success",
    occurredAt,
    durationMs: 12,
  } as const;
}

describe("Telemetry golden integration", () => {
  it("preserves caller-owned canonical data through an immutable export snapshot and deterministic shutdown", async () => {
    const calls: string[] = [];
    const received: (readonly TelemetryEvent[])[] = [];
    const created = createTelemetryChannel({
      exportBatch(events: readonly TelemetryEvent[]) {
        calls.push("export");
        received.push(events);
      },
      flush() {
        calls.push("flush");
      },
      shutdown() {
        calls.push("shutdown");
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(await created.value.emit(canonicalEvent())).toEqual({ ok: true });
    expect(received).toHaveLength(1);
    expect(received[0]).toHaveLength(1);
    expect(received[0]?.[0]?.occurredAt).toBe(occurredAt);
    expect(Object.isFrozen(received[0])).toBe(true);
    expect(Object.isFrozen(received[0]?.[0])).toBe(true);

    expect(await created.value.shutdown()).toEqual({ ok: true });
    expect(created.value.getState()).toBe("closed");
    expect(calls).toEqual(["export", "flush", "shutdown"]);
    expect(await created.value.emit(canonicalEvent())).toEqual({
      ok: false,
      code: "CHANNEL_CLOSED",
      operation: "emit",
    });
  });

  it("rejects non-contract sensitive payload fields before exporter code can observe them", async () => {
    let exportCalls = 0;
    const created = createTelemetryChannel({
      exportBatch() {
        exportCalls += 1;
      },
      flush() {},
      shutdown() {},
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await created.value.emit({
      ...canonicalEvent(),
      prompt: "SECRET_PROMPT_MUST_NOT_REACH_PROVIDER",
      userId: "SECRET_USER_ID",
      payload: { domain: "SECRET_DOMAIN_PAYLOAD" },
    });

    expect(result).toMatchObject({
      ok: false,
      code: "INVALID_EVENT",
      operation: "emit",
      index: 0,
    });
    expect(exportCalls).toBe(0);
  });

  it("reduces provider exceptions to operation-level failure without leaking provider details", async () => {
    const created = createTelemetryChannel({
      exportBatch() {
        throw new Error("SECRET_PROVIDER_ENDPOINT api-key=never-leak");
      },
      flush() {},
      shutdown() {},
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await created.value.emit(canonicalEvent());
    expect(result).toEqual({
      ok: false,
      code: "PROVIDER_FAILURE",
      operation: "export",
    });
    expect(JSON.stringify(result)).not.toContain("SECRET_PROVIDER_ENDPOINT");
    expect(JSON.stringify(result)).not.toContain("never-leak");
  });

  it("keeps the standalone event contract strict and deterministic", () => {
    const first = createTelemetryEvent(canonicalEvent());
    const second = createTelemetryEvent(canonicalEvent());
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.value).toEqual(second.value);
    expect(first.value.occurredAt).toBe(occurredAt);
    expect(Object.isFrozen(first.value)).toBe(true);
  });
});
