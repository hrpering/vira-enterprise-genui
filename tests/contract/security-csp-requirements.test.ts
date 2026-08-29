import { describe, expect, it } from "vitest";
import { createCspHostRequirements } from "../../packages/security/src/index.js";

const networkPolicy = (rules: unknown[]) => ({ version: "1", rules });

describe("security CSP host requirements", () => {
  it("derives deterministic minimum CSP constraints from normalized network origins", () => {
    const result = createCspHostRequirements(networkPolicy([
      { origin: "https://z.example.com:443/", methods: ["GET"] },
      { origin: "https://api.example.com", methods: ["POST", "GET"] },
    ]));

    expect(result).toEqual({
      ok: true,
      value: {
        version: "1",
        scriptSrc: {
          directive: "script-src",
          mode: "forbid-sources",
          sources: ["'unsafe-inline'", "'unsafe-eval'"],
        },
        scriptSrcAttr: {
          directive: "script-src-attr",
          mode: "deny-all",
        },
        objectSrc: {
          directive: "object-src",
          mode: "deny-all",
        },
        connectSrc: {
          directive: "connect-src",
          mode: "require-origins",
          origins: ["https://api.example.com", "https://z.example.com"],
        },
      },
    });
  });

  it("keeps an empty network policy as no required Vira connect origins", () => {
    const result = createCspHostRequirements(networkPolicy([]));
    expect(result).toMatchObject({
      ok: true,
      value: { connectSrc: { origins: [] } },
    });
  });

  it("does not encode HTTP methods into CSP connect requirements", () => {
    const get = createCspHostRequirements(networkPolicy([
      { origin: "https://api.example.com", methods: ["GET"] },
    ]));
    const post = createCspHostRequirements(networkPolicy([
      { origin: "https://api.example.com", methods: ["POST"] },
    ]));
    expect(get.ok && post.ok).toBe(true);
    if (!get.ok || !post.ok) return;
    expect(get.value.connectSrc).toEqual(post.value.connectSrc);
  });

  it("rejects invalid network policy with a nested public path", () => {
    expect(createCspHostRequirements(networkPolicy([
      { origin: "https://*.example.com", methods: ["GET"] },
    ]))).toMatchObject({
      ok: false,
      issue: {
        code: "INVALID_NETWORK_POLICY",
        path: "$.networkPolicy.rules[0].origin",
      },
    });

    expect(createCspHostRequirements({ version: "1", rules: [], extra: true })).toMatchObject({
      ok: false,
      issue: {
        code: "INVALID_NETWORK_POLICY",
        path: "$.networkPolicy.extra",
      },
    });
  });

  it("returns deeply immutable requirements without retaining caller-owned network state", () => {
    const rules = [{ origin: "https://api.example.com", methods: ["GET"] }];
    const input = networkPolicy(rules);
    const result = createCspHostRequirements(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    rules[0]!.origin = "https://mutated.example.com";
    rules[0]!.methods[0] = "POST";

    expect(result.value.connectSrc.origins).toEqual(["https://api.example.com"]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.scriptSrc)).toBe(true);
    expect(Object.isFrozen(result.value.scriptSrc.sources)).toBe(true);
    expect(Object.isFrozen(result.value.scriptSrcAttr)).toBe(true);
    expect(Object.isFrozen(result.value.objectSrc)).toBe(true);
    expect(Object.isFrozen(result.value.connectSrc)).toBe(true);
    expect(Object.isFrozen(result.value.connectSrc.origins)).toBe(true);
  });
});
