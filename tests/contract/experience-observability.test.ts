import { describe, expect, it } from "vitest";
import { createTelemetryEvent } from "../../packages/telemetry/src/index.js";
import {
  createExperienceObservation,
  EXPERIENCE_OBSERVATION_NAMES,
} from "../../packages/experience-observability/src/index.js";
import type { ExperienceObservationInput } from "../../packages/experience-observability/src/index.js";

const occurredAt = "2026-09-01T02:30:00.000Z";

const typedObservation: ExperienceObservationInput = {
  name: "experience.requested",
  source: "host",
  occurredAt,
};
void typedObservation;

const typedDurationObservation: ExperienceObservationInput = {
  name: "experience.requested",
  source: "host",
  occurredAt,
  // @ts-expect-error EOBS v1 is point-in-time only; duration belongs to a future tracing/correlation contract.
  durationMs: 1,
};
void typedDurationObservation;

const expectedSemantics = {
  "experience.requested": ["lifecycle", "neutral"],
  "experience.planned": ["lifecycle", "success"],
  "experience.render.started": ["lifecycle", "neutral"],
  "experience.render.completed": ["lifecycle", "success"],
  "experience.render.failed": ["error", "failure"],
  "experience.shown": ["lifecycle", "success"],
  "experience.view.changed": ["lifecycle", "neutral"],
  "experience.binding.resolved": ["integration", "success"],
  "experience.action.started": ["action", "neutral"],
  "experience.action.proposed": ["action", "neutral"],
  "experience.policy.evaluated": ["security", "neutral"],
  "experience.approval.requested": ["security", "neutral"],
  "experience.approval.granted": ["security", "success"],
  "experience.action.executed": ["action", "success"],
  "experience.action.completed": ["action", "success"],
  "experience.action.failed": ["error", "failure"],
  "experience.action.denied": ["security", "failure"],
  "experience.action.retry": ["action", "neutral"],
  "experience.action.recovery": ["action", "success"],
} as const;

describe("Experience Observability semantic contract", () => {
  it("maps the closed point-in-time v1 taxonomy deterministically into the existing TelemetryEvent contract", () => {
    expect(EXPERIENCE_OBSERVATION_NAMES).toEqual(Object.keys(expectedSemantics));
    for (const name of EXPERIENCE_OBSERVATION_NAMES) {
      const [kind, outcome] = expectedSemantics[name];
      const result = createExperienceObservation({ name, source: "runtime-web", occurredAt });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value).toEqual({ version: "1", name, source: "runtime-web", kind, outcome, occurredAt });
      expect(createTelemetryEvent(result.value)).toEqual({ ok: true, value: result.value });
      expect(Object.isFrozen(result.value)).toBe(true);
    }
  });

  it("keeps kind, outcome and version semantic-owned instead of caller-overridable", () => {
    for (const [field, value] of [["kind", "security"], ["outcome", "failure"], ["version", "2"]] as const) {
      expect(createExperienceObservation({ name: "experience.render.completed", source: "runtime-web", occurredAt, [field]: value })).toMatchObject({ ok: false, issue: { code: "UNKNOWN_FIELD", path: "$" } });
    }
  });

  it("rejects arbitrary content, identifiers, correlation fields and duration without echoing unknown key names", () => {
    for (const [field, value] of [
      ["attributes", { userId: "u-1" }], ["payload", { prompt: "secret" }], ["message", "customer message"], ["prompt", "secret prompt"],
      ["tenantId", "tenant-1"], ["userId", "user-1"], ["sessionId", "session-1"], ["traceId", "trace-1"], ["spanId", "span-1"], ["durationMs", 10],
    ] as const) {
      const result = createExperienceObservation({ name: "experience.requested", source: "host", occurredAt, [field]: value });
      expect(result).toMatchObject({ ok: false, issue: { code: "UNKNOWN_FIELD", path: "$" } });
      if (!result.ok) expect(`${result.issue.path}\n${result.issue.message}`).not.toContain(field);
    }
    const sensitiveKey = "customer@example.com";
    const result = createExperienceObservation({ name: "experience.requested", source: "host", occurredAt, [sensitiveKey]: true });
    expect(result).toMatchObject({ ok: false, issue: { code: "UNKNOWN_FIELD", path: "$" } });
    if (!result.ok) expect(`${result.issue.path}\n${result.issue.message}`).not.toContain(sensitiveKey);
  });

  it("rejects unknown semantic names without manufacturing telemetry events", () => {
    for (const name of ["experience.marketplace.installed", "experience.interactive"]) {
      expect(createExperienceObservation({ name, source: "host", occurredAt })).toMatchObject({ ok: false, issue: { code: "INVALID_OBSERVATION_NAME", path: "$.name" } });
    }
  });

  it("preserves canonical telemetry validation for source and timestamps", () => {
    expect(createExperienceObservation({ name: "experience.requested", source: "customer-a", occurredAt })).toMatchObject({ ok: false, issue: { code: "INVALID_SOURCE", path: "$.source" } });
    expect(createExperienceObservation({ name: "experience.requested", source: "host", occurredAt: "2026-09-01T05:30:00+03:00" })).toMatchObject({ ok: false, issue: { code: "INVALID_OCCURRED_AT", path: "$.occurredAt" } });
  });

  it("rejects accessor and symbol-backed input without executing getters", () => {
    let reads = 0;
    const accessorInput: Record<string, unknown> = { source: "host", occurredAt };
    Object.defineProperty(accessorInput, "name", { enumerable: true, get() { reads += 1; return "experience.requested"; } });
    expect(createExperienceObservation(accessorInput)).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT", path: "$.name" } });
    expect(reads).toBe(0);
    const symbolInput = { name: "experience.requested", source: "host", occurredAt };
    Object.defineProperty(symbolInput, Symbol("secret"), { value: "hidden" });
    expect(createExperienceObservation(symbolInput)).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT", path: "$" } });
  });
});
