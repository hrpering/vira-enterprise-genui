import { describe, expect, it } from "vitest";
import {
  authorizeContentSink,
  createCspHostRequirements,
  createNetworkPolicy,
  createPlainTextContent,
  evaluateCapabilityAllowlist,
  evaluateNetworkRequest,
} from "../../packages/security/src/index.js";

describe("security deterministic golden gate", () => {
  it("locks plain-text-only rendering, exact capability authorization, exact network authorization, and CSP host requirements", () => {
    const markupLookingText = '<img src=x onerror="steal()"><script>run()</script>';
    const text = createPlainTextContent(markupLookingText);
    expect(text).toEqual({
      ok: true,
      value: { sink: "plain-text", value: markupLookingText },
    });
    expect(authorizeContentSink("plain-text")).toEqual({ ok: true, value: "plain-text" });
    expect(authorizeContentSink("html")).toMatchObject({
      ok: false,
      issue: { code: "UNSUPPORTED_SINK" },
    });

    const capabilityPolicy = { version: "1", allowed: ["submit-search"] };
    expect(evaluateCapabilityAllowlist(capabilityPolicy, "submit-search")).toMatchObject({
      ok: true,
      value: { decision: "allow" },
    });
    expect(evaluateCapabilityAllowlist(capabilityPolicy, "submit-search.admin")).toMatchObject({
      ok: true,
      value: { decision: "deny" },
    });

    const rawNetworkRules = [{ origin: "https://API.example.com:443/", methods: ["POST"] }];
    const rawNetworkPolicy = { version: "1", rules: rawNetworkRules };
    const network = createNetworkPolicy(rawNetworkPolicy);
    expect(network).toMatchObject({
      ok: true,
      value: { rules: [{ origin: "https://api.example.com", methods: ["POST"] }] },
    });
    if (!network.ok) return;

    expect(evaluateNetworkRequest(network.value, {
      url: "https://api.example.com/v1/search",
      method: "POST",
    })).toMatchObject({ ok: true, value: { decision: "allow", reason: "allowed" } });
    expect(evaluateNetworkRequest(network.value, {
      url: "https://api.example.com/v1/search",
      method: "GET",
    })).toMatchObject({ ok: true, value: { decision: "deny", reason: "method-not-allowed" } });
    expect(evaluateNetworkRequest(network.value, {
      url: "https://sub.api.example.com/v1/search",
      method: "POST",
    })).toMatchObject({ ok: true, value: { decision: "deny", reason: "origin-not-allowed" } });
    expect(evaluateNetworkRequest(network.value, {
      url: "https://%2A.example.com/v1/search",
      method: "POST",
    })).toMatchObject({ ok: false, issue: { code: "INVALID_URL" } });

    const csp = createCspHostRequirements(network.value);
    expect(csp).toEqual({
      ok: true,
      value: {
        version: "1",
        scriptSrc: {
          directive: "script-src",
          mode: "forbid-sources",
          sources: ["'unsafe-inline'", "'unsafe-eval'"],
        },
        scriptSrcAttr: { directive: "script-src-attr", mode: "deny-all" },
        objectSrc: { directive: "object-src", mode: "deny-all" },
        connectSrc: {
          directive: "connect-src",
          mode: "require-origins",
          origins: ["https://api.example.com"],
        },
      },
    });

    rawNetworkRules[0]!.origin = "https://mutated.example.com";
    rawNetworkRules[0]!.methods[0] = "GET";
    expect(network.value.rules[0]).toEqual({ origin: "https://api.example.com", methods: ["POST"] });
    if (csp.ok) expect(csp.value.connectSrc.origins).toEqual(["https://api.example.com"]);
  });

  it("keeps each security owner narrow instead of silently substituting one control for another", () => {
    const capabilityPolicy = { version: "1", allowed: ["submit-search"] };
    expect(evaluateCapabilityAllowlist(capabilityPolicy, "submit-search")).toMatchObject({
      ok: true,
      value: { decision: "allow" },
    });

    const networkPolicy = {
      version: "1",
      rules: [{ origin: "https://api.example.com", methods: ["POST"] }],
    };
    expect(evaluateNetworkRequest(networkPolicy, {
      url: "https://api.example.com",
      method: "GET",
    })).toMatchObject({ ok: true, value: { decision: "deny", reason: "method-not-allowed" } });

    const csp = createCspHostRequirements(networkPolicy);
    expect(csp).toMatchObject({
      ok: true,
      value: { connectSrc: { origins: ["https://api.example.com"] } },
    });

    expect(authorizeContentSink("html")).toMatchObject({ ok: false });
  });
});
