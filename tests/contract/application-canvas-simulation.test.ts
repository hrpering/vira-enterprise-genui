import { describe, expect, it } from "vitest";
import {
  VIRA_CANVAS_SIMULATION_MAX_STEPS,
  VIRA_CANVAS_SIMULATION_MODE,
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

function graph(name = "Flight Graph") {
  return {
    schemaVersion: "1",
    id: "vira.flight-application-graph",
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    metadata: { name },
    nodes: [
      { id: "search-surface", target: { kind: "experience", ref: { id: "travel.flight.search", packId: "vira/flight-booking", packVersion: "2.1.0", entrypoint: "main" } } },
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

type ProjectionMode = "default" | "changed" | "empty";

function draft(editorRevision = 7, projectionMode: ProjectionMode = "default", graphName = "Flight Graph") {
  const projection = projectionMode === "empty"
    ? { activeGraphRef: null, graphViews: [] }
    : {
        activeGraphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
        graphViews: [{
          graphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
          nodeLayouts: [{ nodeId: "search-surface", x: projectionMode === "changed" ? 900 : 100, y: projectionMode === "changed" ? -400 : 80 }],
          viewport: projectionMode === "changed" ? { x: 120, y: 60, zoom: 2 } : { x: 0, y: 0, zoom: 1 },
          selection: { nodeIds: [], edgeIds: [] },
        }],
      };
  return {
    schemaVersion: "1",
    draftId: "flight-draft-1",
    editorRevision,
    semantics: { application: application(), graphs: [graph(graphName)] },
    projection,
  };
}

const graphRef = { id: "vira.flight-application-graph", version: "1.0.0" } as const;

describe("Vira Canvas Simulation + Replay v1", () => {
  it("simulates an explicit semantic path without invoking runtime providers", () => {
    const result = simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "search-path", graphRef, startNodeId: "search-surface", edgeIds: ["surface-search", "search-context"] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe(VIRA_CANVAS_SIMULATION_MODE);
    expect(result.value.frames).toEqual([
      { index: 0, nodeId: "search-surface", nodeKind: "experience", viaEdgeId: null },
      { index: 1, nodeId: "flight-search", nodeKind: "capability", viaEdgeId: "surface-search" },
      { index: 2, nodeId: "trip-context", nodeKind: "context", viaEdgeId: "search-context" },
    ]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.frames)).toBe(true);
    expect(typeof result.value.semanticsSnapshot).toBe("string");
  });

  it("treats Action nodes as explicitly dry-run frames rather than executing protected effects", () => {
    const result = simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "book-path", graphRef, startNodeId: "search-surface", edgeIds: ["surface-book"] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe("dry-run");
    expect(result.value.frames[1]).toEqual({ index: 1, nodeId: "book-flight", nodeKind: "action", viaEdgeId: "surface-book" });
    expect(Object.keys(result.value).sort()).toEqual([
      "applicationRef", "frames", "graphRef", "mode", "scenarioId", "semanticsSnapshot", "sourceDraftId", "version",
    ]);
  });

  it("supports cycles because ApplicationGraph is not a DAG workflow engine", () => {
    const result = simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "context-cycle", graphRef, startNodeId: "flight-search", edgeIds: ["search-context", "context-search", "search-context"] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frames.map((entry) => entry.nodeId)).toEqual(["flight-search", "trip-context", "flight-search", "trip-context"]);
  });

  it("fails closed on non-contiguous explicit paths", () => {
    expect(simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "bad-path", graphRef, startNodeId: "search-surface", edgeIds: ["search-context"] },
    })).toMatchObject({ ok: false, issue: { code: "EDGE_PATH_MISMATCH" } });
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
    expect(simulateViraCanvasScenario({
      draft: draft(),
      scenario: {
        id: "too-long",
        graphRef,
        startNodeId: "search-surface",
        edgeIds: Array.from({ length: VIRA_CANVAS_SIMULATION_MAX_STEPS + 1 }, () => "surface-search"),
      },
    })).toMatchObject({ ok: false, issue: { code: "STEP_LIMIT_EXCEEDED" } });
  });

  it("replays after projection-only and editorRevision changes", () => {
    const simulated = simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "search-path", graphRef, startNodeId: "search-surface", edgeIds: ["surface-search"] },
    });
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    const replayed = replayViraCanvasSimulation({ draft: draft(99, "changed"), trace: simulated.value });
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) return;
    expect(replayed.value.mode).toBe("dry-run");
    expect(replayed.value.matched).toBe(true);
    expect(replayed.value.frames).toEqual(simulated.value.frames);
  });

  it("detects semantic drift even without an Application version bump", () => {
    const simulated = simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "search-path", graphRef, startNodeId: "search-surface", edgeIds: ["surface-search"] },
    });
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    expect(replayViraCanvasSimulation({ draft: draft(7, "default", "Changed Flight Graph"), trace: simulated.value }))
      .toMatchObject({ ok: false, issue: { code: "SEMANTIC_DRIFT" } });
  });

  it("rejects tampered trace frames and non-dry-run trace claims", () => {
    const simulated = simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "search-path", graphRef, startNodeId: "search-surface", edgeIds: ["surface-search"] },
    });
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;

    const badFrameTrace = JSON.parse(JSON.stringify(simulated.value)) as Record<string, unknown>;
    const frames = badFrameTrace.frames as Array<Record<string, unknown>>;
    frames[1]!.nodeId = "book-flight";
    expect(replayViraCanvasSimulation({ draft: draft(), trace: badFrameTrace }))
      .toMatchObject({ ok: false, issue: { code: "INVALID_TRACE" } });

    const claimedExecution = JSON.parse(JSON.stringify(simulated.value)) as Record<string, unknown>;
    claimedExecution.mode = "executed";
    expect(replayViraCanvasSimulation({ draft: draft(), trace: claimedExecution }))
      .toMatchObject({ ok: false, issue: { code: "INVALID_TRACE", path: "$.trace.mode" } });
  });

  it("rejects unsafe accessor and custom-prototype outer inputs through the shared JSON boundary", () => {
    const root: Record<string, unknown> = { scenario: { id: "safe", graphRef, startNodeId: "search-surface", edgeIds: [] } };
    Object.defineProperty(root, "draft", { enumerable: true, get: () => draft() });
    expect(simulateViraCanvasScenario(root)).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });

    const customPrototype = Object.create({ hidden: true }) as Record<string, unknown>;
    customPrototype.draft = draft();
    customPrototype.scenario = { id: "safe", graphRef, startNodeId: "search-surface", edgeIds: [] };
    expect(simulateViraCanvasScenario(customPrototype)).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });
  });

  it("rejects unsafe accessor scenario and trace inputs", () => {
    const scenario: Record<string, unknown> = { graphRef, startNodeId: "search-surface", edgeIds: [] };
    Object.defineProperty(scenario, "id", { enumerable: true, get: () => "unsafe" });
    expect(simulateViraCanvasScenario({ draft: draft(), scenario })).toMatchObject({ ok: false, issue: { code: "INVALID_SCENARIO" } });

    const simulated = simulateViraCanvasScenario({
      draft: draft(),
      scenario: { id: "safe", graphRef, startNodeId: "search-surface", edgeIds: [] },
    });
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    const trace: Record<string, unknown> = { ...simulated.value };
    Object.defineProperty(trace, "scenarioId", { enumerable: true, get: () => "unsafe" });
    expect(replayViraCanvasSimulation({ draft: draft(), trace })).toMatchObject({ ok: false, issue: { code: "INVALID_TRACE" } });
  });

  it("produces the same semantic evidence regardless of projection metadata", () => {
    const first = simulateViraCanvasScenario({
      draft: draft(1),
      scenario: { id: "same", graphRef, startNodeId: "flight-search", edgeIds: ["search-context", "context-search"] },
    });
    const second = simulateViraCanvasScenario({
      draft: draft(500, "empty"),
      scenario: { id: "same", graphRef, startNodeId: "flight-search", edgeIds: ["search-context", "context-search"] },
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.semanticsSnapshot).toBe(second.value.semanticsSnapshot);
    expect(first.value.frames).toEqual(second.value.frames);
  });
});
