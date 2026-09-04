import { describe, expect, it } from "vitest";
import type { ViraApplicationDistributionVerifierInput } from "../../packages/application-distribution/src/index.js";
import { evaluateViraApplicationForAiHost } from "../../packages/application-ai-host-sdk/src/index.js";

const DIGEST = "a".repeat(64);

function application() {
  return {
    schemaVersion: "1",
    identity: { id: "vira.ai-host-demo" },
    version: "1.4.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [{
      id: "demo.main",
      packId: "vira/demo-pack",
      packVersion: "1.0.0",
      entrypoint: "main",
    }],
    capabilities: [{ id: "demo.search", versionRef: "1" }],
    contextTypes: [],
    actions: [],
    flows: [],
    brandRef: null,
    governanceRequirements: [],
    hostCompatibility: {
      minViraVersion: "1.2.0",
      maxViraVersion: "2.0.0",
      requiredCapabilities: ["host.streaming"],
    },
    protocolProjections: [
      { id: "protocol.a2ui", versionRef: "2" },
      { id: "protocol.mcp-apps", versionRef: "1" },
    ],
    distribution: {
      name: "AI Host Demo",
      tags: ["demo"],
      visibility: "public",
      discoverable: true,
    },
    commercial: { entitlementRefs: [], meteringRefs: [] },
  };
}

function source(app: unknown = application()) {
  return {
    schemaVersion: "1",
    application: app,
    integrity: { algorithm: "sha256", digest: DIGEST },
  };
}

function host() {
  return {
    viraVersion: "1.5.0",
    capabilities: ["host.streaming", "host.tools"],
    protocolProjections: [
      { id: "protocol.ag-ui", versionRef: "1" },
      { id: "protocol.mcp-apps", versionRef: "1" },
    ],
  };
}

function input(sourceValue: unknown = source(), hostValue: unknown = host()) {
  return { source: sourceValue, host: hostValue };
}

const verifier = () => true;

