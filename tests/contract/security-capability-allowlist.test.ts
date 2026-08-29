import { describe, expect, it } from "vitest";
import {
  CAPABILITY_ALLOWLIST_MAX_ENTRIES,
  createCapabilityAllowlistPolicy,
  evaluateCapabilityAllowlist,
} from "../../packages/security/src/index.js";

function policy(allowed: string[]) {
  return { version: "1", allowed };
}

describe("security exact capability allowlist", () => {
  it("allows exact keys and denies every non-exact variant", () => {
    const input = policy(["select-date", "compare-items"]);
    expect(evaluateCapabilityAllowlist(input, "select-date")).toEqual({
      ok: true,
      value: { capabilityKey: "select-date", decision: "allow" },
    });
    for (const key of ["Select-Date", "select", "select-date.extra", " compare-items", "compare-items "]) {
      expect(evaluateCapabilityAllowlist(input, key)).toEqual({
        ok: true,
        value: { capabilityKey: key, decision: "deny" },
      });
    }
  });

  it("supports explicit deny-all without implicit defaults", () => {
    expect(evaluateCapabilityAllowlist(policy([]), "select-date")).toEqual({
      ok: true,
      value: { capabilityKey: "select-date", decision: "deny" },
    });
  });

  it("normalizes into a detached frozen policy and rejects duplicates", () => {
    const allowed = ["select-date"];
    const created = createCapabilityAllowlistPolicy(policy(allowed));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    allowed[0] = "mutated";
    expect(created.value.allowed).toEqual(["select-date"]);
    expect(Object.isFrozen(created.value)).toBe(true);
    expect(Object.isFrozen(created.value.allowed)).toBe(true);

    expect(createCapabilityAllowlistPolicy(policy(["select-date", "select-date"]))).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_KEY", path: "$.allowed[1]" },
    });
  });

  it("rejects sparse/accessor-backed/custom/symbol allowlists without invoking getters", () => {
    const sparse = new Array(2);
    sparse[1] = "select-date";
    expect(createCapabilityAllowlistPolicy(policy(sparse as string[]))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ALLOWED", path: "$.allowed[0]" },
    });

    let reads = 0;
    const accessor: unknown[] = ["select-date"];
    Object.defineProperty(accessor, "0", {
      enumerable: true,
      get() {
        reads += 1;
        return "select-date";
      },
    });
    expect(createCapabilityAllowlistPolicy(policy(accessor as string[]))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ALLOWED", path: "$.allowed[0]" },
    });
    expect(reads).toBe(0);

    const custom = ["select-date"] as string[] & { wildcard?: string };
    Object.defineProperty(custom, "wildcard", { value: "*", enumerable: false });
    expect(createCapabilityAllowlistPolicy(policy(custom))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ALLOWED", path: "$.allowed.wildcard" },
    });

    const symbol = Symbol("wildcard");
    const symbolAllowed = ["select-date"];
    Object.defineProperty(symbolAllowed, symbol, { value: "*" });
    expect(createCapabilityAllowlistPolicy(policy(symbolAllowed))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ALLOWED", path: "$.allowed" },
    });

    expect(createCapabilityAllowlistPolicy(policy(
      Array.from({ length: CAPABILITY_ALLOWLIST_MAX_ENTRIES + 1 }, (_, index) => `cap-${index}`),
    ))).toMatchObject({ ok: false, issue: { code: "ENTRY_LIMIT_EXCEEDED" } });
  });

  it("contains hostile reflection traps as invalid policy data", () => {
    const secret = "SECRET_CAPABILITY_PROXY";
    const hostile = new Proxy({}, {
      getPrototypeOf() {
        throw new Error(secret);
      },
    });
    const result = createCapabilityAllowlistPolicy(hostile);
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT", path: "$" } });
    if (!result.ok) expect(result.issue.message).not.toContain(secret);
  });

  it("rejects malformed/custom root policy and invalid candidate inputs without semantic-grammar ownership", () => {
    expect(createCapabilityAllowlistPolicy({ version: "1", allowed: [], wildcard: "*" })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.wildcard" },
    });
    const rootSymbol = { version: "1", allowed: [] } as Record<PropertyKey, unknown>;
    rootSymbol[Symbol("wildcard")] = "*";
    expect(createCapabilityAllowlistPolicy(rootSymbol)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$" },
    });
    expect(evaluateCapabilityAllowlist(policy([]), "")).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CAPABILITY_KEY", path: "$.capabilityKey" },
    });
  });
});
