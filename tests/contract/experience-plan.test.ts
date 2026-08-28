import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  EXPERIENCE_PLAN_MAX_CAPABILITIES,
  isExperiencePlan,
  parseExperiencePlan,
} from "../../packages/protocol/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

function basePlan(): Record<string, unknown> {
  return {
    version: "1",
    id: "plan-1",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: { origin: "IST", destination: "BER" },
    capabilities: {},
  };
}

describe("ExperiencePlan Protocol v1", () => {
  it("parses and normalizes the golden experience plan fixture", async () => {
    const fixtureUrl = new URL("../fixtures/protocol/experience-plan.v1.json", import.meta.url);
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as unknown;
    const result = parseExperiencePlan(fixture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.capabilities.required.map((capability) => capability.id)).toEqual(["select-date"]);
    expect(result.value.capabilities.available.map((capability) => capability.id)).toEqual(["edit-location", "edit-passengers"]);
    expect(result.value.capabilities.future.map((capability) => capability.id)).toEqual(["display.flight-results"]);
    expect(isExperiencePlan(result.value)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("normalizes missing capability buckets to empty arrays", () => {
    const result = parseExperiencePlan(basePlan());
    expect(result).toMatchObject({
      ok: true,
      value: { capabilities: { required: [], available: [], future: [] } },
    });
  });

  it("rejects premature presentation and execution fields", () => {
    for (const field of ["regions", "actions", "layout", "component", "policies"]) {
      expect(parseExperiencePlan({ ...basePlan(), [field]: {} })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("validates nested intent and capability contracts", () => {
    expect(parseExperiencePlan({
      ...basePlan(),
      intent: { version: "1", namespace: "Travel.Flight", name: "search" },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_INTENT", path: "$.intent.namespace" } });

    expect(parseExperiencePlan({
      ...basePlan(),
      capabilities: { required: [{ version: "1", id: "SelectDate" }] },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_CAPABILITIES", path: "$.capabilities.required[0].id" } });
  });

  it("rejects duplicate capability IDs across buckets", () => {
    expect(parseExperiencePlan({
      ...basePlan(),
      capabilities: {
        required: [{ version: "1", id: "select-date" }],
        available: [{ version: "1", id: "select-date" }],
      },
    })).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_CAPABILITY", path: "$.capabilities.available[0].id" },
    });
  });

  it("rejects oversized capability buckets before nested parsing", () => {
    const oversized = Array.from({ length: EXPERIENCE_PLAN_MAX_CAPABILITIES + 1 }, () => null);
    expect(parseExperiencePlan({
      ...basePlan(),
      capabilities: { required: oversized },
    })).toMatchObject({
      ok: false,
      issue: { code: "CAPABILITY_LIMIT_EXCEEDED", path: "$.capabilities.required" },
    });
  });

  it("rejects non-canonical state rather than silently normalizing it", () => {
    expect(parseExperiencePlan({ ...basePlan(), state: { when: new Date() } })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_STATE", path: "$.state.when" },
    });
  });

  it("clones caller-owned nested state and capability objects", () => {
    const state = { origin: "IST" };
    const capability = { version: "1", id: "select-date" };
    const result = parseExperiencePlan({
      ...basePlan(),
      state,
      capabilities: { required: [capability] },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state).not.toBe(state);
    expect(result.value.capabilities.required[0]).not.toBe(capability);
  });

  it("rejects invalid plan ids and unsupported versions", () => {
    expect(parseExperiencePlan({ ...basePlan(), id: "plan with spaces" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ID", path: "$.id" },
    });
    expect(parseExperiencePlan({ ...basePlan(), version: "2" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VERSION", path: "$.version" },
    });
  });
});
