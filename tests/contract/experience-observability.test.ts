import { describe, expect, it } from "vitest";
import { createTelemetryEvent } from "../../packages/telemetry/src/index.js";
import {
  createExperienceObservation,
  EXPERIENCE_OBSERVATION_NAMES,
} from "../../packages/experience-observability/src/index.js";

const occurredAt = "2026-09-01T02:30:00.000Z";

const expectedSemantics = {
  "experience.requested": ["lifecycle", "neutral"],
  "experience.planned": ["lifecycle", "success"],
  "experience.render.started": ["lifecycle", "neutral"],
  "experience.render.completed": ["lifecycle", "success"],
  "experience.render.failed": ["error", "failure"],
  "experience.action.started": ["action", "neutral"],
  "experience.action.completed": ["action", "success"],
  "experience.action.denied": ["security", "failure"],
  "experience.view.changed": ["lifecycle", "neutral"],
  "experience.binding.resolved": ["integration", "success"],
  "experience.interactive": ["performance", "success"],
} as const;

describe("Experience Observability semantic contract", () => {
  it("maps the closed v1 taxonomy deterministically into the existing TelemetryEvent contract", () => {
    expect(EXPERIENCE_OBSERVATION_NAMES).toEqual(Object.keys(expectedSemantics));

    for (const name of EXPERIENCE_OBSERVATION_NAMES) {
      const [kind, outcome] = expectedSemantics[name];
      const result = createExperienceObservation({
        name,
        source: "runtime-web",
        occurredAt,
        ...(name === "experience.interactive" ? { durationMs: 250 } : {}),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value).toEqual({
        version: "1",
        name,
        source: "runtime-web",
        kind,
        outcome,
        occurredAt,
        ...(name === "experience.interactive" ? { durationMs: 250 } : {}),
      });
      expect(createTelemetryEvent(result.value)).toEqual({ ok: true, value: result.value });
      expect(Object.isFrozen(result.value)).toBe(true);
    }
  });

  it("keeps kind, outcome and version semantic-owned instead of caller-overridable", () => {
    for (const [field, value] of [
      ["kind", "security"],
      ["outcome", "failure"],
      ["version", "2"],
    ] as const) {
      expect(createExperienceObservation({
        name: "experience.render.completed",
        source: "runtime-web",
        occurredAt,
        [field]: value,
      })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("rejects arbitrary content, identifiers and correlation fields", () => {
    for (const [field, value] of [
      ["attributes", { userId: "u-1" }],
      ["payload", { prompt: "secret" }],
      ["message", "customer message"],
      ["prompt", "secret prompt"],
      ["tenantId", "tenant-1"],
      ["userId", "user-1"],
      ["sessionId", "session-1"],
      ["traceId", "trace-1"],
      ["spanId", "span-1"],
    ] as const) {
      expect(createExperienceObservation({
        name: "experience.requested",
        source: "host",
        occurredAt,
        [field]: value,
      })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("rejects unknown semantic names without manufacturing telemetry events", () => {
    expect(createExperienceObservation({
      name: "experience.marketplace.installed",
      source: "host",
      occurredAt,
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_OBSERVATION_NAME", path: "$.name" },
    });
  });

  it("enforces point-in-time and performance duration semantics", () => {
    expect(createExperienceObservation({
      name: "experience.render.completed",
      source: "runtime-web",
      occurredAt,
      durationMs: 10,
    })).toMatchObject({
      ok: false,
      issue: { code: "DURATION_NOT_ALLOWED", path: "$.durationMs" },
    });

    expect(createExperienceObservation({
      name: "experience.interactive",
      source: "runtime-web",
      occurredAt,
    })).toMatchObject({
      ok: false,
      issue: { code: "DURATION_REQUIRED", path: "$.durationMs" },
    });

    expect(createExperienceObservation({
      name: "experience.interactive",
      source: "runtime-web",
      occurredAt,
      durationMs: -1,
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_DURATION", path: "$.durationMs" },
    });
  });

  it("preserves canonical telemetry validation for source and timestamps", () => {
    expect(createExperienceObservation({
      name: "experience.requested",
      source: "customer-a",
      occurredAt,
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_SOURCE", path: "$.source" },
    });

    expect(createExperienceObservation({
      name: "experience.requested",
      source: "host",
      occurredAt: "2026-09-01T05:30:00+03:00",
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_OCCURRED_AT", path: "$.occurredAt" },
    });
  });

  it("rejects accessor and symbol-backed input without executing getters", () => {
    let reads = 0;
    const accessorInput: Record<string, unknown> = {
      source: "host",
      occurredAt,
    };
    Object.defineProperty(accessorInput, "name", {
      enumerable: true,
      get() {
        reads += 1;
        return "experience.requested";
      },
    });
    expect(createExperienceObservation(accessorInput)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$.name" },
    });
    expect(reads).toBe(0);

    const symbolInput = {
      name: "experience.requested",
      source: "host",
      occurredAt,
    };
    Object.defineProperty(symbolInput, Symbol("secret"), { value: "hidden" });
    expect(createExperienceObservation(symbolInput)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$" },
    });
  });
});
