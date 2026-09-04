import { describe, expect, it } from "vitest";
import {
  VIRA_CANVAS_AI_EXPLANATION_MAX_LENGTH,
  generateViraCanvasAiProposal,
  type ViraCanvasAiRequest,
} from "../../packages/application-canvas-ai/src/index.js";

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

function graph(version = "1.0.0") {
  return {
    schemaVersion: "1",
    id: "vira.flight-application-graph",
    version,
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
      {
        id: "book-flight",
        target: { kind: "action", actionType: "travel.flight.book" },
      },
    ],
    edges: [
      { id: "surface-search", kind: "experience-uses-capability", from: "search-surface", to: "flight-search" },
      { id: "context-search", kind: "context-input", from: "trip-context", to: "flight-search" },
      { id: "surface-book", kind: "experience-offers-action", from: "search-surface", to: "book-flight" },
    ],
  };
}

function semantics() {
  return { application: application(), graphs: [graph()] };
}

function draft() {
  return {
    schemaVersion: "1",
    draftId: "flight-draft-1",
    editorRevision: 7,
    semantics: semantics(),
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

function providerFor(candidate: unknown, explanation = "Adds the requested semantic capability for human review.") {
  return {
    generate: () => ({ semantics: candidate, explanation }),
  };
}

const newCapability = { id: "vira.flight-pricing", versionRef: "1.0.0" } as const;

function withCapability() {
  const app = application();
  return {
    application: { ...app, capabilities: [...app.capabilities, newCapability] },
    graphs: [graph()],
  };
}

describe("Vira Canvas AI Co-author v1", () => {
  it("produces a frozen human-review proposal with exact revision and deterministic semantic diff", async () => {
    const result = await generateViraCanvasAiProposal(
      { prompt: "Add pricing capability", baseDraft: draft(), supported: { capabilities: [newCapability] } },
      providerFor(withCapability()),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.expectedRevision).toBe(7);
    expect(result.value.draftId).toBe("flight-draft-1");
    expect(result.value.projectionCompatibility).toBe("compatible");
    expect(result.value.diff).toEqual([
      { kind: "application-field-changed", path: "$.semantics.application.capabilities" },
    ]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.diff)).toBe(true);
    expect(Object.isFrozen(result.value.candidateSemantics.application)).toBe(true);
  });

  it("sends only semantic context and canonical supported references to the provider", async () => {
    let request: ViraCanvasAiRequest | undefined;
    const provider = {
      generate: (value: ViraCanvasAiRequest) => {
        request = value;
        return { semantics: semantics(), explanation: "No semantic changes are required." };
      },
    };
    const result = await generateViraCanvasAiProposal(
      { prompt: "Review this application", baseDraft: draft(), supported: { capabilities: [newCapability] } },
      provider,
    );
    expect(result.ok).toBe(true);
    expect(request).toBeDefined();
    if (!request) return;
    expect(Object.keys(request).sort()).toEqual([
      "baseSemantics",
      "draftId",
      "editorRevision",
      "prompt",
      "supported",
      "version",
    ]);
    expect("projection" in request).toBe(false);
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.supported)).toBe(true);
  });

  it("allows explanation-only no-op review without inventing a fallback mutation", async () => {
    const result = await generateViraCanvasAiProposal(
      { prompt: "Explain whether this needs changes", baseDraft: draft() },
      providerFor(semantics(), "The current semantics already satisfy the request."),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.diff).toEqual([]);
    expect(result.value.candidateSemantics).toEqual(result.value.baseSemantics);
  });

  it("rejects unsupported Capability invention unless the host explicitly supplies the exact reference", async () => {
    const rejected = await generateViraCanvasAiProposal(
      { prompt: "Add pricing", baseDraft: draft() },
      providerFor(withCapability()),
    );
    expect(rejected).toMatchObject({
      ok: false,
      issue: { code: "UNSUPPORTED_REFERENCE", path: "$.candidate.application.capabilities[1]" },
    });

    const accepted = await generateViraCanvasAiProposal(
      { prompt: "Add pricing", baseDraft: draft(), supported: { capabilities: [newCapability] } },
      providerFor(withCapability()),
    );
    expect(accepted.ok).toBe(true);
  });

  it("rejects unsupported references embedded only inside ApplicationGraph nodes", async () => {
    const candidateGraph = graph();
    const nodes = [...candidateGraph.nodes, {
      id: "unknown-capability",
      target: { kind: "capability", ref: { id: "vira.unknown-capability", versionRef: "1.0.0" } },
    }];
    const candidate = { application: application(), graphs: [{ ...candidateGraph, nodes }] };
    const result = await generateViraCanvasAiProposal(
      { prompt: "Add graph node", baseDraft: draft() },
      providerFor(candidate),
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "UNSUPPORTED_REFERENCE" } });
  });

  it("allows only host-supplied governance authority references", async () => {
    const governance = { id: "vira.require-human-approval", versionRef: "1.0.0" } as const;
    const app = application();
    const candidate = {
      application: { ...app, governanceRequirements: [governance] },
      graphs: [graph()],
    };
    const rejected = await generateViraCanvasAiProposal(
      { prompt: "Require approval", baseDraft: draft() },
      providerFor(candidate),
    );
    expect(rejected).toMatchObject({ ok: false, issue: { code: "UNSUPPORTED_REFERENCE" } });
    const accepted = await generateViraCanvasAiProposal(
      { prompt: "Require approval", baseDraft: draft(), supported: { governanceRequirements: [governance] } },
      providerFor(candidate),
    );
    expect(accepted.ok).toBe(true);
  });

  it("preserves Application identity and publisher authority", async () => {
    const app = application();
    const candidate = {
      application: { ...app, identity: { id: "evil.hijack" }, publisher: { id: "evil", name: "Evil" } },
      graphs: [graph()],
    };
    const result = await generateViraCanvasAiProposal(
      { prompt: "Rewrite app", baseDraft: draft() },
      providerFor(candidate),
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "IDENTITY_MISMATCH" } });
  });

  it("rejects authority and credential smuggling in generated canonical semantics", async () => {
    const app = application();
    const candidate = {
      application: { ...app, providerToken: "secret" },
      graphs: [graph()],
    };
    const result = await generateViraCanvasAiProposal(
      { prompt: "Configure provider", baseDraft: draft() },
      providerFor(candidate),
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_CANDIDATE" } });
  });

  it("rejects provider attempts to attach publish or execution instructions outside the proposal shape", async () => {
    const provider = {
      generate: () => ({ semantics: semantics(), explanation: "Looks good.", publish: true, execute: true }),
    };
    const result = await generateViraCanvasAiProposal(
      { prompt: "Publish it", baseDraft: draft() },
      provider,
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_PROVIDER_RESPONSE" } });
  });

  it("fails closed on provider failure instead of silently returning the base semantics", async () => {
    const provider = { generate: () => { throw new Error("offline"); } };
    const result = await generateViraCanvasAiProposal(
      { prompt: "Change something", baseDraft: draft() },
      provider,
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "PROVIDER_FAILED" } });
  });

  it("validates the host support catalog through canonical reference semantics", async () => {
    const result = await generateViraCanvasAiProposal(
      {
        prompt: "Add capability",
        baseDraft: draft(),
        supported: { capabilities: [{ id: "vira.bad", versionRef: "latest" }] },
      },
      providerFor(semantics()),
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_SUPPORTED_REFERENCES" } });
  });

  it("marks graph release replacement as requiring projection reconciliation", async () => {
    const app = application();
    const candidate = {
      application: { ...app, flows: [{ id: "vira.flight-application-graph", versionRef: "2.0.0" }] },
      graphs: [graph("2.0.0")],
    };
    const result = await generateViraCanvasAiProposal(
      { prompt: "Prepare graph v2", baseDraft: draft() },
      providerFor(candidate),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.projectionCompatibility).toBe("requires-reconcile");
    expect(result.value.diff.map((entry) => entry.kind)).toEqual([
      "application-field-changed",
      "graph-removed",
      "graph-added",
    ]);
  });

  it("rejects new graphs that impersonate another publisher namespace", async () => {
    const app = application();
    const alien = {
      ...graph("2.0.0"),
      id: "alien.flight-graph",
      publisher: { id: "alien", name: "Alien" },
    };
    const candidate = {
      application: { ...app, flows: [...app.flows, { id: "alien.flight-graph", versionRef: "2.0.0" }] },
      graphs: [graph(), alien],
    };
    const result = await generateViraCanvasAiProposal(
      { prompt: "Add external graph", baseDraft: draft() },
      providerFor(candidate),
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "UNSUPPORTED_REFERENCE" } });
  });

  it("rejects unsafe accessor input and unsafe or oversized explanation text", async () => {
    const input: Record<string, unknown> = { baseDraft: draft() };
    Object.defineProperty(input, "prompt", { enumerable: true, get: () => "hello" });
    const unsafeInput = await generateViraCanvasAiProposal(input, providerFor(semantics()));
    expect(unsafeInput).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });

    const oversized = await generateViraCanvasAiProposal(
      { prompt: "Review", baseDraft: draft() },
      providerFor(semantics(), "x".repeat(VIRA_CANVAS_AI_EXPLANATION_MAX_LENGTH + 1)),
    );
    expect(oversized).toMatchObject({ ok: false, issue: { code: "INVALID_PROVIDER_RESPONSE" } });
  });

  it("returns proposal data only and exposes no apply, publish, deploy or execute authority", async () => {
    const result = await generateViraCanvasAiProposal(
      { prompt: "Review", baseDraft: draft() },
      providerFor(semantics()),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value).sort()).toEqual([
      "baseSemantics",
      "candidateSemantics",
      "diff",
      "draftId",
      "expectedRevision",
      "explanation",
      "projectionCompatibility",
      "version",
    ]);
  });
});
