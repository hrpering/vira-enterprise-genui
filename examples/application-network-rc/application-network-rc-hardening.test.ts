import { describe, expect, it } from "vitest";
import { prepareViraApplicationDistribution } from "@vira-enterprise-genui/application-publisher-sdk";

function application(capabilityVersion: string) {
  return {
    schemaVersion: "1",
    identity: { id: "acme.network-rc-hardening" },
    version: "1.0.0",
    publisher: { id: "acme", name: "Acme" },
    experiences: [{
      id: "acme.network-rc-hardening.main",
      packId: "acme/network-rc-hardening",
      packVersion: "1.0.0",
      entrypoint: "main",
    }],
    capabilities: [{ id: "acme.catalog-search", versionRef: capabilityVersion }],
    contextTypes: [],
    actions: [],
    flows: [],
    brandRef: null,
    governanceRequirements: [],
    hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    distribution: {
      name: "Acme Application Network RC Hardening",
      tags: ["network", "rc", "hardening"],
      visibility: "public" as const,
      discoverable: true,
    },
    commercial: { entitlementRefs: [], meteringRefs: [] },
  };
}

describe("MASTER-51 Application Network RC hardening", () => {
  it("rejects floating Application Capability references before invoking the publisher digest provider", async () => {
    let digestCalls = 0;
    const result = await prepareViraApplicationDistribution(
      { publisherId: "acme", application: application("latest") },
      () => {
        digestCalls += 1;
        return "a".repeat(64);
      },
    );

    expect(digestCalls).toBe(0);
    expect(result).toMatchObject({
      ok: false,
      issue: {
        code: "INVALID_APPLICATION",
        applicationCode: "FLOATING_REFERENCE",
        path: "$.application.capabilities[0].versionRef",
      },
    });
  });

  it("rejects wildcard Application Capability references before invoking the publisher digest provider", async () => {
    let digestCalls = 0;
    const result = await prepareViraApplicationDistribution(
      { publisherId: "acme", application: application("1.x") },
      () => {
        digestCalls += 1;
        return "a".repeat(64);
      },
    );

    expect(digestCalls).toBe(0);
    expect(result).toMatchObject({
      ok: false,
      issue: {
        code: "INVALID_APPLICATION",
        applicationCode: "FLOATING_REFERENCE",
        path: "$.application.capabilities[0].versionRef",
      },
    });
  });
});
