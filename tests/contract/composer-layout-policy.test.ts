import { describe, expect, it } from "vitest";
import {
  LAYOUT_FAMILIES,
  createLayoutPolicy,
  isLayoutFamily,
} from "../../packages/composer/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

describe("composer layout policy", () => {
  it("accepts each explicit semantic layout family", () => {
    for (const family of LAYOUT_FAMILIES) {
      const result = createLayoutPolicy({ family });
      expect(result, family).toMatchObject({ ok: true, value: { family } });
      if (!result.ok) continue;
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(jsonRoundTrip(result.value)).toEqual(result.value);
      expect(isLayoutFamily(family)).toBe(true);
    }
  });

  it("rejects unknown families instead of inventing a fallback", () => {
    for (const family of ["auto", "responsive", "grid-12", "sidebar"]) {
      expect(createLayoutPolicy({ family })).toMatchObject({
        ok: false,
        issue: { code: "INVALID_FAMILY", path: "$.family" },
      });
    }
  });

  it("rejects geometry, CSS, breakpoint, component, and rendering fields", () => {
    for (const field of ["columns", "gap", "breakpoint", "css", "width", "height", "component", "template"]) {
      expect(createLayoutPolicy({ family: "flow", [field]: "forbidden" })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("does not silently choose a default family", () => {
    expect(createLayoutPolicy({})).toMatchObject({
      ok: false,
      issue: { code: "INVALID_FAMILY", path: "$.family" },
    });
  });

  it("rejects accessor-backed policy fields without invoking getters", () => {
    let calls = 0;
    const input: Record<string, unknown> = {};
    Object.defineProperty(input, "family", {
      enumerable: true,
      get() {
        calls += 1;
        return "flow";
      },
    });
    expect(createLayoutPolicy(input)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE", path: "$.family" } });
    expect(calls).toBe(0);
  });
});
