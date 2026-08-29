import { describe, expect, it } from "vitest";
import { createTelemetryEvent } from "../../packages/telemetry/src/index.js";

function event(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    name: "runtime.mount.completed",
    source: "runtime-web",
    kind: "lifecycle",
    outcome: "success",
    occurredAt: "2026-08-29T05:10:00.000Z",
    durationMs: 12.5,
    ...overrides,
  };
}

function eventWithoutDuration() {
  return {
    version: "1",
    name: "runtime.mount.completed",
    source: "runtime-web",
    kind: "lifecycle",
    outcome: "success",
    occurredAt: "2026-08-29T05:10:00.000Z",
  };
}

describe("telemetry event contract", () => {
  it("creates a bounded immutable machine event without generating time or identifiers", () => {
    const result = createTelemetryEvent(event());
    expect(result).toEqual({
      ok: true,
      value: {
        version: "1",
        name: "runtime.mount.completed",
        source: "runtime-web",
        kind: "lifecycle",
        outcome: "success",
        occurredAt: "2026-08-29T05:10:00.000Z",
        durationMs: 12.5,
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.keys(result.value).sort()).toEqual([
      "durationMs",
      "kind",
      "name",
      "occurredAt",
      "outcome",
      "source",
      "version",
    ]);
  });

  it("supports explicit zero duration and omission without materializing undefined", () => {
    const zero = createTelemetryEvent(event({ durationMs: 0 }));
    expect(zero).toMatchObject({ ok: true, value: { durationMs: 0 } });

    const omitted = createTelemetryEvent(eventWithoutDuration());
    expect(omitted.ok).toBe(true);
    if (!omitted.ok) return;
    expect("durationMs" in omitted.value).toBe(false);
  });

  it("rejects raw content and arbitrary attribute surfaces by default", () => {
    for (const [field, value] of [
      ["prompt", "secret prompt"],
      ["message", "customer email"],
      ["payload", { query: "IST" }],
      ["attributes", { userId: "u-1" }],
      ["userId", "u-1"],
    ] as const) {
      expect(createTelemetryEvent({ ...event(), [field]: value })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("requires canonical machine identifiers and fixed owner enums", () => {
    for (const name of ["", "Runtime.Mount", "runtime mount", "runtime_mount", ".runtime"]) {
      expect(createTelemetryEvent(event({ name }))).toMatchObject({
        ok: false,
        issue: { code: "INVALID_NAME", path: "$.name" },
      });
    }
    expect(createTelemetryEvent(event({ source: "customer-a" }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_SOURCE", path: "$.source" },
    });
    expect(createTelemetryEvent(event({ kind: "debug" }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_KIND", path: "$.kind" },
    });
    expect(createTelemetryEvent(event({ outcome: "warning" }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_OUTCOME", path: "$.outcome" },
    });
  });

  it("requires caller-supplied canonical UTC millisecond timestamps", () => {
    for (const occurredAt of [
      "2026-08-29T05:10:00Z",
      "2026-08-29T08:10:00.000+03:00",
      "2026-02-30T05:10:00.000Z",
      "now",
    ]) {
      expect(createTelemetryEvent(event({ occurredAt }))).toMatchObject({
        ok: false,
        issue: { code: "INVALID_OCCURRED_AT", path: "$.occurredAt" },
      });
    }
  });

  it("rejects invalid and accessor-backed duration without executing getters", () => {
    for (const durationMs of [-1, Number.POSITIVE_INFINITY, Number.NaN, 604_800_001, "10"]) {
      expect(createTelemetryEvent(event({ durationMs }))).toMatchObject({
        ok: false,
        issue: { code: "INVALID_DURATION", path: "$.durationMs" },
      });
    }

    let reads = 0;
    const input = event();
    Object.defineProperty(input, "durationMs", {
      enumerable: true,
      get() {
        reads += 1;
        return 10;
      },
    });
    expect(createTelemetryEvent(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_DURATION", path: "$.durationMs" },
    });
    expect(reads).toBe(0);
  });

  it("rejects symbol and unknown configuration state", () => {
    const symbolInput = event();
    Object.defineProperty(symbolInput, Symbol("secret"), { value: "hidden" });
    expect(createTelemetryEvent(symbolInput)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$" },
    });

    expect(createTelemetryEvent({ ...event(), traceId: "abc" })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.traceId" },
    });
  });
});