describe("Vira Application AI-host SDK v1", () => {
  it("returns a frozen compatibility plan only after source integrity and host compatibility succeed", async () => {
    const result = await evaluateViraApplicationForAiHost(input(), verifier);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.sdkVersion).toBe("1");
    expect(result.value.source.application.identity.id).toBe("vira.ai-host-demo");
    expect(result.value.host.viraVersion).toBe("1.5.0");
    expect(result.value.compatibleProtocolProjections).toEqual([
      { id: "protocol.mcp-apps", versionRef: "1" },
    ]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.host)).toBe(true);
    expect(Object.isFrozen(result.value.compatibleProtocolProjections)).toBe(true);
    for (const forbidden of ["execute", "authorize", "deploy", "publish", "projectionArtifact", "entitled"]) {
      expect(forbidden in result.value).toBe(false);
    }
  });

  it("delegates integrity verification against the canonical Application artifact", async () => {
    let seen: ViraApplicationDistributionVerifierInput | undefined;
    const result = await evaluateViraApplicationForAiHost(
      input(),
      (value: ViraApplicationDistributionVerifierInput) => {
        seen = value;
        return true;
      },
    );
    expect(result.ok).toBe(true);
    expect(seen).toBeDefined();
    if (!seen) return;
    expect(seen.algorithm).toBe("sha256");
    expect(seen.digest).toBe(DIGEST);
    expect(seen.canonicalArtifact).toContain('"id":"vira.ai-host-demo"');
    expect(Object.isFrozen(seen)).toBe(true);
  });

  it("rejects hosts below the Application minimum Vira version", async () => {
    const result = await evaluateViraApplicationForAiHost(
      input(source(), { ...host(), viraVersion: "1.1.9" }),
      verifier,
    );
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "HOST_VERSION_UNSUPPORTED", path: "$.host.viraVersion" },
    });
  });

  it("rejects hosts above the Application maximum Vira version", async () => {
    const result = await evaluateViraApplicationForAiHost(
      input(source(), { ...host(), viraVersion: "2.0.1" }),
      verifier,
    );
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "HOST_VERSION_UNSUPPORTED", path: "$.host.viraVersion" },
    });
  });

  it("rejects a host missing any required host capability", async () => {
    const result = await evaluateViraApplicationForAiHost(
      input(source(), { ...host(), capabilities: ["host.tools"] }),
      verifier,
    );
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "MISSING_HOST_CAPABILITY", path: "$.host.capabilities" },
    });
  });

  it("keeps protocol egress separate from runtime compatibility when the exact intersection is empty", async () => {
    const result = await evaluateViraApplicationForAiHost(
      input(source(), {
        ...host(),
        protocolProjections: [{ id: "protocol.ag-ui", versionRef: "1" }],
      }),
      verifier,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.compatibleProtocolProjections).toEqual([]);
  });

  it("requires exact projection versions and never treats same-id different-version support as compatible", async () => {
    const result = await evaluateViraApplicationForAiHost(
      input(source(), {
        ...host(),
        protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "2" }],
      }),
      verifier,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.compatibleProtocolProjections).toEqual([]);
  });

  it("rejects floating protocol projection versions in the host descriptor", async () => {
    const result = await evaluateViraApplicationForAiHost(
      input(source(), {
        ...host(),
        protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "latest" }],
      }),
      verifier,
    );
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_HOST", path: "$.host.protocolProjections[0].versionRef" },
    });
  });

  it("rejects duplicate host capabilities and projection references", async () => {
    const duplicateCapability = await evaluateViraApplicationForAiHost(
      input(source(), {
        ...host(),
        capabilities: ["host.streaming", "host.streaming"],
      }),
      verifier,
    );
    expect(duplicateCapability).toMatchObject({ ok: false, issue: { code: "INVALID_HOST" } });

    const duplicateProjection = await evaluateViraApplicationForAiHost(
      input(source(), {
        ...host(),
        protocolProjections: [
          { id: "protocol.mcp-apps", versionRef: "1" },
          { id: "protocol.mcp-apps", versionRef: "1" },
        ],
      }),
      verifier,
    );
    expect(duplicateProjection).toMatchObject({ ok: false, issue: { code: "INVALID_HOST" } });
  });

  it("maps malformed source semantics to the canonical Distribution owner", async () => {
    const app = application();
    const result = await evaluateViraApplicationForAiHost(
      input(source({ ...app, version: "latest" })),
      verifier,
    );
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_SOURCE", distributionCode: "INVALID_APPLICATION" },
    });
  });

  it("fails closed when the integrity verifier is absent, rejects the digest, or throws", async () => {
    const missing = await evaluateViraApplicationForAiHost(input(), undefined);
    expect(missing).toMatchObject({ ok: false, issue: { code: "INVALID_INTEGRITY_VERIFIER" } });

    const rejected = await evaluateViraApplicationForAiHost(input(), () => false);
    expect(rejected).toMatchObject({
      ok: false,
      issue: { code: "SOURCE_INTEGRITY_FAILED", distributionCode: "INTEGRITY_VERIFICATION_FAILED" },
    });

    const thrown = await evaluateViraApplicationForAiHost(input(), () => {
      throw new Error("offline");
    });
    expect(thrown).toMatchObject({
      ok: false,
      issue: { code: "SOURCE_INTEGRITY_FAILED", distributionCode: "INTEGRITY_VERIFIER_FAILED" },
    });
  });

  it("detaches the compatibility plan from caller-owned mutable host and source input", async () => {
    const app = application();
    const hostValue = host();
    const result = await evaluateViraApplicationForAiHost(input(source(app), hostValue), verifier);
    expect(result.ok).toBe(true);
    app.distribution.name = "mutated later";
    hostValue.capabilities[0] = "host.changed";
    if (!result.ok) return;
    expect(result.value.source.application.distribution.name).toBe("AI Host Demo");
    expect(result.value.host.capabilities).toContain("host.streaming");
  });
});
