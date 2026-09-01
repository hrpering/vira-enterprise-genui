import { describe, expect, it } from "vitest";
import {
  evaluateCapabilityAllowlist,
  evaluateComponentAllowlist,
  evaluateNetworkRequest,
} from "../../packages/security/src/index.js";
import {
  evaluatePolicyCheck,
  POLICY_CHECK_KINDS,
} from "../../packages/policy-engine/src/index.js";
import type { PolicyCheckInput } from "../../packages/policy-engine/src/index.js";

const capabilityPolicy = Object.freeze({
  version: "1" as const,
  allowed: Object.freeze(["tool.search"]),
});

const componentPolicy = Object.freeze({
  version: "1" as const,
  allowed: Object.freeze(["card.flight-result"]),
});

const networkPolicy = Object.freeze({
  version: "1" as const,
  rules: Object.freeze([
    Object.freeze({
      origin: "https://api.example.com",
      methods: Object.freeze(["GET" as const]),
    }),
  ]),
});

const typedNetworkCheck: PolicyCheckInput = {
  kind: "network",
  policy: networkPolicy,
  target: { url: "https://api.example.com/flights", method: "GET" },
};
void typedNetworkCheck;

describe("Policy Engine decision boundary", () => {
  it("exposes only the closed v1 security-owned check kinds", () => {
    expect(POLICY_CHECK_KINDS).toEqual(["capability", "component", "network"]);
    expect(Object.isFrozen(POLICY_CHECK_KINDS)).toBe(true);
  });

  it("matches existing capability allowlist allow and deny decisions without echoing the target", () => {
    for (const target of ["tool.search", "tool.delete"] as const) {
      const canonical = evaluateCapabilityAllowlist(capabilityPolicy, target);
      expect(canonical.ok).toBe(true);
      if (!canonical.ok) continue;

      const result = evaluatePolicyCheck({ kind: "capability", policy: capabilityPolicy, target });
      expect(result).toEqual({
        ok: true,
        value: { kind: "capability", decision: canonical.value.decision },
      });
      expect(JSON.stringify(result)).not.toContain(target);
      if (result.ok) expect(Object.isFrozen(result.value)).toBe(true);
    }
  });

  it("matches existing component allowlist allow and deny decisions without echoing the target", () => {
    for (const target of ["card.flight-result", "component.unknown"] as const) {
      const canonical = evaluateComponentAllowlist(componentPolicy, target);
      expect(canonical.ok).toBe(true);
      if (!canonical.ok) continue;

      const result = evaluatePolicyCheck({ kind: "component", policy: componentPolicy, target });
      expect(result).toEqual({
        ok: true,
        value: { kind: "component", decision: canonical.value.decision },
      });
      expect(JSON.stringify(result)).not.toContain(target);
    }
  });

  it("matches existing network allow and deny decisions without echoing URLs or request details", () => {
    for (const target of [
      { url: "https://api.example.com/flights", method: "GET" as const },
      { url: "https://other.example.com/flights", method: "GET" as const },
    ]) {
      const canonical = evaluateNetworkRequest(networkPolicy, target);
      expect(canonical.ok).toBe(true);
      if (!canonical.ok) continue;

      const result = evaluatePolicyCheck({ kind: "network", policy: networkPolicy, target });
      expect(result).toEqual({
        ok: true,
        value: { kind: "network", decision: canonical.value.decision },
      });
      expect(JSON.stringify(result)).not.toContain(target.url);
    }
  });

  it("keeps invalid policy configuration distinct from a valid deny and sanitizes nested policy errors", () => {
    const sensitiveField = "customer@example.com";
    const invalidPolicy = {
      version: "1",
      allowed: ["tool.search"],
      [sensitiveField]: true,
    };

    const result = evaluatePolicyCheck({
      kind: "capability",
      policy: invalidPolicy,
      target: "tool.search",
    });

    expect(result).toEqual({
      ok: false,
      issue: {
        code: "INVALID_POLICY",
        path: "$.policy",
        message: "policy check policy is invalid",
      },
    });
    expect(JSON.stringify(result)).not.toContain(sensitiveField);
  });

  it("normalizes invalid targets separately from invalid policy configuration", () => {
    expect(evaluatePolicyCheck({
      kind: "component",
      policy: componentPolicy,
      target: "",
    })).toEqual({
      ok: false,
      issue: {
        code: "INVALID_TARGET",
        path: "$.target",
        message: "policy check target is invalid",
      },
    });

    expect(evaluatePolicyCheck({
      kind: "network",
      policy: networkPolicy,
      target: { url: "http://api.example.com", method: "GET" },
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_TARGET", path: "$.target" },
    });
  });

  it("fails closed on unknown kinds and wrapper fields without reflecting arbitrary key names", () => {
    expect(evaluatePolicyCheck({
      kind: "identity",
      policy: {},
      target: {},
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_KIND", path: "$.kind" },
    });

    const sensitiveField = "prompt fragment@example.com";
    const result = evaluatePolicyCheck({
      kind: "capability",
      policy: capabilityPolicy,
      target: "tool.search",
      [sensitiveField]: true,
    });
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$" },
    });
    expect(JSON.stringify(result)).not.toContain(sensitiveField);
  });

  it("rejects accessor and symbol-backed wrapper state without executing getters", () => {
    let reads = 0;
    const accessorInput: Record<string, unknown> = {
      policy: capabilityPolicy,
      target: "tool.search",
    };
    Object.defineProperty(accessorInput, "kind", {
      enumerable: true,
      get() {
        reads += 1;
        return "capability";
      },
    });

    expect(evaluatePolicyCheck(accessorInput)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$.kind" },
    });
    expect(reads).toBe(0);

    const symbolInput = {
      kind: "capability",
      policy: capabilityPolicy,
      target: "tool.search",
    };
    Object.defineProperty(symbolInput, Symbol("secret"), { value: true });
    expect(evaluatePolicyCheck(symbolInput)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$" },
    });
  });

  it("delegates nested accessor validation to security without executing nested getters", () => {
    let reads = 0;
    const policy: Record<string, unknown> = { allowed: ["tool.search"] };
    Object.defineProperty(policy, "version", {
      enumerable: true,
      get() {
        reads += 1;
        return "1";
      },
    });

    expect(evaluatePolicyCheck({
      kind: "capability",
      policy,
      target: "tool.search",
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_POLICY", path: "$.policy" },
    });
    expect(reads).toBe(0);
  });
});
