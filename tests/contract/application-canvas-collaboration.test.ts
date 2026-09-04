import { describe, expect, it } from "vitest";
import {
  createViraCanvasCollaborationSession,
} from "../../packages/application-canvas-collaboration/src/index.js";

function application(flowVersion = "1.0.0") {
  return {
    schemaVersion: "1",
    identity: { id: "vira.flight-assistant" },
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [{ id: "travel.flight.search", packId: "vira/flight-booking", packVersion: "2.1.0", entrypoint: "main" }],
    capabilities: [{ id: "vira.flight-search", versionRef: "1.0.0" }],
    contextTypes: [{ id: "vira.trip-context", versionRef: "1.0.0" }],
    actions: [{ actionType: "travel.flight.book" }],
    flows: [{ id: "vira.flight-application-graph", versionRef: flowVersion }],
    brandRef: null,
    governanceRequirements: [],
    hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
    protocolProjections: [],
    distribution: { name: "Flight Assistant", tags: ["travel"], visibility: "private", discoverable: false },
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
      { id: "search-surface", target: { kind: "experience", ref: { id: "travel.flight.search", packId: "vira/flight-booking", packVersion: "2.1.0", entrypoint: "main" } } },
      { id: "flight-search", target: { kind: "capability", ref: { id: "vira.flight-search", versionRef: "1.0.0" } } },
      { id: "trip-context", target: { kind: "context", ref: { id: "vira.trip-context", versionRef: "1.0.0" } } },
      { id: "book-flight", target: { kind: "action", actionType: "travel.flight.book" } },
    ],
    edges: [
      { id: "surface-search", kind: "experience-uses-capability", from: "search-surface", to: "flight-search" },
      { id: "search-context", kind: "context-output", from: "flight-search", to: "trip-context" },
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

const participants = [
  { id: "alice", displayName: "Alice" },
  { id: "bob", displayName: "Bob" },
  { id: "carol", displayName: "Carol" },
] as const;

const graphRef = { id: "vira.flight-application-graph", version: "1.0.0" } as const;
const pricingCapability = { id: "vira.flight-pricing", versionRef: "1.0.0" } as const;

function withPricing() {
  const app = application();
  return {
    application: { ...app, capabilities: [...app.capabilities, pricingCapability] },
    graphs: [graph()],
  };
}

function withSecondCapability(id: string) {
  const app = application();
  return {
    application: { ...app, capabilities: [...app.capabilities, { id, versionRef: "1.0.0" }] },
    graphs: [graph()],
  };
}

function session(requiredApprovals = 2) {
  return createViraCanvasCollaborationSession({ draft: draft(), participants, requiredApprovals });
}

describe("Vira Canvas Multiplayer + Semantic Review v1", () => {
  it("creates a bounded participant session without acquiring publish or runtime authority", () => {
    const created = session();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.participants().map((entry) => entry.id)).toEqual(["alice", "bob", "carol"]);
    expect(created.value.requiredApprovals).toBe(2);
    expect(created.value.currentDraft().editorRevision).toBe(7);
    expect(Object.keys(created.value).sort()).toEqual([
      "applyProposal",
      "createProposal",
      "currentDraft",
      "listPresence",
      "listProposals",
      "listReviews",
      "participants",
      "requiredApprovals",
      "reviewProposal",
      "updatePresence",
    ]);
  });

  it("rejects duplicate participants and invalid approval thresholds", () => {
    expect(createViraCanvasCollaborationSession({
      draft: draft(),
      participants: [{ id: "alice", displayName: "Alice" }, { id: "alice", displayName: "Alias" }],
      requiredApprovals: 1,
    })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_PARTICIPANT" } });

    expect(createViraCanvasCollaborationSession({ draft: draft(), participants, requiredApprovals: 3 }))
      .toMatchObject({ ok: false, issue: { code: "INVALID_APPROVAL_REQUIREMENT" } });
  });

  it("tracks ephemeral presence per actor with monotonic sequence and no editor revision mutation", () => {
    const created = session();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const first = created.value.updatePresence({
      actorId: "alice",
      sequence: 0,
      activeGraphRef: graphRef,
      selectedNodeIds: ["search-surface"],
      selectedEdgeIds: ["surface-search"],
      cursor: { x: 12, y: -20 },
    });
    expect(first.ok).toBe(true);
    expect(created.value.currentDraft().editorRevision).toBe(7);
    expect(created.value.listPresence()).toHaveLength(1);
    expect(created.value.updatePresence({
      actorId: "alice",
      sequence: 0,
      activeGraphRef: graphRef,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      cursor: null,
    })).toMatchObject({ ok: false, issue: { code: "STALE_PRESENCE" } });
  });

  it("rejects presence against unknown actors, graph-local selections and no-graph cursor state", () => {
    const created = session();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.updatePresence({
      actorId: "mallory",
      sequence: 0,
      activeGraphRef: null,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      cursor: null,
    })).toMatchObject({ ok: false, issue: { code: "UNKNOWN_PARTICIPANT" } });

    expect(created.value.updatePresence({
      actorId: "alice",
      sequence: 0,
      activeGraphRef: graphRef,
      selectedNodeIds: ["missing-node"],
      selectedEdgeIds: [],
      cursor: null,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_PRESENCE" } });

    expect(created.value.updatePresence({
      actorId: "alice",
      sequence: 1,
      activeGraphRef: null,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      cursor: { x: 1, y: 1 },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_PRESENCE" } });
  });

  it("allows concurrent semantic proposals at the same base revision without mutating the draft", () => {
    const created = session();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const first = created.value.createProposal({
      proposalId: "pricing-change",
      authorId: "alice",
      expectedRevision: 7,
      semantics: withPricing(),
      summary: "Add exact pricing capability reference.",
    });
    const second = created.value.createProposal({
      proposalId: "fare-rules-change",
      authorId: "bob",
      expectedRevision: 7,
      semantics: withSecondCapability("vira.fare-rules"),
      summary: "Add fare rules capability reference.",
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(created.value.currentDraft().editorRevision).toBe(7);
    expect(created.value.listProposals()).toHaveLength(2);
  });

  it("rejects no-op, stale, duplicate and identity-hijacking proposals", () => {
    const created = session();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.createProposal({
      proposalId: "noop",
      authorId: "alice",
      expectedRevision: 7,
      semantics: semantics(),
      summary: "No semantic change.",
    })).toMatchObject({ ok: false, issue: { code: "NO_SEMANTIC_CHANGE" } });

    expect(created.value.createProposal({
      proposalId: "stale",
      authorId: "alice",
      expectedRevision: 6,
      semantics: withPricing(),
      summary: "Stale proposal.",
    })).toMatchObject({ ok: false, issue: { code: "STALE_REVISION" } });

    const first = created.value.createProposal({
      proposalId: "duplicate",
      authorId: "alice",
      expectedRevision: 7,
      semantics: withPricing(),
      summary: "First proposal.",
    });
    expect(first.ok).toBe(true);
    expect(created.value.createProposal({
      proposalId: "duplicate",
      authorId: "bob",
      expectedRevision: 7,
      semantics: withSecondCapability("vira.fare-rules"),
      summary: "Second proposal id collision.",
    })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_PROPOSAL" } });

    const app = application();
    expect(created.value.createProposal({
      proposalId: "hijack",
      authorId: "bob",
      expectedRevision: 7,
      semantics: {
        application: { ...app, identity: { id: "evil.flight-assistant" }, publisher: { id: "evil", name: "Evil" } },
        graphs: [graph()],
      },
      summary: "Try to replace Application authority.",
    })).toMatchObject({ ok: false, issue: { code: "IDENTITY_MISMATCH" } });
  });

  it("requires immutable peer reviews and forbids author self-review", () => {
    const created = session(1);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.createProposal({
      proposalId: "pricing",
      authorId: "alice",
      expectedRevision: 7,
      semantics: withPricing(),
      summary: "Add pricing.",
    }).ok).toBe(true);
    expect(created.value.reviewProposal({ proposalId: "pricing", reviewerId: "alice", decision: "approve" }))
      .toMatchObject({ ok: false, issue: { code: "SELF_REVIEW" } });
    expect(created.value.reviewProposal({ proposalId: "pricing", reviewerId: "bob", decision: "approve", note: "Looks good." }).ok)
      .toBe(true);
    expect(created.value.reviewProposal({ proposalId: "pricing", reviewerId: "bob", decision: "reject" }))
      .toMatchObject({ ok: false, issue: { code: "DUPLICATE_REVIEW" } });
    expect(created.value.listReviews("pricing")).toHaveLength(1);
  });

  it("blocks apply on rejection or insufficient distinct approvals", () => {
    const insufficient = session(2);
    expect(insufficient.ok).toBe(true);
    if (!insufficient.ok) return;
    expect(insufficient.value.createProposal({
      proposalId: "pricing",
      authorId: "alice",
      expectedRevision: 7,
      semantics: withPricing(),
      summary: "Add pricing.",
    }).ok).toBe(true);
    expect(insufficient.value.reviewProposal({ proposalId: "pricing", reviewerId: "bob", decision: "approve" }).ok).toBe(true);
    expect(insufficient.value.applyProposal({ proposalId: "pricing", actorId: "alice", expectedRevision: 7 }))
      .toMatchObject({ ok: false, issue: { code: "INSUFFICIENT_APPROVALS" } });

    const rejected = session(1);
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.value.createProposal({
      proposalId: "pricing",
      authorId: "alice",
      expectedRevision: 7,
      semantics: withPricing(),
      summary: "Add pricing.",
    }).ok).toBe(true);
    expect(rejected.value.reviewProposal({ proposalId: "pricing", reviewerId: "bob", decision: "reject" }).ok).toBe(true);
    expect(rejected.value.applyProposal({ proposalId: "pricing", actorId: "alice", expectedRevision: 7 }))
      .toMatchObject({ ok: false, issue: { code: "REVIEW_BLOCKED" } });
  });

  it("delegates approved semantic apply to the canonical mutation session and clears ephemeral presence", () => {
    const created = session(2);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.updatePresence({
      actorId: "alice",
      sequence: 0,
      activeGraphRef: graphRef,
      selectedNodeIds: ["search-surface"],
      selectedEdgeIds: [],
      cursor: { x: 1, y: 2 },
    }).ok).toBe(true);
    expect(created.value.createProposal({
      proposalId: "pricing",
      authorId: "alice",
      expectedRevision: 7,
      semantics: withPricing(),
      summary: "Add pricing.",
    }).ok).toBe(true);
    expect(created.value.reviewProposal({ proposalId: "pricing", reviewerId: "bob", decision: "approve" }).ok).toBe(true);
    expect(created.value.reviewProposal({ proposalId: "pricing", reviewerId: "carol", decision: "approve" }).ok).toBe(true);
    const applied = created.value.applyProposal({ proposalId: "pricing", actorId: "alice", expectedRevision: 7 });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.editorRevision).toBe(8);
    expect(applied.value.semantics.application.capabilities).toContainEqual(pricingCapability);
    expect(created.value.listPresence()).toEqual([]);
  });

  it("makes competing proposals stale after one reviewed proposal commits", () => {
    const created = session(1);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.createProposal({
      proposalId: "pricing",
      authorId: "alice",
      expectedRevision: 7,
      semantics: withPricing(),
      summary: "Add pricing.",
    }).ok).toBe(true);
    expect(created.value.createProposal({
      proposalId: "fare-rules",
      authorId: "bob",
      expectedRevision: 7,
      semantics: withSecondCapability("vira.fare-rules"),
      summary: "Add fare rules.",
    }).ok).toBe(true);
    expect(created.value.reviewProposal({ proposalId: "pricing", reviewerId: "bob", decision: "approve" }).ok).toBe(true);
    expect(created.value.applyProposal({ proposalId: "pricing", actorId: "carol", expectedRevision: 7 }).ok).toBe(true);
    expect(created.value.reviewProposal({ proposalId: "fare-rules", reviewerId: "alice", decision: "approve" }).ok).toBe(true);
    expect(created.value.applyProposal({ proposalId: "fare-rules", actorId: "carol", expectedRevision: 7 }))
      .toMatchObject({ ok: false, issue: { code: "STALE_REVISION" } });
  });

  it("reviews but refuses to apply semantics that require editor projection reconciliation", () => {
    const created = session(1);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const candidate = { application: application("2.0.0"), graphs: [graph("2.0.0")] };
    const proposed = created.value.createProposal({
      proposalId: "graph-v2",
      authorId: "alice",
      expectedRevision: 7,
      semantics: candidate,
      summary: "Move the semantic graph release to v2.",
    });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;
    expect(proposed.value.projectionCompatibility).toBe("requires-reconcile");
    expect(created.value.reviewProposal({ proposalId: "graph-v2", reviewerId: "bob", decision: "approve" }).ok).toBe(true);
    expect(created.value.applyProposal({ proposalId: "graph-v2", actorId: "alice", expectedRevision: 7 }))
      .toMatchObject({ ok: false, issue: { code: "PROJECTION_RECONCILIATION_REQUIRED" } });
    expect(created.value.currentDraft().editorRevision).toBe(7);
  });

  it("fails closed on unsafe accessor and custom-prototype collaboration inputs", () => {
    const input: Record<string, unknown> = { participants, requiredApprovals: 1 };
    Object.defineProperty(input, "draft", { enumerable: true, get: () => draft() });
    expect(createViraCanvasCollaborationSession(input)).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });

    const custom = Object.create({ hidden: true }) as Record<string, unknown>;
    custom.draft = draft();
    custom.participants = participants;
    custom.requiredApprovals = 1;
    expect(createViraCanvasCollaborationSession(custom)).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });
  });
});
