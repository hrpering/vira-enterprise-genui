import { describe, expect, it } from "vitest";
import { VIRA_APPLICATION_PROTOCOL_PROJECTION_MAX_LOSSES, parseViraApplicationProtocolProjection } from "../../packages/application-protocol-projection/src/index.js";

const DIGEST = "c".repeat(64);
const PROJECTION = { id: "protocol.mcp-apps", versionRef: "1" } as const;

function artifact(losses: unknown[]) {
  return {
    schemaVersion: "1",
    source: {
      schemaVersion: "1",
      application: {
        schemaVersion: "1",
        identity: { id: "vira.projection-hardening" },
        version: "1.0.0",
        publisher: { id: "vira", name: "Vira" },
        experiences: [],
        capabilities: [{ id: "vira.projection-capability", versionRef: "1" }],
        contextTypes: [],
        actions: [],
        flows: [],
        brandRef: null,
        governanceRequirements: [],
        hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
        protocolProjections: [PROJECTION],
        distribution: { name: "Projection hardening", tags: [], visibility: "private", discoverable: false },
        commercial: { entitlementRefs: [], meteringRefs: [] },
      },
      integrity: { algorithm: "sha256", digest: DIGEST },
    },
    projectionRef: PROJECTION,
    result: { fidelity: "lossy", payload: {}, losses },
  };
}

describe("Vira Application Protocol Projection hardening", () => {
  it("rejects prefix-collision paths that are not actually rooted at $.application", () => {
    expect(parseViraApplicationProtocolProjection(artifact([
      { path: "$.applicationx.actions[0]", reason: "prefix collision" },
    ]))).toMatchObject({ ok: false, issue: { code: "INVALID_LOSS_PATH" } });
  });

  it("enforces the explicit semantic-loss collection bound", () => {
    const losses = Array.from({ length: VIRA_APPLICATION_PROTOCOL_PROJECTION_MAX_LOSSES + 1 }, (_, index) => ({
      path: `$.application.capabilities[${index}]`,
      reason: `loss-${index}`,
    }));
    expect(parseViraApplicationProtocolProjection(artifact(losses))).toMatchObject({
      ok: false,
      issue: { code: "LOSS_LIMIT_EXCEEDED", path: "$.result.losses" },
    });
  });

  it("accepts the Application root itself as an explicit semantic loss path", () => {
    const result = parseViraApplicationProtocolProjection(artifact([
      { path: "$.application", reason: "Target protocol cannot represent the Application semantics." },
    ]));
    expect(result.ok).toBe(true);
  });
});
