import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseViraApplicationDistributionEnvelopeV2,
  verifyViraApplicationDistributionIntegrityV2,
  type ViraApplicationDistributionVerifierInput,
} from "../../packages/application-distribution/src/index.js";
import {
  lookupViraFederatedApplicationV2,
  parseViraApplicationFederationSnapshotV2,
} from "../../packages/application-federation/src/index.js";
import {
  evaluateViraApplicationForAiHostV2,
} from "../../packages/application-ai-host-sdk/src/index.js";
import {
  parseViraApplicationProtocolProjectionV2,
} from "../../packages/application-protocol-projection/src/index.js";
import {
  prepareViraApplicationDistributionV2,
  type ViraApplicationPublisherDigestInputV2,
} from "../../packages/application-publisher-sdk/src/index.js";
import {
  parseViraCanvasDraftV2,
} from "../../packages/application-canvas/src/index.js";
import {
  replayViraCanvasSimulationV2,
  simulateViraCanvasScenarioV2,
} from "../../packages/application-canvas-simulation/src/index.js";

function applicationFixture(
  actionVersion = "2026-09-05",
  visibility: "private" | "organization" | "public" = "private",
): Record<string, unknown> {
  return {
    schemaVersion: "2",
    identity: { id: "vira.flight-assistant" },
    version: "1.2.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [{
      id: "travel.flight.search",
      packId: "vira/flight-booking",
      packVersion: "2.1.0",
      entrypoint: "main",
    }],
    capabilities: [{ id: "travel.flight.search-capability", versionRef: "1" }],
    contextTypes: [],
    actions: [{ id: "travel.flight.book", versionRef: actionVersion }],
    flows: [{ id: "travel.flight.booking-flow", versionRef: "1" }],
    brandRef: null,
    governanceRequirements: [],
    hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    triggers: [{
      type: "api",
      entrypointRef: { id: "travel.flight.booking-flow", versionRef: "1" },
    }],
    distribution: {
      name: "Flight Assistant",
      tags: ["travel"],
      visibility,
      discoverable: visibility === "public",
    },
    commercial: {
      entitlementRefs: [{ id: "entitlement.flight-assistant", versionRef: "1" }],
      meteringRefs: [{ id: "metering.flight-assistant", versionRef: "1" }],
      pricingRefs: [{ id: "pricing.flight-assistant", versionRef: "1" }],
      settlementRefs: [{ id: "settlement.flight-assistant", versionRef: "1" }],
    },
  };
}

function graphFixture(actionVersion = "2026-09-05"): Record<string, unknown> {
  return {
    schemaVersion: "2",
    id: "vira.flight-application-graph",
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    metadata: { name: "Flight Application Graph" },
    nodes: [
      {
        id: "surface",
        target: {
          kind: "experience",
          ref: {
            id: "travel.flight.search",
            packId: "vira/flight-booking",
            packVersion: "2.1.0",
            entrypoint: "main",
          },
        },
      },
      {
        id: "book",
        target: {
          kind: "action",
          ref: { id: "travel.flight.book", versionRef: actionVersion },
        },
      },
    ],
    edges: [{ id: "offer", kind: "experience-offers-action", from: "surface", to: "book" }],
  };
}

