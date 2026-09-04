import { describe, expect, it } from "vitest";
import {
  VIRA_CANVAS_SIMULATION_MAX_STEPS,
  replayViraCanvasSimulation,
  simulateViraCanvasScenario,
} from "../../packages/application-canvas-simulation/src/index.js";

function application() {
  return {
    schemaVersion: "1",
    identity: { id: "vira.flight-assistant" },
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [{ id: "travel.flight.search", packId: "vira/flight-booking", packVersion: "2.1.0", entrypoint: "main" }],
    capabilities: [{ id: "vira.flight-search", versionRef: "1.0.0" }],
    contextTypes: [{ id: "vira.trip-context", versionRef: "1.0.0" }],
    actions: [{ actionType: "travel.flight.book" }],
    flows: [{ id: "vira.flight-application-graph", versionRef: "1.0.0" }],
    brandRef: null,
    governanceRequirements: [],
    hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
    protocolProjections: [],
    distribution: { name: "Flight Assistant", tags: ["travel"], visibility: "private", discoverable: false },
    commercial: { entitlementRefs: [], meteringRefs: [] },
  };
}

function graph() {
  return {
    schemaVersion: "1",
    id: "vira.flight-application-graph",
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    metadata: { name: "Flight Graph" },
    nodes: [
      {
        id: "search-surface",
        target: {
          kind: "experience",
          ref: { id: "travel.flight.search", packId: "vira/flight-booking", packVersion: "2.1.0", entrypoint: "main" },
        },
      },
      { id: "flight-search", target: { kind: "capability", ref: { id: "vira.flight-search", versionRef: "1.0.0" } } },
      { id: "trip-context", target: { kind: "context", ref: { id: "vira.trip-context", versionRef: "1.0.0" } } },
      { id: "book-flight", target: { kind: "action", actionType: "travel.flight.book" } },
    ],
    edges: [
      { id: "surface-search", kind: "experience-uses-capability", from: "search-surface", to: "flight-search" },
      { id: "search-context", kind: "context-output", from: "flight-search", to: "trip-context" },
      { id: "context-search", kind: "context-input", from: "trip-context", to: "flight-search" },
      { id: "surface-book", kind: "experience-offers-action", from: "search-surface", to: "book-flight" },
    ],
  };
}

function draft(editorRevision = 7) {
  return {
    schemaVersion: "1",
    draftId: "flight-draft-1",
    editorRevision,
    semantics: { application: application(), graphs: [graph()] },
    projection: {
      activeGraphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
      graphViews: [{
        graphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
        nodeLayouts: [{ nodeId: "search-surface", x: 100, y: 80 }],
        viewport: { x: 0, y: 0, zoom: 1 },
        selection: { nodeIds: [], edgeIds: [] },
      }],
    },
  };
}

const graphRef = { id: "vira.flight-application-graph", version: "1.0.0" } as const;

