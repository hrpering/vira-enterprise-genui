import { describe, expect, it } from "vitest";
import { generateViraCanvasAiProposal } from "../../packages/application-canvas-ai/src/index.js";

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
      { id: "context-search", kind: "context-input", from: "trip-context", to: "flight-search" },
      { id: "surface-book", kind: "experience-offers-action", from: "search-surface", to: "book-flight" },
    ],
  };
}

function draft() {
  return {
    schemaVersion: "1",
    draftId: "flight-draft-1",
    editorRevision: 7,
    semantics: { application: application(), graphs: [graph()] },
    projection: { activeGraphRef: null, graphViews: [] },
  };
}

function provider(candidate: unknown) {
  return { generate: () => ({ semantics: candidate, explanation: "Semantic proposal for human review." }) };
}

describe("Vira Canvas AI cross-semantic integrity", () => {
  it("rejects graph targets whose semantic declaration was removed from the candidate Application", async () => {
    const app = application();
    const candidate = {
      application: { ...app, capabilities: [] },
      graphs: [graph()],
    };
    const result = await generateViraCanvasAiProposal(
      { prompt: "Remove the capability declaration", baseDraft: draft() },
      provider(candidate),
    );
    expect(result).toMatchObject({
      ok: false,
      issue: {
        code: "INVALID_CANDIDATE",
        path: "$.candidate.graphs[0].nodes[1].target",
      },
    });
  });

  it("rejects embedded graph releases not declared by candidate Application flows", async () => {
    const app = application();
    const candidate = {
      application: { ...app, flows: [] },
      graphs: [graph()],
    };
    const result = await generateViraCanvasAiProposal(
      { prompt: "Remove the flow declaration", baseDraft: draft() },
      provider(candidate),
    );
    expect(result).toMatchObject({
      ok: false,
      issue: {
        code: "INVALID_CANDIDATE",
        path: "$.candidate.graphs[0]",
      },
    });
  });
});
