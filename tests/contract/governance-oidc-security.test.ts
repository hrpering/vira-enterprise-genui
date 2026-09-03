import { describe, expect, it } from "vitest";
import {
  createViraOidcAgentIdentityProvider,
  resolveViraAgentPrincipal,
} from "../../packages/governance/src/index.js";

async function resolveIssuer(issuer: string) {
  const provider = createViraOidcAgentIdentityProvider("identity.oidc", {
    resolveClaims: () => ({ sub: "agent-1", iss: issuer }),
  });
  return resolveViraAgentPrincipal(provider, {
    version: "1",
    instanceId: "instance-1",
    credentialRef: "credential-ref-1",
  });
}

describe("MASTER-09 OIDC issuer boundary", () => {
  it("accepts HTTPS issuer with optional path", async () => {
    const result = await resolveIssuer("https://login.example.com/tenant/v2.0");
    expect(result.ok).toBe(true);
  });

  it("rejects insecure, query-bearing and fragment-bearing issuer identifiers", async () => {
    for (const issuer of [
      "http://login.example.com/tenant",
      "https://login.example.com/tenant?x=1",
      "https://login.example.com/tenant#fragment",
    ]) {
      const result = await resolveIssuer(issuer);
      expect(result.ok).toBe(false);
    }
  });
});