describe("Vira Canvas Simulation + Replay v1", () => {
  it("simulates an explicit semantic path without invoking runtime providers", () => {
    const result = simulateViraCanvasScenario({
      draft: draft(),
      scenario: {
        id: "search-path",
        graphRef,
        startNodeId: "search-surface",
        edgeIds: ["surface-search", "search-context"],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frames).toEqual([
      { index: 0, nodeId: "search-surface", nodeKind: "experience", viaEdgeId: null },
      { index: 1, nodeId: "flight-search", nodeKind: "capability", viaEdgeId: "surface-search" },
      { index: 2, nodeId: "trip-context", nodeKind: "context", viaEdgeId: "search-context" },
    ]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.frames)).toBe(true);
    expect(typeof result.value.semanticsSnapshot).toBe("string");
  });

  it("treats Action nodes as dry-run semantic frames rather than executing protected effects", () => {
    const result = simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "book-path", graphRef, startNodeId: "search-surface", edgeIds: ["surface-book"] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frames[1]).toEqual({
      index: 1,
      nodeId: "book-flight",
      nodeKind: "action",
      viaEdgeId: "surface-book",
    });
    expect(Object.keys(result.value).sort()).toEqual([
      "applicationRef",
      "frames",
      "graphRef",
      "scenarioId",
      "semanticsSnapshot",
      "sourceDraftId",
      "version",
    ]);
  });

  it("supports semantic cycles because ApplicationGraph is not a DAG workflow engine", () => {
    const result = simulateViraCanvasScenario({
      draft: draft(),
      scenario: {
        id: "context-cycle",
        graphRef,
        startNodeId: "flight-search",
        edgeIds: ["search-context", "context-search", "search-context"],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frames.map((entry) => entry.nodeId)).toEqual([
      "flight-search",
      "trip-context",
      "flight-search",
      "trip-context",
    ]);
  });

  it("fails closed when an explicit edge does not continue from the current node", () => {
    const result = simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "bad-path", graphRef, startNodeId: "search-surface", edgeIds: ["search-context"] },
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "EDGE_PATH_MISMATCH" } });
  });

  it("rejects missing graphs, nodes and edges without fallback", () => {
    expect(simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "missing-graph", graphRef: { id: "vira.missing", version: "1.0.0" }, startNodeId: "x", edgeIds: [] },
    })).toMatchObject({ ok: false, issue: { code: "GRAPH_NOT_FOUND" } });

    expect(simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "missing-node", graphRef, startNodeId: "missing", edgeIds: [] },
    })).toMatchObject({ ok: false, issue: { code: "NODE_NOT_FOUND" } });

    expect(simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "missing-edge", graphRef, startNodeId: "search-surface", edgeIds: ["missing"] },
    })).toMatchObject({ ok: false, issue: { code: "EDGE_NOT_FOUND" } });
  });

  it("enforces the bounded scenario step limit", () => {
    const result = simulateViraCanvasScenario({
      draft: draft(),
      scenario: {
        id: "too-long",
        graphRef,
        startNodeId: "search-surface",
        edgeIds: Array.from({ length: VIRA_CANVAS_SIMULATION_MAX_STEPS + 1 }, () => "surface-search"),
      },
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "STEP_LIMIT_EXCEEDED" } });
  });

  it("replays deterministically after projection-only and editorRevision changes", () => {
    const simulated = simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "search-path", graphRef, startNodeId: "search-surface", edgeIds: ["surface-search"] },
    });
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;

    const changedProjection = draft(99);
    changedProjection.projection.graphViews[0]!.nodeLayouts[0] = { nodeId: "search-surface", x: 900, y: -400 };
    changedProjection.projection.graphViews[0]!.viewport = { x: 120, y: 60, zoom: 2 };

    const replayed = replayViraCanvasSimulation({ draft: changedProjection, trace: simulated.value });
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) return;
    expect(replayed.value.matched).toBe(true);
    expect(replayed.value.frames).toEqual(simulated.value.frames);
  });

  it("detects semantic drift even when Application release identity was not bumped in the draft", () => {
    const simulated = simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "search-path", graphRef, startNodeId: "search-surface", edgeIds: ["surface-search"] },
    });
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;

    const changed = draft();
    changed.semantics.graphs[0]!.metadata = { name: "Changed Flight Graph" };
    const replayed = replayViraCanvasSimulation({ draft: changed, trace: simulated.value });
    expect(replayed).toMatchObject({ ok: false, issue: { code: "SEMANTIC_DRIFT" } });
  });

  it("rejects tampered trace frames instead of trusting replay evidence", () => {
    const simulated = simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "search-path", graphRef, startNodeId: "search-surface", edgeIds: ["surface-search"] },
    });
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    const trace = JSON.parse(JSON.stringify(simulated.value)) as Record<string, unknown>;
    const frames = trace.frames as Array<Record<string, unknown>>;
    frames[1]!.nodeId = "book-flight";
    const replayed = replayViraCanvasSimulation({ draft: draft(), trace });
    expect(replayed).toMatchObject({ ok: false, issue: { code: "INVALID_TRACE" } });
  });

  it("rejects unsafe accessor scenario and trace inputs through the shared JSON boundary", () => {
    const scenario: Record<string, unknown> = {
      graphRef,
      startNodeId: "search-surface",
      edgeIds: [],
    };
    Object.defineProperty(scenario, "id", { enumerable: true, get: () => "unsafe" });
    expect(simulateViraCanvasScenario({ draft: draft(), scenario })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_SCENARIO" },
    });

    const simulated = simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "safe", graphRef, startNodeId: "search-surface", edgeIds: [] },
    });
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    const trace: Record<string, unknown> = { ...simulated.value };
    Object.defineProperty(trace, "scenarioId", { enumerable: true, get: () => "unsafe" });
    expect(replayViraCanvasSimulation({ draft: draft(), trace })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_TRACE" },
    });
  });

  it("serializes the same semantic scenario deterministically regardless of projection metadata", () => {
    const first = simulateViraCanvasScenario({
      draft: draft(1),
      scenario: { id: "same", graphRef, startNodeId: "flight-search", edgeIds: ["search-context", "context-search"] },
    });
    const secondDraft = draft(500);
    secondDraft.projection.activeGraphRef = null;
    secondDraft.projection.graphViews = [];
    const second = simulateViraCanvasScenario({
      draft: secondDraft,
      scenario: { id: "same", graphRef, startNodeId: "flight-search", edgeIds: ["search-context", "context-search"] },
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.semanticsSnapshot).toBe(second.value.semanticsSnapshot);
    expect(first.value.frames).toEqual(second.value.frames);
  });
});
