import { describe, expect, it } from "vitest";
import {
  VIRA_APPLICATION_GRAPH_MAX_EDGES,
  VIRA_APPLICATION_GRAPH_MAX_NODES,
  parseViraApplicationGraph,
  serializeViraApplicationGraph,
} from "../../packages/application-graph/src/index.js";

function fixture(): Record<string, unknown> {
  return {
    schemaVersion: "1",
    id: "vira.flight-application-graph",
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    metadata: { name: "Flight Application Graph", description: "Semantic relationships for a governed flight application." },
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
        target: {
          kind: "capability",
          ref: { id: "vira.flight-search", versionRef: "1.0.0" },
        },
      },
      {
        id: "trip-context",
        target: {
          kind: "context",
          ref: { id: "vira.trip-context", versionRef: "1.0.0" },
        },
      },
      {
        id: "book-flight",
        target: {
          kind: "action",
          actionType: "travel.flight.book",
        },
      },
      {
        id: "confirmation-surface",
        target: {
          kind: "experience",
          ref: {
            id: "travel.flight.confirmation",
            packId: "vira/flight-booking",
            packVersion: "2.1.0",
            entrypoint: "confirmation",
          },
        },
      },
    ],
    edges: [
      { id: "surface-search", kind: "experience-uses-capability", from: "search-surface", to: "flight-search" },
      { id: "context-search", kind: "context-input", from: "trip-context", to: "flight-search" },
      { id: "search-context", kind: "context-output", from: "flight-search", to: "trip-context" },
      { id: "surface-book", kind: "experience-offers-action", from: "search-surface", to: "book-flight" },
      { id: "book-context", kind: "context-output", from: "book-flight", to: "trip-context" },
      { id: "search-confirm", kind: "semantic-transition", from: "search-surface", to: "confirmation-surface" },
    ],
  };
}

