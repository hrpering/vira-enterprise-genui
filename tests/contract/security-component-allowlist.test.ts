import { describe, expect, it } from "vitest";
import {
  COMPONENT_ALLOWLIST_KEY_MAX_LENGTH,
  COMPONENT_ALLOWLIST_MAX_ENTRIES,
  createComponentAllowlistPolicy,
  evaluateComponentAllowlist,
} from "../../packages/security/src/index.js";

describe("security component allowlist", () => {
  it("is exact, case-sensitive, and deny-by-default", () => {
    const policy = { version: "1", allowed: ["acme.component.search-button"] };
    expect(evaluateComponentAllowlist(policy, "acme.component.search-button")).toMatchObject({
      ok: true,
      value: { decision: "allow" },
    });
    for (const candidate of [
      "Acme.component.search-button",
      "acme.component.search",
      "acme.component.search-button.admin",
      "other.component.search-button",
    ]) {
      expect(evaluateComponentAllowlist(policy, candidate)).toMatchObject({
        ok: true,
        value: { componentKey: candidate, decision: "deny" },
      });
    }
    expect(evaluateComponentAllowlist({ version: "1", allowed: [] }, "acme.component.search-button")).toMatchObject({
      ok: true,
      value: { decision: "deny" },
    });
  });

  it("snapshots and freezes caller-owned policy data", () => {
    const allowed = ["acme.component.search-button"];
    const result = createComponentAllowlistPolicy({ version: "1", allowed });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    allowed[0] = "mutated.component.admin";
    expect(result.value.allowed).toEqual(["acme.component.search-button"]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.allowed)).toBe(true);
  });

  it("rejects duplicate, overlong, sparse, and oversized allowlists", () => {
    expect(createComponentAllowlistPolicy({
      version: "1",
      allowed: ["acme.component.search-button", "acme.component.search-button"],
    })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_KEY", path: "$.allowed[1]" } });

    expect(createComponentAllowlistPolicy({
      version: "1",
      allowed: ["x".repeat(COMPONENT_ALLOWLIST_KEY_MAX_LENGTH + 1)],
    })).toMatchObject({ ok: false, issue: { code: "INVALID_KEY", path: "$.allowed[0]" } });

    const sparse = new Array<string>(1);
    expect(createComponentAllowlistPolicy({ version: "1", allowed: sparse })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ALLOWED", path: "$.allowed[0]" },
    });

    expect(createComponentAllowlistPolicy({
      version: "1",
      allowed: Array.from({ length: COMPONENT_ALLOWLIST_MAX_ENTRIES + 1 }, (_, index) => `component.${index}`),
    })).toMatchObject({ ok: false, issue: { code: "ENTRY_LIMIT_EXCEEDED", path: "$.allowed" } });
  });

  it("rejects custom and symbol policy surface instead of silently ignoring it", () => {
    expect(createComponentAllowlistPolicy({ version: "1", allowed: [], wildcard: true })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.wildcard" },
    });

    const symbol = Symbol("hidden");
    const policy: Record<PropertyKey, unknown> = { version: "1", allowed: [] };
    policy[symbol] = "allow-all";
    expect(createComponentAllowlistPolicy(policy)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$" },
    });

    const allowed: string[] = [];
    Object.defineProperty(allowed, "hidden", { value: "allow-all", enumerable: false });
    expect(createComponentAllowlistPolicy({ version: "1", allowed })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ALLOWED", path: "$.allowed.hidden" },
    });
  });

  it("does not execute accessor-backed policy values", () => {
    let calls = 0;
    const policy: Record<string, unknown> = { allowed: [] };
    Object.defineProperty(policy, "version", {
      enumerable: true,
      get() {
        calls += 1;
        return "1";
      },
    });
    expect(createComponentAllowlistPolicy(policy)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VERSION", path: "$.version" },
    });
    expect(calls).toBe(0);
  });

  it("keeps semantic component validation with the upstream owner", () => {
    const policy = { version: "1", allowed: ["not namespaced but bounded"] };
    expect(createComponentAllowlistPolicy(policy).ok).toBe(true);
    expect(evaluateComponentAllowlist(policy, "not namespaced but bounded")).toMatchObject({
      ok: true,
      value: { decision: "allow" },
    });
    expect(evaluateComponentAllowlist(policy, "")).toMatchObject({
      ok: false,
      issue: { code: "INVALID_COMPONENT_KEY", path: "$.componentKey" },
    });
  });
});
