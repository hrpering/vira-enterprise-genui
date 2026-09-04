import { describe, expect, it } from "vitest";
import {
  VIRA_CANVAS_MAX_COORDINATE,
  VIRA_CANVAS_MAX_GRAPH_VIEWS,
  VIRA_CANVAS_MAX_NODE_LAYOUTS,
  VIRA_CANVAS_MAX_SELECTED_NODES,
  parseViraCanvasDraft,
  serializeViraCanvasDraft,
  serializeViraCanvasSemantics,
} from "../../packages/application-canvas/src/index.js";

function application() {
  return {
    schemaVersion: "1",
    identity: { id: "vira.flight-assistant" },
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [{
      id: "travel.flight.search",
      packId: "vira/flight-booking",
      packVersion: "2.1.0",
      entrypoint: "main",
    }],
    capabilities: [{ id: "vira.flight-search", versionRef: "1.0.0" }],
    contextTypes: [{ id: "vira.trip-context", versionRef: "1.0.0" }],
    actions: [{ actionType: "travel.flight.book" }],
    flows: [{ id: "vira.flight-application-graph", versionRef: "1.0.0" }],
    brandRef: null,
    governanceRequirements: [],
    hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
    protocolProjections: [],
    distribution: {
      name: "Flight Assistant",
      tags: ["travel"],
      visibility: "private",
      discoverable: false,
    },
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
          ref: {
            id: "travel.flight.search",
            packId: "vira/flight-booking",
            packVersion: "2.1.0",
            entrypoint: "main",
          },
        },
      },
      {
        id: "flight-search",
        target: { kind: "capability", ref: { id: "vira.flight-search", versionRef: "1.0.0" } },
      },
      {
        id: "trip-context",
        target: { kind: "context", ref: { id: "vira.trip-context", versionRef: "1.0.0" } },
      },
    ],
    edges: [
      { id: "surface-search", kind: "experience-uses-capability", from: "search-surface", to: "flight-search" },
      { id: "context-search", kind: "context-input", from: "trip-context", to: "flight-search" },
    ],
  };
}

function fixture(): Record<string, unknown> {
  return {
    schemaVersion: "1",
    draftId: "flight-draft-1",
    editorRevision: 3,
    semantics: { application: application(), graphs: [graph()] },
    projection: {
      activeGraphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
      graphViews: [{
        graphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
        nodeLayouts: [
          { nodeId: "search-surface", x: 120, y: 80 },
          { nodeId: "flight-search", x: 480, y: 80 },
          { nodeId: "trip-context", x: 300, y: 300 },
        ],
        viewport: { x: 10, y: 20, zoom: 1 },
        selection: { nodeIds: ["search-surface"], edgeIds: ["surface-search"] },
      }],
    },
  };
}

