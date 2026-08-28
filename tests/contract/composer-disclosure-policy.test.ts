import { describe, expect, it } from "vitest";
import { createDisclosurePolicy } from "../../packages/composer/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

describe("composer disclosure policy", () => {
  it("creates an explicit semantic disclosure policy", () => {
    const result = createDisclosurePolicy({
      primary: "immediate",
      supporting: "progressive",
      deferred: "on-demand",
    });
    expect(result).toMatchObject({
      ok: true,
      value: { primary: "immediate", supporting: "progressive", deferred: "on-demand" },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("never permits hiding or deferring primary task capabilities", () => {
    for (const primary of ["progressive", "on-demand", "hidden"]) {
      expect(createDisclosurePolicy({ primary, supporting: "progressive", deferred: "on-demand" })).toMatchObject({
        ok: false,
        issue: { code: "INVALID_PRIMARY_DISCLOSURE", path: "$.primary" },
      });
    }
  });

  it("does not allow supporting capabilities to be fully hidden", () => {
    expect(createDisclosurePolicy({ primary: "immediate", supporting: "hidden", deferred: "on-demand" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_SUPPORTING_DISCLOSURE", path: "$.supporting" },
    });
  });

  it("does not allow deferred capabilities to masquerade as immediate priority", () => {
    expect(createDisclosurePolicy({ primary: "immediate", supporting: "progressive", deferred: "immediate" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_DEFERRED_DISCLOSURE", path: "$.deferred" },
    });
  });

  it("requires every semantic role to have an explicit disclosure decision", () => {
    expect(createDisclosurePolicy({ primary: "immediate", supporting: "progressive" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_DEFERRED_DISCLOSURE", path: "$.deferred" },
    });
  });

  it("rejects UI implementation fields", () => {
    for (const field of ["accordion", "expanded", "animation", "maxLines", "component", "css", "breakpoint"]) {
      expect(createDisclosurePolicy({
        primary: "immediate",
        supporting: "progressive",
        deferred: "on-demand",
        [field]: "forbidden",
      })).toMatchObject({ ok: false, issue: { code: "UNKNOWN_FIELD", path: `$.${field}` } });
    }
  });

  it("rejects accessor-backed fields without invoking getters", () => {
    let calls = 0;
    const input: Record<string, unknown> = { primary: "immediate", supporting: "progressive" };
    Object.defineProperty(input, "deferred", {
      enumerable: true,
      get() {
        calls += 1;
        return "on-demand";
      },
    });
    expect(createDisclosurePolicy(input)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE", path: "$.deferred" } });
    expect(calls).toBe(0);
  });
});
