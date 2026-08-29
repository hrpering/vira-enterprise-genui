import { describe, expect, it } from "vitest";
import {
  TOOL_FRESHNESS_STATUSES,
  evaluateToolResultFreshness,
} from "../../packages/tool-bridge/src/index.js";

function result(freshness?: { observedAtUnixMs: number; expiresAtUnixMs?: number }) {
  return {
    version: "1",
    tool: { kind: "function", name: "travel.flight.search" },
    outcome: "success",
    data: { flights: [] },
    ...(freshness === undefined ? {} : { freshness }),
  };
}

describe("tool-bridge deterministic freshness evaluation", () => {
  it("classifies unknown/future/fresh/stale with exact deterministic boundaries", () => {
    expect(TOOL_FRESHNESS_STATUSES).toEqual(["unknown", "future", "fresh", "stale"]);

    expect(evaluateToolResultFreshness(result(), 1_000)).toEqual({
      ok: true,
      value: { status: "unknown", nowUnixMs: 1_000 },
    });

    expect(evaluateToolResultFreshness(result({ observedAtUnixMs: 1_000, expiresAtUnixMs: 2_000 }), 999)).toEqual({
      ok: true,
      value: { status: "future", nowUnixMs: 999, observedAtUnixMs: 1_000, expiresAtUnixMs: 2_000 },
    });

    expect(evaluateToolResultFreshness(result({ observedAtUnixMs: 1_000, expiresAtUnixMs: 2_000 }), 1_000)).toEqual({
      ok: true,
      value: { status: "fresh", nowUnixMs: 1_000, observedAtUnixMs: 1_000, expiresAtUnixMs: 2_000 },
    });

    expect(evaluateToolResultFreshness(result({ observedAtUnixMs: 1_000, expiresAtUnixMs: 2_000 }), 1_999)).toEqual({
      ok: true,
      value: { status: "fresh", nowUnixMs: 1_999, observedAtUnixMs: 1_000, expiresAtUnixMs: 2_000 },
    });

    expect(evaluateToolResultFreshness(result({ observedAtUnixMs: 1_000, expiresAtUnixMs: 2_000 }), 2_000)).toEqual({
      ok: true,
      value: { status: "stale", nowUnixMs: 2_000, observedAtUnixMs: 1_000, expiresAtUnixMs: 2_000 },
    });
  });

  it("keeps observations without expiry fresh after their observation timestamp", () => {
    expect(evaluateToolResultFreshness(result({ observedAtUnixMs: 1_000 }), Number.MAX_SAFE_INTEGER)).toEqual({
      ok: true,
      value: { status: "fresh", nowUnixMs: Number.MAX_SAFE_INTEGER, observedAtUnixMs: 1_000 },
    });
  });

  it("rejects invalid caller clocks before classifying the result", () => {
    for (const now of [-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "1000", null]) {
      expect(evaluateToolResultFreshness(result(), now)).toMatchObject({
        ok: false,
        issue: { code: "INVALID_NOW", path: "$.nowUnixMs" },
      });
    }
  });

  it("preserves owning tool-result validation paths", () => {
    const invalid = result({ observedAtUnixMs: 2_000, expiresAtUnixMs: 1_000 });
    expect(evaluateToolResultFreshness(invalid, 1_500)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_TOOL_RESULT", path: "$.result.freshness.expiresAtUnixMs" },
    });
  });

  it("returns immutable evaluation metadata and never mutates the caller result", () => {
    const input = result({ observedAtUnixMs: 1_000, expiresAtUnixMs: 2_000 });
    const before = structuredClone(input);
    const evaluation = evaluateToolResultFreshness(input, 1_500);
    expect(evaluation.ok).toBe(true);
    if (!evaluation.ok) return;
    expect(Object.isFrozen(evaluation.value)).toBe(true);
    expect(input).toEqual(before);
  });
});
