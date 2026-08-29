import { describe, expect, it } from "vitest";
import {
  createNetworkPolicy,
  evaluateNetworkRequest,
} from "../../packages/security/src/index.js";

const policy = (rules: unknown[]) => ({ version: "1", rules });

describe("security deny-by-default network policy", () => {
  it("allows only exact normalized HTTPS origin plus explicit method", () => {
    const input = policy([
      { origin: "https://api.example.com:443/", methods: ["GET", "POST"] },
    ]);
    expect(evaluateNetworkRequest(input, {
      url: "https://api.example.com/v1/search?q=berlin",
      method: "POST",
    })).toMatchObject({
      ok: true,
      value: {
        decision: "allow",
        reason: "allowed",
        request: { origin: "https://api.example.com", method: "POST" },
      },
    });

    expect(evaluateNetworkRequest(input, {
      url: "https://api.example.com/v1/search",
      method: "DELETE",
    })).toMatchObject({ ok: true, value: { decision: "deny", reason: "method-not-allowed" } });

    for (const url of [
      "https://sub.api.example.com/v1/search",
      "https://api.example.com:8443/v1/search",
      "https://example.com/v1/search",
    ]) {
      expect(evaluateNetworkRequest(input, { url, method: "POST" })).toMatchObject({
        ok: true,
        value: { decision: "deny", reason: "origin-not-allowed" },
      });
    }
  });

  it("supports explicit deny-all with no implicit same-origin behavior", () => {
    expect(evaluateNetworkRequest(policy([]), {
      url: "https://api.example.com/v1/search",
      method: "GET",
    })).toMatchObject({ ok: true, value: { decision: "deny", reason: "origin-not-allowed" } });
  });

  it("rejects non-HTTPS, credentials, wildcard hostnames, fragments, and non-origin policy URLs", () => {
    for (const origin of [
      "http://api.example.com",
      "https://user:pass@api.example.com",
      "https://api.example.com/v1",
      "https://api.example.com?x=1",
      "https://api.example.com#fragment",
      "*.example.com",
      "https://*.example.com",
      "https://foo*.example.com",
      "https://%2A.example.com",
    ]) {
      expect(createNetworkPolicy(policy([{ origin, methods: ["GET"] }]))).toMatchObject({
        ok: false,
        issue: { code: "INVALID_ORIGIN" },
      });
    }

    for (const url of [
      "http://api.example.com/v1",
      "https://user:pass@api.example.com/v1",
      "https://api.example.com/v1#fragment",
      "https://*.example.com/v1",
      "https://foo*.example.com/v1",
      "https://%2A.example.com/v1",
    ]) {
      expect(evaluateNetworkRequest(policy([]), { url, method: "GET" })).toMatchObject({
        ok: false,
        issue: { code: "INVALID_URL", path: "$.request.url" },
      });
    }
  });

  it("normalizes and freezes policy while rejecting duplicate origins/methods", () => {
    const created = createNetworkPolicy(policy([
      { origin: "https://API.Example.com:443", methods: ["GET", "POST"] },
    ]));
    expect(created).toMatchObject({
      ok: true,
      value: { rules: [{ origin: "https://api.example.com", methods: ["GET", "POST"] }] },
    });
    if (!created.ok) return;
    expect(Object.isFrozen(created.value)).toBe(true);
    expect(Object.isFrozen(created.value.rules)).toBe(true);
    expect(Object.isFrozen(created.value.rules[0])).toBe(true);
    expect(Object.isFrozen(created.value.rules[0]?.methods)).toBe(true);

    expect(createNetworkPolicy(policy([
      { origin: "https://api.example.com", methods: ["GET"] },
      { origin: "https://api.example.com:443/", methods: ["POST"] },
    ]))).toMatchObject({ ok: false, issue: { code: "DUPLICATE_ORIGIN", path: "$.rules[1].origin" } });

    expect(createNetworkPolicy(policy([
      { origin: "https://api.example.com", methods: ["GET", "GET"] },
    ]))).toMatchObject({ ok: false, issue: { code: "DUPLICATE_METHOD", path: "$.rules[0].methods[1]" } });
  });

  it("rejects accessor/custom policy state without invoking getters", () => {
    let reads = 0;
    const rule: Record<string, unknown> = { origin: "https://api.example.com" };
    Object.defineProperty(rule, "methods", {
      enumerable: true,
      get() {
        reads += 1;
        return ["GET"];
      },
    });
    expect(createNetworkPolicy(policy([rule]))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_METHODS", path: "$.rules[0].methods" },
    });
    expect(reads).toBe(0);

    expect(createNetworkPolicy({ version: "1", rules: [], wildcard: "*" })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.wildcard" },
    });
  });

  it("never performs I/O and rejects unsupported/lowercase methods", () => {
    const input = policy([{ origin: "https://api.example.com", methods: ["POST"] }]);
    expect(evaluateNetworkRequest(input, { url: "https://api.example.com", method: "post" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_METHOD", path: "$.request.method" },
    });
    expect(evaluateNetworkRequest(input, { url: "https://api.example.com", method: "TRACE" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_METHOD", path: "$.request.method" },
    });
  });
});
