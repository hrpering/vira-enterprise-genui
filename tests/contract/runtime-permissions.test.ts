import { describe, expect, it } from "vitest";
import {
  createRuntimeAction,
  createRuntimePermissionPolicy,
  evaluateRuntimeActionPermission,
  evaluateRuntimeCapabilityPermission,
} from "../../packages/runtime-core/src/index.js";

function policy() {
  const result = createRuntimePermissionPolicy({
    version: "1",
    rules: [
      { subject: "action", id: "search.submit", effect: "allow" },
      { subject: "action", id: "booking.confirm", effect: "confirm" },
      { subject: "capability", id: "select-date", effect: "allow" },
      { subject: "capability", id: "admin.delete", effect: "deny" },
    ],
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function action(source: "user" | "host" | "system", type = "search.submit") {
  const result = createRuntimeAction({ id: `action-${source}`, type, source });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

describe("runtime permissions", () => {
  it("is default-deny for unmatched action and capability identifiers", () => {
    expect(evaluateRuntimeActionPermission(policy(), action("user", "search.unknown"))).toMatchObject({
      ok: true,
      value: { effect: "deny", reason: "default-deny" },
    });
    expect(evaluateRuntimeCapabilityPermission(policy(), { version: "1", id: "display.map" })).toMatchObject({
      ok: true,
      value: { effect: "deny", reason: "default-deny" },
    });
  });

  it("matches exact semantic action/capability rules", () => {
    expect(evaluateRuntimeActionPermission(policy(), action("user"))).toMatchObject({
      ok: true,
      value: { effect: "allow", reason: "matched-rule", subject: "action", id: "search.submit" },
    });
    expect(evaluateRuntimeCapabilityPermission(policy(), { version: "1", id: "select-date" })).toMatchObject({
      ok: true,
      value: { effect: "allow", subject: "capability", id: "select-date" },
    });
  });

  it("treats confirm as a distinct non-allow decision", () => {
    const result = evaluateRuntimeActionPermission(policy(), action("user", "booking.confirm"));
    expect(result).toMatchObject({ ok: true, value: { effect: "confirm" } });
    expect(result.ok && result.value.effect === "allow").toBe(false);
  });

  it("does not grant privileges from action source", () => {
    for (const source of ["user", "host", "system"] as const) {
      expect(evaluateRuntimeActionPermission(policy(), action(source, "admin.delete"))).toMatchObject({
        ok: true,
        value: { effect: "deny", reason: "default-deny" },
      });
    }
  });

  it("rejects duplicate, wildcard, conditional, or executable permission rules", () => {
    expect(createRuntimePermissionPolicy({
      version: "1",
      rules: [
        { subject: "action", id: "search.submit", effect: "allow" },
        { subject: "action", id: "search.submit", effect: "deny" },
      ],
    })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_RULE" } });

    for (const rule of [
      { subject: "action", id: "search.*", effect: "allow" },
      { subject: "action", id: "search.submit", effect: "allow", source: "system" },
      { subject: "action", id: "search.submit", effect: "allow", callback: "grant" },
    ]) {
      expect(createRuntimePermissionPolicy({ version: "1", rules: [rule] }).ok).toBe(false);
    }
  });

  it("returns immutable normalized policy data", () => {
    const value = policy();
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.rules)).toBe(true);
    expect(Object.isFrozen(value.rules[0])).toBe(true);
  });
});
