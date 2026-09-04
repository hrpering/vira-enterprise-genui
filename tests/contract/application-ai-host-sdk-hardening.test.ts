import { describe, expect, it } from "vitest";
import { evaluateViraApplicationForAiHost } from "../../packages/application-ai-host-sdk/src/index.js";

const DIGEST = "b".repeat(64);

function application() {
  return {
    schemaVersion: "1",
    identity: { id: "vira.ai-host-hardening" },
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [{
      id: "hardening.main",
      packId: "vira/hardening-pack",
      packVersion: "1.0.0",
      entrypoint: "main",
    }],
    capabilities: [],
    contextTypes: [],
    actions: [],
    flows: [],
    brandRef: null,
    governanceRequirements: [],
    hostCompatibility: {
      minViraVersion: "1.0.0",
      requiredCapabilities: [],
    },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    distribution: {
      name: "Hardening",
      tags: ["hardening"],
      visibility: "public",
      discoverable: true,
    },
    commercial: { entitlementRefs: [], meteringRefs: [] },
  };
}

function source() {
  return {
    schemaVersion: "1",
    application: application(),
    integrity: { algorithm: "sha256", digest: DIGEST },
  };
}

function host() {
  return {
    viraVersion: "1.0.0",
    capabilities: [],
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
  };
}

describe("Vira Application AI-host SDK hardening", () => {
  it("rejects invalid host data before invoking the external integrity verifier", async () => {
    let calls = 0;
    const verifier = () => {
      calls += 1;
      return true;
    };

    const invalidVersion = await evaluateViraApplicationForAiHost(
      { source: source(), host: { ...host(), viraVersion: "01.0.0" } },
      verifier,
    );
    expect(invalidVersion).toMatchObject({ ok: false, issue: { code: "INVALID_HOST" } });

    const floatingProjection = await evaluateViraApplicationForAiHost(
      {
        source: source(),
        host: {
          ...host(),
          protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "current" }],
        },
      },
      verifier,
    );
    expect(floatingProjection).toMatchObject({ ok: false, issue: { code: "INVALID_HOST" } });
    expect(calls).toBe(0);
  });

  it("rejects transport, credential and execution authority smuggling at root and host shapes", async () => {
    const verifier = () => true;
    for (const field of ["url", "endpoint", "transport", "credential", "token", "execute", "authorize", "deploy", "publish"]) {
      const rootResult = await evaluateViraApplicationForAiHost(
        { source: source(), host: host(), [field]: "forbidden" },
        verifier,
      );
      expect(rootResult).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });

      const hostResult = await evaluateViraApplicationForAiHost(
        { source: source(), host: { ...host(), [field]: "forbidden" } },
        verifier,
      );
      expect(hostResult).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.host.${field}` },
      });
    }
  });

  it("fails closed on unsafe accessors and custom-prototype inputs before verifier invocation", async () => {
    let calls = 0;
    const verifier = () => {
      calls += 1;
      return true;
    };

    const accessor: Record<string, unknown> = { source: source() };
    Object.defineProperty(accessor, "host", {
      enumerable: true,
      get() {
        throw new Error("must not execute");
      },
    });
    expect(await evaluateViraApplicationForAiHost(accessor, verifier)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });

    const custom = Object.assign(
      Object.create({ inherited: true }) as Record<string, unknown>,
      { source: source(), host: host() },
    );
    expect(await evaluateViraApplicationForAiHost(custom, verifier)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });
    expect(calls).toBe(0);
  });

  it("requires literal verifier success and never treats truthy provider data as integrity verification", async () => {
    const result = await evaluateViraApplicationForAiHost(
      { source: source(), host: host() },
      () => "verified" as never,
    );
    expect(result).toMatchObject({
      ok: false,
      issue: {
        code: "SOURCE_INTEGRITY_FAILED",
        distributionCode: "INTEGRITY_VERIFICATION_FAILED",
      },
    });
  });

  it("bounds host-declared capability and protocol support collections", async () => {
    const tooManyCapabilities = Array.from({ length: 257 }, (_, index) => `host.capability-${index}`);
    const capabilityResult = await evaluateViraApplicationForAiHost(
      { source: source(), host: { ...host(), capabilities: tooManyCapabilities } },
      () => true,
    );
    expect(capabilityResult).toMatchObject({ ok: false, issue: { code: "INVALID_HOST" } });

    const tooManyProjections = Array.from({ length: 257 }, (_, index) => ({
      id: `protocol.projection-${index}`,
      versionRef: "1",
    }));
    const projectionResult = await evaluateViraApplicationForAiHost(
      { source: source(), host: { ...host(), protocolProjections: tooManyProjections } },
      () => true,
    );
    expect(projectionResult).toMatchObject({ ok: false, issue: { code: "INVALID_HOST" } });
  });
});
