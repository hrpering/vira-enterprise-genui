import { describe, expect, it } from "vitest";
import { parseViraApplicationExactReference } from "../../packages/application-package/src/index.js";
import { evaluateViraApplicationForAiHost } from "../../packages/application-ai-host-sdk/src/index.js";

const DIGEST = "c".repeat(64);

function source() {
  return {
    schemaVersion: "1",
    application: {
      schemaVersion: "1",
      identity: { id: "acme.owner-parity" },
      version: "1.0.0",
      publisher: { id: "acme", name: "Acme" },
      experiences: [{ id: "acme.main", packId: "acme/main", packVersion: "1.0.0", entrypoint: "main" }],
      capabilities: [],
      contextTypes: [],
      actions: [],
      flows: [],
      brandRef: null,
      governanceRequirements: [],
      hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
      protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
      distribution: { name: "Owner parity", tags: ["proof"], visibility: "public", discoverable: true },
      commercial: { entitlementRefs: [], meteringRefs: [] },
    },
    integrity: { algorithm: "sha256", digest: DIGEST },
  };
}

function host(reference: unknown) {
  return {
    viraVersion: "1.0.0",
    capabilities: [],
    protocolProjections: [reference],
  };
}

describe("AI-host exact-reference canonical owner parity", () => {
  it("accepts host projection references accepted by the canonical Application exact-reference owner", async () => {
    for (const reference of [
      { id: "protocol.mcp-apps", versionRef: "1" },
      { id: "protocol.ag-ui", versionRef: "1.2.3" },
    ]) {
      expect(parseViraApplicationExactReference(reference).ok).toBe(true);
      const result = await evaluateViraApplicationForAiHost(
        { source: source(), host: host(reference) },
        () => true,
      );
      expect(result.ok).toBe(true);
    }
  });

  it("rejects every host projection reference rejected by the canonical owner before integrity verification", async () => {
    const rejected: unknown[] = [
      { id: "protocol.mcp-apps", versionRef: "latest" },
      { id: "protocol.mcp-apps", versionRef: "1.x" },
      { id: "protocol.mcp-apps", versionRef: "1", priority: 1 },
      { id: "bad id", versionRef: "1" },
    ];

    for (const reference of rejected) {
      let verifierCalls = 0;
      expect(parseViraApplicationExactReference(reference).ok).toBe(false);
      const result = await evaluateViraApplicationForAiHost(
        { source: source(), host: host(reference) },
        () => {
          verifierCalls += 1;
          return true;
        },
      );
      expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_HOST" } });
      expect(verifierCalls).toBe(0);
    }
  });

  it("preserves canonical owner error location under the AI-host descriptor path", async () => {
    const result = await evaluateViraApplicationForAiHost(
      { source: source(), host: host({ id: "protocol.mcp-apps", versionRef: "current" }) },
      () => true,
    );
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_HOST", path: "$.host.protocolProjections[0].versionRef" },
    });
  });
});
