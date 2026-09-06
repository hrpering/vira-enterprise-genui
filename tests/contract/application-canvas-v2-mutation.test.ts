import { describe, expect, it } from "vitest";
import {
  createViraCanvasMutationSessionV2,
  parseViraCanvasDraftV2,
} from "../../packages/application-canvas/src/index.js";

function applicationFixture(): Record<string, unknown> {
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
    contextTypes: [{ id: "travel.flight.work-context", versionRef: "1" }],
    actions: [{ id: "travel.flight.book", versionRef: "2026-09-05" }],
    flows: [{ id: "travel.flight.booking-flow", versionRef: "1" }],
    brandRef: { id: "brand.vira", versionRef: "1" },
    governanceRequirements: [{ id: "governance.booking-approval", versionRef: "1" }],
    hostCompatibility: {
      minViraVersion: "1.0.0",
      maxViraVersion: "2.0.0",
      requiredCapabilities: ["host.date-picker"],
    },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    triggers: [{
      type: "api",
      entrypointRef: { id: "travel.flight.booking-flow", versionRef: "1" },
    }],
    distribution: {
      name: "Flight Assistant",
      description: "A governed flight application.",
      tags: ["travel", "booking"],
      visibility: "organization",
      discoverable: true,
    },
    commercial: {
      entitlementRefs: [{ id: "entitlement.flight-assistant", versionRef: "1" }],
      meteringRefs: [{ id: "metering.flight-assistant", versionRef: "1" }],
      pricingRefs: [{ id: "pricing.flight-assistant", versionRef: "1" }],
      settlementRefs: [{ id: "settlement.flight-assistant", versionRef: "1" }],
    },
  };
}

function graphFixture(): Record<string, unknown> {
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
          ref: { id: "travel.flight.book", versionRef: "2026-09-05" },
        },
      },
    ],
    edges: [{ id: "offer", kind: "experience-offers-action", from: "surface", to: "book" }],
  };
}

function draftFixture(editorRevision = 0): Record<string, unknown> {
  return {
    schemaVersion: "2",
    draftId: "draft-flight-v2",
    editorRevision,
    semantics: {
      application: applicationFixture(),
      graphs: [graphFixture()],
    },
    projection: {
      activeGraphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
      graphViews: [{
        graphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
        nodeLayouts: [
          { nodeId: "surface", x: 10, y: 20 },
          { nodeId: "book", x: 200, y: 20 },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
        selection: { nodeIds: [], edgeIds: [] },
      }],
    },
  };
}

describe("Canvas V2 mutation authority", () => {
  it("keeps V2 exact-reference semantics while editing projection state", () => {
    const session = createViraCanvasMutationSessionV2(draftFixture());
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const moved = session.value.setNodeLayout({
      expectedRevision: 0,
      graphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
      nodeId: "book",
      x: 240,
      y: 64,
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.value.schemaVersion).toBe("2");
    expect(moved.value.editorRevision).toBe(1);
    expect(moved.value.semantics.application.actions[0]).toEqual({
      id: "travel.flight.book",
      versionRef: "2026-09-05",
    });
    expect(moved.value.semantics.graphs[0]?.nodes[1]?.target).toEqual({
      kind: "action",
      ref: { id: "travel.flight.book", versionRef: "2026-09-05" },
    });
    expect(moved.value.projection.graphViews[0]?.nodeLayouts[1]).toEqual({
      nodeId: "book",
      x: 240,
      y: 64,
    });
  });

  it("enforces editorRevision CAS for V2 mutations", () => {
    const session = createViraCanvasMutationSessionV2(draftFixture());
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const first = session.value.setViewport({
      expectedRevision: 0,
      graphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
      x: 1,
      y: 2,
      zoom: 1.2,
    });
    expect(first.ok).toBe(true);

    const stale = session.value.setViewport({
      expectedRevision: 0,
      graphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
      x: 3,
      y: 4,
      zoom: 1.1,
    });
    expect(stale).toMatchObject({
      ok: false,
      issue: { code: "STALE_REVISION", path: "$.expectedRevision" },
    });
  });

  it("fails closed when replaceSemantics would downgrade protected V2 Action refs", () => {
    const parsed = parseViraCanvasDraftV2(draftFixture());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const session = createViraCanvasMutationSessionV2(parsed.value);
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const application = structuredClone(parsed.value.semantics.application) as unknown as Record<string, unknown>;
    application.actions = [{ actionType: "travel.flight.book" }];
    const result = session.value.replaceSemantics({
      expectedRevision: 0,
      semantics: {
        application: application as never,
        graphs: parsed.value.semantics.graphs,
      },
    });

    expect(result).toMatchObject({
      ok: false,
      issue: { code: "MUTATION_FAILED" },
    });
    expect(session.value.currentDraft().editorRevision).toBe(0);
  });

  it("fails closed before editorRevision overflow", () => {
    const session = createViraCanvasMutationSessionV2(draftFixture(Number.MAX_SAFE_INTEGER));
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const result = session.value.setActiveGraph({
      expectedRevision: Number.MAX_SAFE_INTEGER,
      graphRef: null,
    });
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "REVISION_EXHAUSTED", path: "$.editorRevision" },
    });
  });
});