describe("Vira ApplicationGraph v1", () => {
  it("parses a provider-neutral semantic graph into detached deeply frozen data", () => {
    const input = fixture();
    const result = parseViraApplicationGraph(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toBe(input);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.nodes)).toBe(true);
    expect(Object.isFrozen(result.value.nodes[0]?.target)).toBe(true);
    expect(Object.isFrozen(result.value.edges)).toBe(true);
  });

  it("keeps workflow/runtime/provider/Canvas projection authority out of the canonical graph", () => {
    for (const extra of [
      { startNodeId: "search-surface" },
      { scheduler: "fifo" },
      { retry: { maxAttempts: 3 } },
      { timeoutMs: 1000 },
      { executor: "direct" },
      { provider: "mcp" },
      { prompt: "plan this graph" },
      { x: 10 },
      { y: 20 },
      { zoom: 1.2 },
      { selection: ["search-surface"] },
    ]) {
      expect(parseViraApplicationGraph({ ...fixture(), ...extra })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD" },
      });
    }
  });

  it("rejects workflow and direct-execution fields at node and edge boundaries", () => {
    const node = fixture();
    const nodes = node.nodes as Array<Record<string, unknown>>;
    nodes[0] = { ...nodes[0]!, condition: "user.clicked" };
    expect(parseViraApplicationGraph(node)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_NODE", path: "$.nodes[0].condition" },
    });

    const edge = fixture();
    const edges = edge.edges as Array<Record<string, unknown>>;
    edges[0] = { ...edges[0]!, retry: { maxAttempts: 2 } };
    expect(parseViraApplicationGraph(edge)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_EDGE", path: "$.edges[0].retry" },
    });
  });

  it("does not let Action graph nodes duplicate effect, idempotency or execution authority", () => {
    const input = fixture();
    const nodes = input.nodes as Array<Record<string, unknown>>;
    const actionNode = nodes[3]!;
    actionNode.target = {
      kind: "action",
      actionType: "travel.flight.book",
      effect: "write",
      idempotency: "required",
      execute: true,
    };
    expect(parseViraApplicationGraph(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_NODE_TARGET", path: "$.nodes[3].target.effect" },
    });
  });

  it("requires exact version references and exact Experience Pack releases", () => {
    const capability = fixture();
    const capabilityNodes = capability.nodes as Array<Record<string, unknown>>;
    capabilityNodes[1] = {
      ...capabilityNodes[1]!,
      target: { kind: "capability", ref: { id: "vira.flight-search", versionRef: "latest" } },
    };
    expect(parseViraApplicationGraph(capability)).toMatchObject({
      ok: false,
      issue: { code: "FLOATING_REFERENCE", path: "$.nodes[1].target.ref.versionRef" },
    });

    const experience = fixture();
    const experienceNodes = experience.nodes as Array<Record<string, unknown>>;
    experienceNodes[0] = {
      ...experienceNodes[0]!,
      target: {
        kind: "experience",
        ref: { id: "travel.flight.search", packId: "vira/flight-booking", packVersion: "2.x", entrypoint: "main" },
      },
    };
    expect(parseViraApplicationGraph(experience)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_REFERENCE", path: "$.nodes[0].target.ref.packVersion" },
    });
  });

  it("enforces the semantic edge compatibility matrix", () => {
    const input = fixture();
    const edges = input.edges as Array<Record<string, unknown>>;
    edges[0] = { id: "wrong", kind: "experience-uses-capability", from: "flight-search", to: "search-surface" };
    expect(parseViraApplicationGraph(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_EDGE_RELATION", path: "$.edges[0]" },
    });
  });

  it("rejects edges that name missing nodes", () => {
    const input = fixture();
    const edges = input.edges as Array<Record<string, unknown>>;
    edges[0] = { id: "missing", kind: "semantic-transition", from: "search-surface", to: "not-present" };
    expect(parseViraApplicationGraph(input)).toMatchObject({
      ok: false,
      issue: { code: "EDGE_NODE_NOT_FOUND", path: "$.edges[0].to" },
    });
  });

  it("rejects duplicate node identities and duplicate semantic relations", () => {
    const duplicateNode = fixture();
    const nodes = duplicateNode.nodes as Array<Record<string, unknown>>;
    nodes.push({ ...nodes[0]! });
    expect(parseViraApplicationGraph(duplicateNode)).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_NODE" },
    });

    const duplicateEdge = fixture();
    const edges = duplicateEdge.edges as Array<Record<string, unknown>>;
    edges.push({ id: "duplicate-relation", kind: "experience-uses-capability", from: "search-surface", to: "flight-search" });
    expect(parseViraApplicationGraph(duplicateEdge)).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_EDGE" },
    });
  });

  it("enforces bounded node and edge collections", () => {
    const tooManyNodes = fixture();
    tooManyNodes.nodes = Array.from({ length: VIRA_APPLICATION_GRAPH_MAX_NODES + 1 }, (_, index) => ({
      id: `node-${index}`,
      target: { kind: "context", ref: { id: `vira.context-${index}`, versionRef: "1" } },
    }));
    tooManyNodes.edges = [];
    expect(parseViraApplicationGraph(tooManyNodes)).toMatchObject({
      ok: false,
      issue: { code: "NODE_LIMIT_EXCEEDED", path: "$.nodes" },
    });

    const tooManyEdges = fixture();
    const baseNodes = tooManyEdges.nodes as Array<Record<string, unknown>>;
    baseNodes.push({
      id: "secondary-capability",
      target: { kind: "capability", ref: { id: "vira.secondary-search", versionRef: "1" } },
    });
    tooManyEdges.edges = Array.from({ length: VIRA_APPLICATION_GRAPH_MAX_EDGES + 1 }, (_, index) => ({
      id: `edge-${index}`,
      kind: "experience-uses-capability",
      from: "search-surface",
      to: index % 2 === 0 ? "flight-search" : "secondary-capability",
    }));
    expect(parseViraApplicationGraph(tooManyEdges)).toMatchObject({
      ok: false,
      issue: { code: "EDGE_LIMIT_EXCEEDED", path: "$.edges" },
    });
  });

  it("allows semantic cycles instead of pretending to be a DAG workflow engine", () => {
    const input = fixture();
    const edges = input.edges as Array<Record<string, unknown>>;
    edges.push({
      id: "confirm-search",
      kind: "semantic-transition",
      from: "confirmation-surface",
      to: "search-surface",
    });
    const result = parseViraApplicationGraph(input);
    expect(result.ok).toBe(true);
  });

  it("requires publisher namespace parity and immutable graph release semver", () => {
    expect(parseViraApplicationGraph({ ...fixture(), publisher: { id: "other", name: "Other" } })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PUBLISHER", path: "$.publisher.id" },
    });
    expect(parseViraApplicationGraph({ ...fixture(), version: "latest" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VERSION", path: "$.version" },
    });
  });

  it("rejects unsafe accessor and custom-prototype input through the shared JSON boundary", () => {
    const accessor = fixture();
    Object.defineProperty(accessor, "nodes", { enumerable: true, get: () => [] });
    expect(parseViraApplicationGraph(accessor)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE" } });

    const polluted = Object.create({ admin: true }) as Record<string, unknown>;
    Object.assign(polluted, fixture());
    expect(parseViraApplicationGraph(polluted)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE" } });
  });

  it("serializes deterministically regardless of input key order", () => {
    const original = fixture();
    const reordered = {
      edges: original.edges,
      nodes: original.nodes,
      metadata: original.metadata,
      publisher: original.publisher,
      version: original.version,
      id: original.id,
      schemaVersion: original.schemaVersion,
    };
    const first = serializeViraApplicationGraph(original);
    const second = serializeViraApplicationGraph(reordered);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value).toBe(second.value);
  });
});
