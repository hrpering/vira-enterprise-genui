import { describe, expect, it } from "vitest";
import {
  STATE_RESOLVER_MAX_CANDIDATES,
  STATE_RESOLVER_MAX_REQUIREMENTS,
  resolveState,
} from "../../packages/planner/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

describe("planner state resolver", () => {
  it("keeps known state, fills explicit missing candidates, and reports missing fields deterministically", () => {
    const input = {
      state: { origin: "IST" },
      required: ["origin", "destination", "departure-date"],
      candidates: { destination: "BER" },
    };
    const result = resolveState(input);
    expect(result).toMatchObject({
      ok: true,
      value: {
        state: { origin: "IST", destination: "BER" },
        known: ["origin", "destination"],
        missing: ["departure-date"],
        conflicts: [],
      },
    });
    if (!result.ok) return;
    expect(result.value.state).not.toBe(input.state);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.state)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("does not silently overwrite conflicting current state", () => {
    const result = resolveState({
      state: { origin: "IST" },
      required: ["origin"],
      candidates: { origin: "SAW" },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        state: { origin: "IST" },
        known: [],
        missing: [],
        conflicts: [{ field: "origin", current: "IST", candidate: "SAW" }],
      },
    });
  });

  it("treats structurally equal canonical JSON values as equal regardless of object key order", () => {
    const result = resolveState({
      state: { traveler: { adult: 1, child: 0 } },
      required: ["traveler"],
      candidates: { traveler: { child: 0, adult: 1 } },
    });
    expect(result).toMatchObject({ ok: true, value: { known: ["traveler"], conflicts: [] } });
  });

  it("rejects duplicate/invalid requirements and candidate fields outside the declared requirements", () => {
    expect(resolveState({ state: {}, required: ["origin", "origin"] })).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_REQUIREMENT", path: "$.required[1]" },
    });
    expect(resolveState({ state: {}, required: ["Origin"] })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_REQUIRED", path: "$.required[0]" },
    });
    expect(resolveState({ state: {}, required: ["origin"], candidates: { destination: "BER" } })).toMatchObject({
      ok: false,
      issue: { code: "UNREQUESTED_CANDIDATE", path: "$.candidates.destination" },
    });
  });

  it("enforces requirement and candidate limits before recursive canonical parsing", () => {
    const required = Array.from({ length: STATE_RESOLVER_MAX_REQUIREMENTS + 1 }, () => "origin");
    expect(resolveState({ state: {}, required })).toMatchObject({
      ok: false,
      issue: { code: "REQUIREMENT_LIMIT_EXCEEDED", path: "$.required" },
    });

    const candidates = Object.fromEntries(
      Array.from({ length: STATE_RESOLVER_MAX_CANDIDATES + 1 }, (_, index) => [`field-${index}`, index]),
    );
    expect(resolveState({ state: {}, required: [], candidates })).toMatchObject({
      ok: false,
      issue: { code: "CANDIDATE_LIMIT_EXCEEDED", path: "$.candidates" },
    });
  });

  it("rejects accessors/non-canonical input without invoking getters", () => {
    let calls = 0;
    const input: Record<string, unknown> = { state: {}, required: ["origin"] };
    Object.defineProperty(input, "candidates", {
      enumerable: true,
      get() {
        calls += 1;
        return { origin: "IST" };
      },
    });

    expect(resolveState(input)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE", path: "$.candidates" } });
    expect(calls).toBe(0);
  });

  it("does not infer domain values or retain caller-owned input", () => {
    const state = { origin: "IST" };
    const candidates = { destination: "BER" };
    const result = resolveState({ state, required: ["origin", "destination"], candidates });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    candidates.destination = "AMS";
    state.origin = "SAW";
    expect(result.value.state).toEqual({ origin: "IST", destination: "BER" });
  });
});