function canvasFixture(actionVersion = "2026-09-05"): Record<string, unknown> {
  return {
    schemaVersion: "2",
    draftId: "flight-draft",
    editorRevision: 4,
    semantics: {
      application: applicationFixture(actionVersion),
      graphs: [graphFixture(actionVersion)],
    },
    projection: {
      activeGraphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
      graphViews: [{
        graphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
        nodeLayouts: [
          { nodeId: "surface", x: 0, y: 0 },
          { nodeId: "book", x: 100, y: 0 },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
        selection: { nodeIds: [], edgeIds: [] },
      }],
    },
  };
}

function scenario() {
  return {
    id: "book-flight",
    graphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
    startNodeId: "surface",
    edgeIds: ["offer"],
  };
}

function digestV2({ canonicalArtifact }: ViraApplicationPublisherDigestInputV2): string {
  return createHash("sha256").update(canonicalArtifact).digest("hex");
}

function verifyDigest({ digest, canonicalArtifact }: ViraApplicationDistributionVerifierInput): boolean {
  return createHash("sha256").update(canonicalArtifact).digest("hex") === digest;
}

async function preparedEnvelope(
  visibility: "private" | "organization" | "public" = "private",
) {
  return prepareViraApplicationDistributionV2(
    { publisherId: "vira", application: applicationFixture("2026-09-05", visibility) },
    digestV2,
  );
}

describe("Application V2 consumer adaptation", () => {
  it("publishes and verifies a V2 distribution without dropping Action version identity", async () => {
    const prepared = await preparedEnvelope();
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value.envelope.application.actions[0]).toEqual({
      id: "travel.flight.book",
      versionRef: "2026-09-05",
    });
    expect(parseViraApplicationDistributionEnvelopeV2(prepared.value.envelope).ok).toBe(true);

    const verified = await verifyViraApplicationDistributionIntegrityV2(
      prepared.value.envelope,
      verifyDigest,
    );
    expect(verified.ok).toBe(true);
  });

  it("projects protocols from a V2 distribution while preserving the exact V2 source", async () => {
    const prepared = await preparedEnvelope();
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const projection = parseViraApplicationProtocolProjectionV2({
      schemaVersion: "2",
      source: prepared.value.envelope,
      projectionRef: { id: "protocol.mcp-apps", versionRef: "1" },
      result: { fidelity: "lossless", payload: { ok: true } },
    });
    expect(projection.ok).toBe(true);
    if (!projection.ok) return;
    expect(projection.value.source.application.actions[0]).toEqual({
      id: "travel.flight.book",
      versionRef: "2026-09-05",
    });
  });

  it("evaluates a V2 distribution for an AI host without downgrading the returned source", async () => {
    const prepared = await preparedEnvelope();
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const evaluated = await evaluateViraApplicationForAiHostV2({
      source: prepared.value.envelope,
      host: {
        viraVersion: "1.5.0",
        capabilities: [],
        protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
      },
    }, verifyDigest);
    expect(evaluated.ok).toBe(true);
    if (!evaluated.ok) return;
    expect(evaluated.value.source.application.actions[0]).toEqual({
      id: "travel.flight.book",
      versionRef: "2026-09-05",
    });
    expect(evaluated.value.compatibleProtocolProjections).toEqual([
      { id: "protocol.mcp-apps", versionRef: "1" },
    ]);
  });

  it("federates and looks up only public V2 envelopes while preserving exact Actions", async () => {
    const prepared = await preparedEnvelope("public");
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const snapshot = {
      schemaVersion: "2",
      sources: [{ sourceId: "catalog-a", applications: [prepared.value.envelope] }],
    };
    const parsed = parseViraApplicationFederationSnapshotV2(snapshot);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const lookup = lookupViraFederatedApplicationV2(parsed.value, {
      applicationId: "vira.flight-assistant",
      applicationVersion: "1.2.0",
    });
    expect(lookup.ok).toBe(true);
    if (!lookup.ok) return;
    expect(lookup.value.sourceIds).toEqual(["catalog-a"]);
    expect(lookup.value.envelope?.application.actions[0]).toEqual({
      id: "travel.flight.book",
      versionRef: "2026-09-05",
    });

    const privatePrepared = await preparedEnvelope("private");
    expect(privatePrepared.ok).toBe(true);
    if (!privatePrepared.ok) return;
    expect(parseViraApplicationFederationSnapshotV2({
      schemaVersion: "2",
      sources: [{ sourceId: "catalog-a", applications: [privatePrepared.value.envelope] }],
    })).toMatchObject({
      ok: false,
      issue: { code: "NON_PUBLIC_APPLICATION" },
    });
  });

  it("requires Canvas graph Action refs to close exactly over Application V2 Actions", () => {
    expect(parseViraCanvasDraftV2(canvasFixture()).ok).toBe(true);

    const mismatched = canvasFixture();
    const semantics = mismatched.semantics as { graphs: Array<Record<string, unknown>> };
    semantics.graphs = [graphFixture("2026-09-06")];
    expect(parseViraCanvasDraftV2(mismatched)).toMatchObject({
      ok: false,
      issue: {
        code: "INVALID_GRAPH",
        path: "$.semantics.graphs[0].nodes[1].target.ref",
      },
    });
  });

  it("preserves exact Action versions in simulation evidence and rejects replay after semantic drift", () => {
    const simulated = simulateViraCanvasScenarioV2({ draft: canvasFixture(), scenario: scenario() });
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    expect(simulated.value.semanticsSnapshot).toContain('"versionRef":"2026-09-05"');

    const replayed = replayViraCanvasSimulationV2({ draft: canvasFixture(), trace: simulated.value });
    expect(replayed).toMatchObject({ ok: true, value: { matched: true } });

    const drifted = replayViraCanvasSimulationV2({
      draft: canvasFixture("2026-09-06"),
      trace: simulated.value,
    });
    expect(drifted).toMatchObject({
      ok: false,
      issue: { code: "SEMANTIC_DRIFT", path: "$.trace.semanticsSnapshot" },
    });
  });
});
