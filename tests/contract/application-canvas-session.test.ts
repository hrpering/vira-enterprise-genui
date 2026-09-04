import { describe, expect, it } from "vitest";
import {
  VIRA_CANVAS_MAX_COORDINATE,
  createViraCanvasMutationSession,
  serializeViraCanvasSemantics,
} from "../../packages/application-canvas/src/index.js";

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
    ],
    edges: [
      { id: "surface-search", kind: "experience-uses-capability", from: "search-surface", to: "flight-search" },
      { id: "context-search", kind: "context-input", from: "trip-context", to: "flight-search" },
    ],
  };
}

function fixture(editorRevision = 3): Record<string, unknown> {
  return {
    schemaVersion: "1",
    draftId: "flight-draft-1",
    editorRevision,
    semantics: { application: application(), graphs: [graph()] },
    projection: {
      activeGraphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
      graphViews: [{
        graphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
        nodeLayouts: [{ nodeId: "search-surface", x: 120, y: 80 }],
        viewport: { x: 10, y: 20, zoom: 1 },
        selection: { nodeIds: ["search-surface"], edgeIds: ["surface-search"] },
      }],
    },
  };
}

const graphRef = { id: "vira.flight-application-graph", version: "1.0.0" } as const;

describe("Vira Canvas Mutation Session v1", () => {
  it("creates a frozen session over a canonical frozen Canvas draft", () => {
    const created = createViraCanvasMutationSession(fixture());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(Object.isFrozen(created.value)).toBe(true);
    expect(created.value.currentDraft().editorRevision).toBe(3);
    expect(Object.isFrozen(created.value.currentDraft())).toBe(true);
  });

  it("increments editorRevision exactly once for a successful projection mutation without changing semantics", () => {
    const created = createViraCanvasMutationSession(fixture());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const before = serializeViraCanvasSemantics(created.value.currentDraft());
    const result = created.value.setViewport({ expectedRevision: 3, graphRef, x: 500, y: -200, zoom: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok || !before.ok) return;
    expect(result.value.editorRevision).toBe(4);
    const after = serializeViraCanvasSemantics(result.value);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.value).toBe(before.value);
  });

  it("rejects stale writes without mutating current state", () => {
    const created = createViraCanvasMutationSession(fixture());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const first = created.value.setSelection({ expectedRevision: 3, graphRef, nodeIds: [], edgeIds: [] });
    expect(first.ok).toBe(true);
    const snapshot = created.value.currentDraft();
    const stale = created.value.setViewport({ expectedRevision: 3, graphRef, x: 0, y: 0, zoom: 1 });
    expect(stale).toMatchObject({ ok: false, issue: { code: "STALE_REVISION", path: "$.expectedRevision" } });
    expect(created.value.currentDraft()).toBe(snapshot);
    expect(created.value.currentDraft().editorRevision).toBe(4);
  });

  it("keeps failed canonical projection mutations atomic", () => {
    const created = createViraCanvasMutationSession(fixture());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const snapshot = created.value.currentDraft();
    const result = created.value.setNodeLayout({
      expectedRevision: 3,
      graphRef,
      nodeId: "missing-node",
      x: VIRA_CANVAS_MAX_COORDINATE + 1,
      y: 0,
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "MUTATION_FAILED" } });
    expect(created.value.currentDraft()).toBe(snapshot);
    expect(created.value.currentDraft().editorRevision).toBe(3);
  });

  it("delegates semantic replacement back through canonical Application validation", () => {
    const created = createViraCanvasMutationSession(fixture());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const snapshot = created.value.currentDraft();
    const invalid = {
      application: { ...application(), providerToken: "secret" },
      graphs: [graph()],
    };
    const result = created.value.replaceSemantics({ expectedRevision: 3, semantics: invalid as never });
    expect(result).toMatchObject({ ok: false, issue: { code: "MUTATION_FAILED", path: "$.semantics.application.providerToken" } });
    expect(created.value.currentDraft()).toBe(snapshot);
  });

  it("rejects semantic replacement that would orphan current projection refs", () => {
    const created = createViraCanvasMutationSession(fixture());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = created.value.replaceSemantics({
      expectedRevision: 3,
      semantics: { application: application(), graphs: [] } as never,
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "MUTATION_FAILED", path: "$.projection.activeGraphRef" } });
    expect(created.value.currentDraft().editorRevision).toBe(3);
  });

  it("rejects active graph refs outside current canonical semantics", () => {
    const created = createViraCanvasMutationSession(fixture());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = created.value.setActiveGraph({
      expectedRevision: 3,
      graphRef: { id: "vira.missing", version: "1.0.0" },
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "GRAPH_NOT_FOUND", path: "$.graphRef" } });
    expect(created.value.currentDraft().editorRevision).toBe(3);
  });

  it("can remove and re-create a graph view through canonical revalidation", () => {
    const created = createViraCanvasMutationSession(fixture());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const removed = created.value.removeGraphView({ expectedRevision: 3, graphRef });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value.projection.activeGraphRef).toBeNull();
    expect(removed.value.projection.graphViews).toHaveLength(0);

    const restored = created.value.upsertGraphView({
      expectedRevision: 4,
      graphView: {
        graphRef,
        nodeLayouts: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        selection: { nodeIds: [], edgeIds: [] },
      },
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.value.editorRevision).toBe(5);
    expect(restored.value.projection.graphViews).toHaveLength(1);
  });

  it("supports node layout and selection mutations against graph-local identities", () => {
    const created = createViraCanvasMutationSession(fixture());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const layout = created.value.setNodeLayout({ expectedRevision: 3, graphRef, nodeId: "flight-search", x: 420, y: 90 });
    expect(layout.ok).toBe(true);
    const selection = created.value.setSelection({
      expectedRevision: 4,
      graphRef,
      nodeIds: ["flight-search"],
      edgeIds: ["surface-search"],
    });
    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.value.editorRevision).toBe(5);
    expect(selection.value.projection.graphViews[0]?.selection.nodeIds).toEqual(["flight-search"]);
  });

  it("rejects unsafe accessor mutation input through the shared JSON boundary", () => {
    const created = createViraCanvasMutationSession(fixture());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const input: Record<string, unknown> = { expectedRevision: 3, graphRef, x: 0, y: 0 };
    Object.defineProperty(input, "zoom", { enumerable: true, get: () => 1 });
    const result = created.value.setViewport(input as never);
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_MUTATION" } });
    expect(created.value.currentDraft().editorRevision).toBe(3);
  });

  it("fails closed when editorRevision can no longer be incremented safely", () => {
    const created = createViraCanvasMutationSession(fixture(Number.MAX_SAFE_INTEGER));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = created.value.setActiveGraph({ expectedRevision: Number.MAX_SAFE_INTEGER, graphRef: null });
    expect(result).toMatchObject({ ok: false, issue: { code: "REVISION_EXHAUSTED", path: "$.editorRevision" } });
    expect(created.value.currentDraft().editorRevision).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("does not expose publish, runtime, deployment or Action execution authority", () => {
    const created = createViraCanvasMutationSession(fixture());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(Object.keys(created.value).sort()).toEqual([
      "currentDraft",
      "removeGraphView",
      "replaceSemantics",
      "setActiveGraph",
      "setNodeLayout",
      "setSelection",
      "setViewport",
      "upsertGraphView",
    ]);
  });
});
