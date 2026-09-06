import { describe, expect, it } from "vitest";
import {
  replayViraCanvasSimulationV2,
  simulateViraCanvasScenarioV2,
} from "../../packages/application-canvas-simulation/src/index.js";

function applicationFixture(description = "A governed flight application."): Record<string, unknown> {
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
      description,
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

function draftFixture(description?: string): Record<string, unknown> {
  return {
    schemaVersion: "2",
    draftId: "draft-flight-simulation-v2",
    editorRevision: 0,
    semantics: {
      application: applicationFixture(description),
      graphs: [graphFixture()],
    },
    projection: { activeGraphRef: null, graphViews: [] },
  };
}

function scenarioFixture() {
  return {
    id: "flight-dry-run",
    graphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
    startNodeId: "surface",
    edgeIds: ["offer"],
  };
}

describe("Canvas simulation V2", () => {
  it("produces a dry-run trace with exact V2 semantics and replays deterministically", () => {
    const simulated = simulateViraCanvasScenarioV2({
      draft: draftFixture(),
      scenario: scenarioFixture(),
    });
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;

    expect(simulated.value).toMatchObject({
      version: "2",
      mode: "dry-run",
      scenarioId: "flight-dry-run",
      sourceDraftId: "draft-flight-simulation-v2",
      applicationRef: { id: "vira.flight-assistant", version: "1.2.0" },
      graphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
      frames: [
        { index: 0, nodeId: "surface", nodeKind: "experience", viaEdgeId: null },
        { index: 1, nodeId: "book", nodeKind: "action", viaEdgeId: "offer" },
      ],
    });

    const semantics = JSON.parse(simulated.value.semanticsSnapshot) as {
      application: { actions: unknown[] };
      graphs: Array<{ nodes: Array<{ target: unknown }> }>;
    };
    expect(semantics.application.actions).toEqual([
      { id: "travel.flight.book", versionRef: "2026-09-05" },
    ]);
    expect(semantics.graphs[0]?.nodes[1]?.target).toEqual({
      kind: "action",
      ref: { id: "travel.flight.book", versionRef: "2026-09-05" },
    });

    const replayed = replayViraCanvasSimulationV2({
      draft: draftFixture(),
      trace: simulated.value,
    });
    expect(replayed).toMatchObject({
      ok: true,
      value: { version: "2", mode: "dry-run", matched: true },
    });
  });

  it("fails closed when current V2 semantics drift from the trace snapshot", () => {
    const simulated = simulateViraCanvasScenarioV2({
      draft: draftFixture(),
      scenario: scenarioFixture(),
    });
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;

    const replayed = replayViraCanvasSimulationV2({
      draft: draftFixture("A changed governed flight application."),
      trace: simulated.value,
    });
    expect(replayed).toMatchObject({
      ok: false,
      issue: { code: "SEMANTIC_DRIFT", path: "$.trace.semanticsSnapshot" },
    });
  });

  it("rejects any trace that attempts to leave explicit dry-run mode", () => {
    const simulated = simulateViraCanvasScenarioV2({
      draft: draftFixture(),
      scenario: scenarioFixture(),
    });
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;

    const replayed = replayViraCanvasSimulationV2({
      draft: draftFixture(),
      trace: { ...simulated.value, mode: "live" },
    });
    expect(replayed).toMatchObject({
      ok: false,
      issue: { code: "INVALID_TRACE", path: "$.trace.mode" },
    });
  });
});
