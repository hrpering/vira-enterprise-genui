import { describe, expect, it } from "vitest";
import { parseViraCanvasDraftV2 } from "../../packages/application-canvas/src/index.js";
import {
  createViraCanvasCollaborationSession,
  createViraCanvasCollaborationSessionV2,
} from "../../packages/application-canvas-collaboration/src/index.js";

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

function draftFixture(): Record<string, unknown> {
  return {
    schemaVersion: "2",
    draftId: "draft-flight-collaboration-v2",
    editorRevision: 0,
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

function participants() {
  return [
    { id: "alice", displayName: "Alice" },
    { id: "bob", displayName: "Bob" },
    { id: "carol", displayName: "Carol" },
  ];
}

describe("Canvas collaboration V2", () => {
  it("applies a peer-approved V2 semantic proposal without losing exact Action refs", () => {
    const parsed = parseViraCanvasDraftV2(draftFixture());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const created = createViraCanvasCollaborationSessionV2({
      draft: parsed.value,
      participants: participants(),
      requiredApprovals: 1,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = created.value;

    const presence = session.updatePresence({
      actorId: "alice",
      sequence: 1,
      activeGraphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
      selectedNodeIds: ["book"],
      selectedEdgeIds: ["offer"],
      cursor: { x: 12, y: 24 },
    });
    expect(presence).toMatchObject({ ok: true, value: { version: "2", actorId: "alice" } });

    const candidateApplication = {
      ...structuredClone(parsed.value.semantics.application),
      distribution: {
        ...structuredClone(parsed.value.semantics.application.distribution),
        description: "A peer-reviewed governed flight application.",
      },
    };
    const proposal = session.createProposal({
      proposalId: "proposal-1",
      authorId: "alice",
      expectedRevision: 0,
      semantics: {
        application: candidateApplication,
        graphs: parsed.value.semantics.graphs,
      },
      summary: "Clarify governed distribution copy",
    });
    expect(proposal).toMatchObject({
      ok: true,
      value: {
        version: "2",
        proposalId: "proposal-1",
        baseEditorRevision: 0,
        projectionCompatibility: "compatible",
      },
    });

    const beforeApproval = session.applyProposal({
      proposalId: "proposal-1",
      actorId: "carol",
      expectedRevision: 0,
    });
    expect(beforeApproval).toMatchObject({
      ok: false,
      issue: { code: "INSUFFICIENT_APPROVALS" },
    });

    const review = session.reviewProposal({
      proposalId: "proposal-1",
      reviewerId: "bob",
      decision: "approve",
      note: "Safe semantic-only change",
    });
    expect(review).toMatchObject({
      ok: true,
      value: { version: "2", reviewerId: "bob", decision: "approve" },
    });

    const applied = session.applyProposal({
      proposalId: "proposal-1",
      actorId: "carol",
      expectedRevision: 0,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.schemaVersion).toBe("2");
    expect(applied.value.editorRevision).toBe(1);
    expect(applied.value.semantics.application.actions[0]).toEqual({
      id: "travel.flight.book",
      versionRef: "2026-09-05",
    });
    expect(applied.value.semantics.graphs[0]?.nodes[1]?.target).toEqual({
      kind: "action",
      ref: { id: "travel.flight.book", versionRef: "2026-09-05" },
    });
    expect(session.listPresence()).toEqual([]);
  });

  it("rejects coherent V2 proposals that replace Application identity authority", () => {
    const parsed = parseViraCanvasDraftV2(draftFixture());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const created = createViraCanvasCollaborationSessionV2({
      draft: parsed.value,
      participants: participants(),
      requiredApprovals: 1,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const application = {
      ...structuredClone(parsed.value.semantics.application),
      identity: { id: "attacker.replacement" },
      publisher: { id: "attacker", name: "Attacker" },
    };
    const proposal = created.value.createProposal({
      proposalId: "proposal-authority-takeover",
      authorId: "alice",
      expectedRevision: 0,
      semantics: { application, graphs: parsed.value.semantics.graphs },
      summary: "Attempt coherent authority replacement",
    });

    expect(proposal).toMatchObject({
      ok: false,
      issue: { code: "IDENTITY_MISMATCH", path: "$.semantics.application" },
    });
  });

  it("rejects exact ApplicationGraph publisher takeover at the canonical owner boundary", () => {
    const parsed = parseViraCanvasDraftV2(draftFixture());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const created = createViraCanvasCollaborationSessionV2({
      draft: parsed.value,
      participants: participants(),
      requiredApprovals: 1,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const graphs = parsed.value.semantics.graphs.map((graph, index) =>
      index === 0
        ? { ...structuredClone(graph), publisher: { id: "attacker", name: "Attacker" } }
        : graph,
    );
    const proposal = created.value.createProposal({
      proposalId: "proposal-graph-publisher-takeover",
      authorId: "alice",
      expectedRevision: 0,
      semantics: {
        application: parsed.value.semantics.application,
        graphs,
      },
      summary: "Attempt graph publisher takeover",
    });

    expect(proposal).toMatchObject({
      ok: false,
      issue: {
        code: "INVALID_PROPOSAL",
        path: "$.semantics.graphs[0].publisher.id",
      },
    });
  });

  it("normalizes canonical proposal rejection paths without duplicating semantics", () => {
    const parsed = parseViraCanvasDraftV2(draftFixture());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const created = createViraCanvasCollaborationSessionV2({
      draft: parsed.value,
      participants: participants(),
      requiredApprovals: 1,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const application = {
      ...structuredClone(parsed.value.semantics.application),
      identity: { id: "attacker.replacement" },
    };
    const proposal = created.value.createProposal({
      proposalId: "proposal-incoherent-authority",
      authorId: "alice",
      expectedRevision: 0,
      semantics: { application, graphs: parsed.value.semantics.graphs },
      summary: "Attempt incoherent authority replacement",
    });

    expect(proposal).toMatchObject({
      ok: false,
      issue: {
        code: "INVALID_PROPOSAL",
        path: "$.semantics.application.publisher.id",
      },
    });
  });

  it("keeps V1 and V2 collaboration entrypoints explicit instead of silently downcasting", () => {
    const v2 = draftFixture();
    const v1Entry = createViraCanvasCollaborationSession({
      draft: v2,
      participants: participants(),
      requiredApprovals: 1,
    });
    expect(v1Entry).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });

    const v2Entry = createViraCanvasCollaborationSessionV2({
      draft: v2,
      participants: participants(),
      requiredApprovals: 1,
    });
    expect(v2Entry.ok).toBe(true);
  });

  it("blocks immutable rejection", () => {
    const parsed = parseViraCanvasDraftV2(draftFixture());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const created = createViraCanvasCollaborationSessionV2({
      draft: parsed.value,
      participants: participants(),
      requiredApprovals: 1,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = created.value;

    const candidateApplication = {
      ...structuredClone(parsed.value.semantics.application),
      distribution: {
        ...structuredClone(parsed.value.semantics.application.distribution),
        description: "Rejected change",
      },
    };
    const proposal = session.createProposal({
      proposalId: "proposal-rejected",
      authorId: "alice",
      expectedRevision: 0,
      semantics: { application: candidateApplication, graphs: parsed.value.semantics.graphs },
      summary: "Rejected change",
    });
    expect(proposal.ok).toBe(true);

    const review = session.reviewProposal({
      proposalId: "proposal-rejected",
      reviewerId: "bob",
      decision: "reject",
    });
    expect(review.ok).toBe(true);

    const applied = session.applyProposal({
      proposalId: "proposal-rejected",
      actorId: "carol",
      expectedRevision: 0,
    });
    expect(applied).toMatchObject({
      ok: false,
      issue: { code: "REVIEW_BLOCKED" },
    });
  });
});
