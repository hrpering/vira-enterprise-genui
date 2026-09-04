import { describe, expect, it } from "vitest";
import {
  createViraAgtGovernanceProvider,
  createViraCedarGovernanceProvider,
  createViraOidcAgentIdentityProvider,
  createViraOpaGovernanceProvider,
  resolveViraAgentPrincipal,
  type ViraGovernanceContext,
} from "../../packages/governance/src/index.js";

const context: ViraGovernanceContext = {
  version: "1",
  instanceId: "instance-1",
  experienceId: "experience.checkout",
  experienceVersion: "1",
  platform: "web",
  actionIntent: {
    version: "1",
    instanceId: "instance-1",
    expectedStateRevision: 7,
    idempotencyKey: "idem:checkout-1",
    action: {
      id: "action-1",
      type: "commerce.order.submit",
      source: "user",
      payload: { amount: 100 },
    },
  },
};

describe("MASTER-09 injected governance adapters", () => {
  it("normalizes AGT/ACS allow deny escalate transform and warn", async () => {
    const verdicts = [
      ["allow", "allow"],
      ["warn", "allow"],
      ["deny", "deny"],
      ["escalate", "challenge"],
    ] as const;
    for (const [vendor, expected] of verdicts) {
      const provider = createViraAgtGovernanceProvider("governance.agt", {
        evaluate: () => ({ verdict: vendor, reason: `agt-${vendor}` }),
      });
      await expect(provider.evaluate(context)).resolves.toMatchObject({
        version: "1",
        provider: "governance.agt",
        effect: expected,
        reasonCode: `agt-${vendor}`,
      });
    }

    const transform = createViraAgtGovernanceProvider("governance.agt", {
      evaluate: () => ({ verdict: "transform", transformedPayload: { amount: 50 } }),
    });
    await expect(transform.evaluate(context)).resolves.toMatchObject({
      effect: "transform",
      transformedPayload: { amount: 50 },
    });
  });

  it("normalizes OPA boolean and bounded decision objects", async () => {
    const allow = createViraOpaGovernanceProvider("governance.opa", { evaluate: () => true });
    await expect(allow.evaluate(context)).resolves.toMatchObject({ effect: "allow", provider: "governance.opa" });

    const challenge = createViraOpaGovernanceProvider("governance.opa", {
      evaluate: () => ({ effect: "challenge", reasonCode: "manager.required", obligations: [] }),
    });
    await expect(challenge.evaluate(context)).resolves.toMatchObject({ effect: "challenge", reasonCode: "manager.required" });
  });

  it("normalizes Cedar Allow/Deny only", async () => {
    const allow = createViraCedarGovernanceProvider("governance.cedar", {
      authorize: () => ({ decision: "Allow" }),
    });
    await expect(allow.evaluate(context)).resolves.toMatchObject({ effect: "allow" });

    const malformed = createViraCedarGovernanceProvider("governance.cedar", {
      authorize: () => ({ decision: "Maybe" }),
    });
    await expect(malformed.evaluate(context)).rejects.toThrow(/invalid Cedar/);
  });

  it("accepts standard URL-shaped OIDC issuer identifiers and resolves an agent principal", async () => {
    const provider = createViraOidcAgentIdentityProvider("identity.oidc", {
      resolveClaims: () => ({
        sub: "agent-42",
        iss: "https://login.example.com/tenant/v2.0",
        aud: "vira",
      }),
    });
    const resolved = await resolveViraAgentPrincipal(provider, {
      version: "1",
      instanceId: "instance-1",
      credentialRef: "credential-ref-1",
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value).toMatchObject({
        kind: "agent",
        id: "agent-42",
        issuer: "https://login.example.com/tenant/v2.0",
      });
    }
  });

  it("fails closed on malformed vendor responses and OIDC issuers", async () => {
    const agt = createViraAgtGovernanceProvider("governance.agt", { evaluate: () => ({ verdict: "mystery" }) });
    await expect(agt.evaluate(context)).rejects.toThrow(/unknown AGT/);

    const oidc = createViraOidcAgentIdentityProvider("identity.oidc", {
      resolveClaims: () => ({ sub: "agent-42", iss: "not-a-url" }),
    });
    const resolved = await resolveViraAgentPrincipal(oidc, {
      version: "1",
      instanceId: "instance-1",
      credentialRef: "credential-ref-1",
    });
    expect(resolved.ok).toBe(false);
  });
});