describe("Vira Canvas Foundation v1", () => {
  it("parses canonical semantics plus editor-only projection into detached deeply frozen data", () => {
    const input = fixture();
    const result = parseViraCanvasDraft(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toBe(input);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.semantics.application)).toBe(true);
    expect(Object.isFrozen(result.value.semantics.graphs[0])).toBe(true);
    expect(Object.isFrozen(result.value.projection.graphViews[0]?.nodeLayouts)).toBe(true);
  });

  it("delegates Application and ApplicationGraph semantics to their canonical owners", () => {
    const invalidApplication = fixture();
    const semantics = invalidApplication.semantics as Record<string, unknown>;
    semantics.application = { ...(semantics.application as Record<string, unknown>), apiKey: "secret" };
    expect(parseViraCanvasDraft(invalidApplication)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_APPLICATION", path: "$.semantics.application.apiKey" },
    });

    const invalidGraph = fixture();
    const graphSemantics = invalidGraph.semantics as { graphs: Array<Record<string, unknown>> };
    graphSemantics.graphs[0] = { ...graphSemantics.graphs[0]!, retry: { maxAttempts: 3 } };
    expect(parseViraCanvasDraft(invalidGraph)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_GRAPH", path: "$.semantics.graphs[0].retry" },
    });
  });

  it("keeps projection changes outside canonical Application semantics", () => {
    const first = fixture();
    const second = fixture();
    const projection = second.projection as { graphViews: Array<Record<string, unknown>> };
    const view = projection.graphViews[0]!;
    view.viewport = { x: 900, y: -400, zoom: 2 };
    view.nodeLayouts = [{ nodeId: "search-surface", x: 900, y: 500 }];
    view.selection = { nodeIds: [], edgeIds: [] };

    const firstSemantics = serializeViraCanvasSemantics(first);
    const secondSemantics = serializeViraCanvasSemantics(second);
    const firstDraft = serializeViraCanvasDraft(first);
    const secondDraft = serializeViraCanvasDraft(second);
    expect(firstSemantics.ok).toBe(true);
    expect(secondSemantics.ok).toBe(true);
    expect(firstDraft.ok).toBe(true);
    expect(secondDraft.ok).toBe(true);
    if (!firstSemantics.ok || !secondSemantics.ok || !firstDraft.ok || !secondDraft.ok) return;
    expect(firstSemantics.value).toBe(secondSemantics.value);
    expect(firstDraft.value).not.toBe(secondDraft.value);
  });

  it("rejects runtime, deployment, provider, governance and direct-execution authority smuggling", () => {
    for (const extra of [
      { runtimeRevision: 7 },
      { runtimeState: {} },
      { deployment: "prod" },
      { provider: "mcp" },
      { credentials: { token: "secret" } },
      { governanceVerdict: "allow" },
      { execute: true },
      { published: true },
    ]) {
      expect(parseViraCanvasDraft({ ...fixture(), ...extra })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD" },
      });
    }
  });

  it("keeps editorRevision distinct and bounded from runtime revision semantics", () => {
    expect(parseViraCanvasDraft({ ...fixture(), editorRevision: -1 })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_EDITOR_REVISION", path: "$.editorRevision" },
    });
    expect(parseViraCanvasDraft({ ...fixture(), editorRevision: 1.2 })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_EDITOR_REVISION", path: "$.editorRevision" },
    });
  });

  it("rejects projection graph references not present in semantic drafts", () => {
    const active = fixture();
    const activeProjection = active.projection as Record<string, unknown>;
    activeProjection.activeGraphRef = { id: "vira.missing-graph", version: "1.0.0" };
    expect(parseViraCanvasDraft(active)).toMatchObject({
      ok: false,
      issue: { code: "GRAPH_NOT_FOUND", path: "$.projection.activeGraphRef" },
    });

    const view = fixture();
    const viewProjection = view.projection as { graphViews: Array<Record<string, unknown>> };
    viewProjection.graphViews[0] = {
      ...viewProjection.graphViews[0]!,
      graphRef: { id: "vira.missing-graph", version: "1.0.0" },
    };
    expect(parseViraCanvasDraft(view)).toMatchObject({
      ok: false,
      issue: { code: "GRAPH_NOT_FOUND", path: "$.projection.graphViews[0].graphRef" },
    });
  });

  it("validates node layouts against canonical graph nodes and coordinate bounds", () => {
    const unknown = fixture();
    const projection = unknown.projection as { graphViews: Array<Record<string, unknown>> };
    projection.graphViews[0]!.nodeLayouts = [{ nodeId: "missing-node", x: 0, y: 0 }];
    expect(parseViraCanvasDraft(unknown)).toMatchObject({
      ok: false,
      issue: { code: "NODE_NOT_FOUND" },
    });

    const duplicate = fixture();
    const duplicateProjection = duplicate.projection as { graphViews: Array<Record<string, unknown>> };
    duplicateProjection.graphViews[0]!.nodeLayouts = [
      { nodeId: "search-surface", x: 0, y: 0 },
      { nodeId: "search-surface", x: 10, y: 10 },
    ];
    expect(parseViraCanvasDraft(duplicate)).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_NODE_LAYOUT" },
    });

    const coordinate = fixture();
    const coordinateProjection = coordinate.projection as { graphViews: Array<Record<string, unknown>> };
    coordinateProjection.graphViews[0]!.nodeLayouts = [{
      nodeId: "search-surface",
      x: VIRA_CANVAS_MAX_COORDINATE + 1,
      y: 0,
    }];
    expect(parseViraCanvasDraft(coordinate)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_NODE_LAYOUT" },
    });
  });

  it("validates Canvas selection against graph-local node and edge identities", () => {
    const missing = fixture();
    const projection = missing.projection as { graphViews: Array<Record<string, unknown>> };
    projection.graphViews[0]!.selection = { nodeIds: ["missing-node"], edgeIds: [] };
    expect(parseViraCanvasDraft(missing)).toMatchObject({
      ok: false,
      issue: { code: "SELECTION_TARGET_NOT_FOUND" },
    });

    const duplicate = fixture();
    const duplicateProjection = duplicate.projection as { graphViews: Array<Record<string, unknown>> };
    duplicateProjection.graphViews[0]!.selection = {
      nodeIds: ["search-surface", "search-surface"],
      edgeIds: [],
    };
    expect(parseViraCanvasDraft(duplicate)).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_SELECTION" },
    });
  });

  it("enforces projection collection bounds", () => {
    const views = fixture();
    const projection = views.projection as Record<string, unknown>;
    projection.graphViews = Array.from({ length: VIRA_CANVAS_MAX_GRAPH_VIEWS + 1 }, () => ({
      graphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
      nodeLayouts: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      selection: { nodeIds: [], edgeIds: [] },
    }));
    expect(parseViraCanvasDraft(views)).toMatchObject({
      ok: false,
      issue: { code: "GRAPH_VIEW_LIMIT_EXCEEDED" },
    });

    const layouts = fixture();
    const layoutProjection = layouts.projection as { graphViews: Array<Record<string, unknown>> };
    layoutProjection.graphViews[0]!.nodeLayouts = Array.from({ length: VIRA_CANVAS_MAX_NODE_LAYOUTS + 1 }, () => ({
      nodeId: "search-surface", x: 0, y: 0,
    }));
    expect(parseViraCanvasDraft(layouts)).toMatchObject({
      ok: false,
      issue: { code: "NODE_LAYOUT_LIMIT_EXCEEDED" },
    });

    const selection = fixture();
    const selectionProjection = selection.projection as { graphViews: Array<Record<string, unknown>> };
    selectionProjection.graphViews[0]!.selection = {
      nodeIds: Array.from({ length: VIRA_CANVAS_MAX_SELECTED_NODES + 1 }, () => "search-surface"),
      edgeIds: [],
    };
    expect(parseViraCanvasDraft(selection)).toMatchObject({
      ok: false,
      issue: { code: "SELECTION_LIMIT_EXCEEDED" },
    });
  });

  it("rejects unsafe accessor and custom-prototype input through the shared JSON boundary", () => {
    const accessor = fixture();
    Object.defineProperty(accessor, "projection", { enumerable: true, get: () => ({ activeGraphRef: null, graphViews: [] }) });
    expect(parseViraCanvasDraft(accessor)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE" } });

    const polluted = Object.create({ admin: true }) as Record<string, unknown>;
    Object.assign(polluted, fixture());
    expect(parseViraCanvasDraft(polluted)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE" } });
  });

  it("serializes deterministically regardless of input key order", () => {
    const original = fixture();
    const reordered = {
      projection: original.projection,
      semantics: original.semantics,
      editorRevision: original.editorRevision,
      draftId: original.draftId,
      schemaVersion: original.schemaVersion,
    };
    const first = serializeViraCanvasDraft(original);
    const second = serializeViraCanvasDraft(reordered);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value).toBe(second.value);
  });
});
