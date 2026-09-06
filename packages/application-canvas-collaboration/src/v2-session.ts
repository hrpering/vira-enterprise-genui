import {
  VIRA_CANVAS_MAX_COORDINATE,
  VIRA_CANVAS_MAX_SELECTED_EDGES,
  VIRA_CANVAS_MAX_SELECTED_NODES,
  createViraCanvasMutationSessionV2,
  parseViraCanvasDraftV2,
  serializeViraCanvasSemanticsV2,
  type ViraCanvasDraftV2,
  type ViraCanvasGraphRefV2,
} from "@vira-enterprise-genui/application-canvas";
import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_CANVAS_COLLABORATION_MAX_DISPLAY_NAME_LENGTH,
  VIRA_CANVAS_COLLABORATION_MAX_ID_LENGTH,
  VIRA_CANVAS_COLLABORATION_MAX_PARTICIPANTS,
  VIRA_CANVAS_COLLABORATION_MAX_REVIEW_NOTE_LENGTH,
  VIRA_CANVAS_COLLABORATION_MAX_SUMMARY_LENGTH,
  type ViraCanvasCollaborationIssue,
  type ViraCanvasCollaborationIssueCode,
  type ViraCanvasCollaborator,
} from "./types.js";
import {
  VIRA_CANVAS_COLLABORATION_V2_VERSION,
  type CreateViraCanvasCollaborationSessionV2Result,
  type ViraCanvasApplyProposalV2Result,
  type ViraCanvasCollaborationSessionV2,
  type ViraCanvasPresenceV2,
  type ViraCanvasPresenceV2Result,
  type ViraCanvasProposalV2Result,
  type ViraCanvasReviewV2Result,
  type ViraCanvasSemanticProposalV2,
  type ViraCanvasSemanticReviewV2,
} from "./v2-types.js";

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;

type Failure = { readonly ok: false; readonly issue: ViraCanvasCollaborationIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function issue(
  code: ViraCanvasCollaborationIssueCode,
  path: string,
  message: string,
): ViraCanvasCollaborationIssue {
  return Object.freeze({ code, path, message });
}

function failure(
  code: ViraCanvasCollaborationIssueCode,
  path: string,
  message: string,
): Failure {
  return { ok: false, issue: issue(code, path, message) };
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function shape(
  value: JsonObject,
  allowed: readonly string[],
  required: readonly string[] = allowed,
): string | undefined {
  const allowedSet = new Set(allowed);
  return Object.keys(value).sort().find((key) => !allowedSet.has(key))
    ?? required.find((key) => !Object.hasOwn(value, key));
}

function boundedId(value: JsonValue | undefined): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= VIRA_CANVAS_COLLABORATION_MAX_ID_LENGTH
    && OPAQUE_ID.test(value);
}

function hasForbiddenControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      (code >= 0x00 && code <= 0x08)
      || code === 0x0b
      || code === 0x0c
      || (code >= 0x0e && code <= 0x1f)
      || code === 0x7f
    ) {
      return true;
    }
  }
  return false;
}

function safeText(value: JsonValue | undefined, maxLength: number, allowEmpty = false): value is string {
  return typeof value === "string"
    && value.length <= maxLength
    && (allowEmpty || value.length > 0)
    && (allowEmpty || value.trim().length > 0)
    && !hasForbiddenControl(value);
}

function parseParticipant(value: JsonValue, path: string): Parsed<ViraCanvasCollaborator> {
  if (!object(value)) return failure("INVALID_PARTICIPANTS", path, "participant must be an exact object");
  const unexpected = shape(value, ["id", "displayName"]);
  if (unexpected) return failure("INVALID_PARTICIPANTS", `${path}.${unexpected}`, "participant shape is invalid");
  if (!boundedId(value.id)) return failure("INVALID_PARTICIPANTS", `${path}.id`, "participant id is invalid");
  if (!safeText(value.displayName, VIRA_CANVAS_COLLABORATION_MAX_DISPLAY_NAME_LENGTH)) {
    return failure("INVALID_PARTICIPANTS", `${path}.displayName`, "participant displayName is invalid");
  }
  return {
    ok: true,
    value: Object.freeze({ id: value.id, displayName: value.displayName }),
  };
}

function parseExactInput(
  input: unknown,
  allowed: readonly string[],
  required: readonly string[] = allowed,
  code: ViraCanvasCollaborationIssueCode = "INVALID_INPUT",
): Parsed<JsonObject> {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !object(parsed.value)) {
    return failure(
      code,
      parsed.ok ? "$" : parsed.issue.path,
      parsed.ok ? "input must be an exact safe-data object" : parsed.issue.reason,
    );
  }
  const unexpected = shape(parsed.value, allowed, required);
  if (unexpected) return failure(code, `$.${unexpected}`, `unknown or missing field: ${unexpected}`);
  return { ok: true, value: parsed.value };
}

function graphKey(ref: ViraCanvasGraphRefV2): string {
  return `${ref.id}\u0000${ref.version}`;
}

function proposalSemanticIssuePath(path: string): string {
  if (path === "$") return "$.semantics";
  if (path === "$.semantics" || path.startsWith("$.semantics.")) return path;
  return `$.semantics${path.startsWith("$.") ? path.slice(1) : ""}`;
}

export function createViraCanvasCollaborationSessionV2(
  input: unknown,
): CreateViraCanvasCollaborationSessionV2Result {
  const parsed = parseExactInput(input, ["draft", "participants", "requiredApprovals"]);
  if (!parsed.ok) return parsed;
  const root = parsed.value;

  const draft = parseViraCanvasDraftV2(root.draft);
  if (!draft.ok) {
    return failure("INVALID_INPUT", `$.draft${draft.issue.path === "$" ? "" : draft.issue.path.slice(1)}`, draft.issue.message);
  }

  if (
    !Array.isArray(root.participants)
    || root.participants.length < 2
    || root.participants.length > VIRA_CANVAS_COLLABORATION_MAX_PARTICIPANTS
  ) {
    return failure(
      "INVALID_PARTICIPANTS",
      "$.participants",
      `participants must contain 2..${VIRA_CANVAS_COLLABORATION_MAX_PARTICIPANTS} collaborators`,
    );
  }

  const participants: ViraCanvasCollaborator[] = [];
  const participantById = new Map<string, ViraCanvasCollaborator>();
  for (let index = 0; index < root.participants.length; index += 1) {
    const participant = parseParticipant(root.participants[index] as JsonValue, `$.participants[${index}]`);
    if (!participant.ok) return participant;
    if (participantById.has(participant.value.id)) {
      return failure("DUPLICATE_PARTICIPANT", `$.participants[${index}].id`, "participant id is duplicated");
    }
    participants.push(participant.value);
    participantById.set(participant.value.id, participant.value);
  }

  if (
    typeof root.requiredApprovals !== "number"
    || !Number.isSafeInteger(root.requiredApprovals)
    || root.requiredApprovals < 1
    || root.requiredApprovals > participants.length - 1
  ) {
    return failure(
      "INVALID_APPROVAL_REQUIREMENT",
      "$.requiredApprovals",
      "requiredApprovals must be a safe integer from 1 through participants.length - 1",
    );
  }
  const requiredApprovals = root.requiredApprovals;

  const mutation = createViraCanvasMutationSessionV2(draft.value);
  if (!mutation.ok) return failure("INVALID_INPUT", "$.draft", mutation.issue.message);
  const mutationSession = mutation.value;

  const participantList = Object.freeze([...participants].sort((left, right) => left.id.localeCompare(right.id)));
  const presenceByActor = new Map<string, ViraCanvasPresenceV2>();
  const proposalById = new Map<string, ViraCanvasSemanticProposalV2>();
  const reviewsByProposal = new Map<string, Map<string, ViraCanvasSemanticReviewV2>>();

  function requireParticipant(actorId: JsonValue | undefined, path: string): Parsed<string> {
    if (!boundedId(actorId) || !participantById.has(actorId)) {
      return failure("UNKNOWN_PARTICIPANT", path, "actor is not a registered collaboration participant");
    }
    return { ok: true, value: actorId };
  }

  function currentDraft(): ViraCanvasDraftV2 {
    return mutationSession.currentDraft();
  }

  function resolveGraphRef(value: JsonValue | undefined, path: string): Parsed<ViraCanvasGraphRefV2 | null> {
    if (value === null) return { ok: true, value: null };
    if (!object(value)) return failure("INVALID_PRESENCE", path, "activeGraphRef must be null or an exact object");
    const unexpected = shape(value, ["id", "version"]);
    if (unexpected) return failure("INVALID_PRESENCE", `${path}.${unexpected}`, "activeGraphRef shape is invalid");
    if (typeof value.id !== "string" || typeof value.version !== "string") {
      return failure("INVALID_PRESENCE", path, "activeGraphRef id/version must be strings");
    }
    const graph = currentDraft().semantics.graphs.find((candidate) => candidate.id === value.id && candidate.version === value.version);
    if (!graph) return failure("INVALID_PRESENCE", path, "activeGraphRef does not resolve in current Canvas V2 semantics");
    return { ok: true, value: Object.freeze({ id: graph.id, version: graph.version }) };
  }

  function parseSelectionIds(
    value: JsonValue | undefined,
    path: string,
    limit: number,
    known: ReadonlySet<string>,
  ): Parsed<readonly string[]> {
    if (!Array.isArray(value) || value.length > limit) {
      return failure("INVALID_PRESENCE", path, `selection must be an array bounded to ${limit}`);
    }
    const result: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < value.length; index += 1) {
      const id = value[index];
      if (typeof id !== "string" || !known.has(id) || seen.has(id)) {
        return failure("INVALID_PRESENCE", `${path}[${index}]`, "selection id is unknown or duplicated");
      }
      seen.add(id);
      result.push(id);
    }
    return { ok: true, value: Object.freeze(result) };
  }

  const session: ViraCanvasCollaborationSessionV2 = {
    currentDraft,
    participants: () => participantList,
    requiredApprovals,

    listPresence: () => Object.freeze(
      [...presenceByActor.values()].sort((left, right) => left.actorId.localeCompare(right.actorId)),
    ),

    updatePresence: (inputValue): ViraCanvasPresenceV2Result => {
      const presence = parseExactInput(
        inputValue,
        ["actorId", "sequence", "activeGraphRef", "selectedNodeIds", "selectedEdgeIds", "cursor"],
        undefined,
        "INVALID_PRESENCE",
      );
      if (!presence.ok) return presence;
      const value = presence.value;
      const actor = requireParticipant(value.actorId, "$.actorId");
      if (!actor.ok) return actor;
      if (typeof value.sequence !== "number" || !Number.isSafeInteger(value.sequence) || value.sequence < 0) {
        return failure("INVALID_PRESENCE", "$.sequence", "presence sequence must be a non-negative safe integer");
      }
      const previous = presenceByActor.get(actor.value);
      if (previous && value.sequence <= previous.sequence) {
        return failure("STALE_PRESENCE", "$.sequence", "presence sequence must advance monotonically for the actor");
      }
      const graphRef = resolveGraphRef(value.activeGraphRef, "$.activeGraphRef");
      if (!graphRef.ok) return graphRef;

      let selectedNodeIds: readonly string[] = Object.freeze([]);
      let selectedEdgeIds: readonly string[] = Object.freeze([]);
      let cursor: { readonly x: number; readonly y: number } | null = null;

      if (graphRef.value === null) {
        if (
          !Array.isArray(value.selectedNodeIds)
          || value.selectedNodeIds.length !== 0
          || !Array.isArray(value.selectedEdgeIds)
          || value.selectedEdgeIds.length !== 0
          || value.cursor !== null
        ) {
          return failure("INVALID_PRESENCE", "$", "presence without an active graph cannot carry selection or cursor state");
        }
      } else {
        const graph = currentDraft().semantics.graphs.find((candidate) => graphKey(candidate) === graphKey(graphRef.value!));
        if (!graph) return failure("INVALID_PRESENCE", "$.activeGraphRef", "active graph disappeared from current semantics");
        const nodeIds = new Set(graph.nodes.map((node) => node.id));
        const edgeIds = new Set(graph.edges.map((edge) => edge.id));
        const nodes = parseSelectionIds(value.selectedNodeIds, "$.selectedNodeIds", VIRA_CANVAS_MAX_SELECTED_NODES, nodeIds);
        if (!nodes.ok) return nodes;
        const edges = parseSelectionIds(value.selectedEdgeIds, "$.selectedEdgeIds", VIRA_CANVAS_MAX_SELECTED_EDGES, edgeIds);
        if (!edges.ok) return edges;
        selectedNodeIds = nodes.value;
        selectedEdgeIds = edges.value;

        if (value.cursor !== null) {
          if (!object(value.cursor)) return failure("INVALID_PRESENCE", "$.cursor", "cursor must be null or exact x/y object");
          const unexpected = shape(value.cursor, ["x", "y"]);
          if (unexpected) return failure("INVALID_PRESENCE", `$.cursor.${unexpected}`, "cursor shape is invalid");
          if (
            typeof value.cursor.x !== "number"
            || typeof value.cursor.y !== "number"
            || !Number.isFinite(value.cursor.x)
            || !Number.isFinite(value.cursor.y)
            || Math.abs(value.cursor.x) > VIRA_CANVAS_MAX_COORDINATE
            || Math.abs(value.cursor.y) > VIRA_CANVAS_MAX_COORDINATE
          ) {
            return failure("INVALID_PRESENCE", "$.cursor", "cursor coordinates are invalid or out of bounds");
          }
          cursor = Object.freeze({ x: value.cursor.x, y: value.cursor.y });
        }
      }

      const next: ViraCanvasPresenceV2 = Object.freeze({
        version: VIRA_CANVAS_COLLABORATION_V2_VERSION,
        actorId: actor.value,
        sequence: value.sequence,
        activeGraphRef: graphRef.value,
        selectedNodeIds,
        selectedEdgeIds,
        cursor,
      });
      presenceByActor.set(actor.value, next);
      return { ok: true, value: next };
    },

    listProposals: () => Object.freeze(
      [...proposalById.values()].sort((left, right) => left.proposalId.localeCompare(right.proposalId)),
    ),

    createProposal: (inputValue): ViraCanvasProposalV2Result => {
      const proposal = parseExactInput(
        inputValue,
        ["proposalId", "authorId", "expectedRevision", "semantics", "summary"],
        undefined,
        "INVALID_PROPOSAL",
      );
      if (!proposal.ok) return proposal;
      const value = proposal.value;
      if (!boundedId(value.proposalId)) return failure("INVALID_PROPOSAL", "$.proposalId", "proposalId is invalid");
      if (proposalById.has(value.proposalId)) return failure("DUPLICATE_PROPOSAL", "$.proposalId", "proposalId already exists");
      const author = requireParticipant(value.authorId, "$.authorId");
      if (!author.ok) return author;
      if (
        typeof value.expectedRevision !== "number"
        || !Number.isSafeInteger(value.expectedRevision)
        || value.expectedRevision < 0
      ) {
        return failure("INVALID_PROPOSAL", "$.expectedRevision", "expectedRevision must be a non-negative safe integer");
      }
      const current = currentDraft();
      if (value.expectedRevision !== current.editorRevision) {
        return failure("STALE_REVISION", "$.expectedRevision", `expected editorRevision ${current.editorRevision}`);
      }
      if (!safeText(value.summary, VIRA_CANVAS_COLLABORATION_MAX_SUMMARY_LENGTH)) {
        return failure("INVALID_PROPOSAL", "$.summary", "proposal summary is invalid");
      }

      const candidateDraft = parseViraCanvasDraftV2({
        schemaVersion: current.schemaVersion,
        draftId: current.draftId,
        editorRevision: current.editorRevision,
        semantics: value.semantics,
        projection: { activeGraphRef: null, graphViews: [] },
      });
      if (!candidateDraft.ok) {
        return failure("INVALID_PROPOSAL", proposalSemanticIssuePath(candidateDraft.issue.path), candidateDraft.issue.message);
      }
      const candidate = candidateDraft.value.semantics;
      if (
        candidate.application.identity.id !== current.semantics.application.identity.id
        || candidate.application.publisher.id !== current.semantics.application.publisher.id
      ) {
        return failure("IDENTITY_MISMATCH", "$.semantics.application", "semantic proposal must preserve Application identity and publisher authority");
      }

      const baseSerialized = serializeViraCanvasSemanticsV2(current);
      const candidateSerialized = serializeViraCanvasSemanticsV2(candidateDraft.value);
      if (!baseSerialized.ok || !candidateSerialized.ok) {
        return failure("INVALID_PROPOSAL", "$.semantics", "semantic proposal could not be canonicalized");
      }
      if (baseSerialized.value === candidateSerialized.value) {
        return failure("NO_SEMANTIC_CHANGE", "$.semantics", "semantic proposal must change canonical Application V2 semantics");
      }

      const projectionCompatibility = parseViraCanvasDraftV2({
        schemaVersion: current.schemaVersion,
        draftId: current.draftId,
        editorRevision: current.editorRevision,
        semantics: candidate,
        projection: current.projection,
      }).ok ? "compatible" : "requires-reconcile";

      const next: ViraCanvasSemanticProposalV2 = Object.freeze({
        version: VIRA_CANVAS_COLLABORATION_V2_VERSION,
        proposalId: value.proposalId,
        draftId: current.draftId,
        authorId: author.value,
        baseEditorRevision: current.editorRevision,
        baseSemantics: current.semantics,
        candidateSemantics: candidate,
        summary: value.summary,
        projectionCompatibility,
      });
      proposalById.set(next.proposalId, next);
      reviewsByProposal.set(next.proposalId, new Map());
      return { ok: true, value: next };
    },

    listReviews: (proposalId: string) => Object.freeze(
      [...(reviewsByProposal.get(proposalId)?.values() ?? [])]
        .sort((left, right) => left.reviewerId.localeCompare(right.reviewerId)),
    ),

    reviewProposal: (inputValue): ViraCanvasReviewV2Result => {
      const review = parseExactInput(
        inputValue,
        ["proposalId", "reviewerId", "decision", "note"],
        ["proposalId", "reviewerId", "decision"],
        "INVALID_REVIEW",
      );
      if (!review.ok) return review;
      const value = review.value;
      if (!boundedId(value.proposalId)) return failure("INVALID_REVIEW", "$.proposalId", "proposalId is invalid");
      const proposal = proposalById.get(value.proposalId);
      if (!proposal) return failure("PROPOSAL_NOT_FOUND", "$.proposalId", "semantic proposal does not exist");
      const reviewer = requireParticipant(value.reviewerId, "$.reviewerId");
      if (!reviewer.ok) return reviewer;
      if (reviewer.value === proposal.authorId) return failure("SELF_REVIEW", "$.reviewerId", "proposal author cannot review their own semantic proposal");
      if (value.decision !== "approve" && value.decision !== "reject") {
        return failure("INVALID_REVIEW", "$.decision", "review decision must be approve or reject");
      }
      if (value.note !== undefined && !safeText(value.note, VIRA_CANVAS_COLLABORATION_MAX_REVIEW_NOTE_LENGTH, true)) {
        return failure("INVALID_REVIEW", "$.note", "review note is invalid");
      }
      const proposalReviews = reviewsByProposal.get(proposal.proposalId)!;
      if (proposalReviews.has(reviewer.value)) {
        return failure("DUPLICATE_REVIEW", "$.reviewerId", "reviewer already submitted an immutable review for this proposal");
      }
      const next: ViraCanvasSemanticReviewV2 = Object.freeze({
        version: VIRA_CANVAS_COLLABORATION_V2_VERSION,
        proposalId: proposal.proposalId,
        reviewerId: reviewer.value,
        decision: value.decision,
        ...(value.note === undefined ? {} : { note: value.note }),
      });
      proposalReviews.set(reviewer.value, next);
      return { ok: true, value: next };
    },

    applyProposal: (inputValue): ViraCanvasApplyProposalV2Result => {
      const apply = parseExactInput(
        inputValue,
        ["proposalId", "actorId", "expectedRevision"],
        undefined,
        "INVALID_INPUT",
      );
      if (!apply.ok) return apply;
      const value = apply.value;
      if (!boundedId(value.proposalId)) return failure("INVALID_INPUT", "$.proposalId", "proposalId is invalid");
      const proposal = proposalById.get(value.proposalId);
      if (!proposal) return failure("PROPOSAL_NOT_FOUND", "$.proposalId", "semantic proposal does not exist");
      const actor = requireParticipant(value.actorId, "$.actorId");
      if (!actor.ok) return actor;
      if (
        typeof value.expectedRevision !== "number"
        || !Number.isSafeInteger(value.expectedRevision)
        || value.expectedRevision < 0
      ) {
        return failure("INVALID_INPUT", "$.expectedRevision", "expectedRevision must be a non-negative safe integer");
      }
      const current = currentDraft();
      if (
        value.expectedRevision !== current.editorRevision
        || proposal.baseEditorRevision !== current.editorRevision
      ) {
        return failure("STALE_REVISION", "$.expectedRevision", "proposal base revision no longer matches current Canvas V2 editorRevision");
      }

      const reviews = [...(reviewsByProposal.get(proposal.proposalId)?.values() ?? [])];
      if (reviews.some((entry) => entry.decision === "reject")) {
        return failure("REVIEW_BLOCKED", "$.proposalId", "semantic proposal has an immutable rejection and must be replaced before apply");
      }
      const approvals = reviews.filter((entry) => entry.decision === "approve").length;
      if (approvals < requiredApprovals) {
        return failure(
          "INSUFFICIENT_APPROVALS",
          "$.proposalId",
          `semantic proposal requires ${requiredApprovals} distinct peer approvals before apply`,
        );
      }
      if (proposal.projectionCompatibility !== "compatible") {
        return failure(
          "PROJECTION_RECONCILIATION_REQUIRED",
          "$.proposalId",
          "semantic proposal invalidates current editor projection and must be reconciled before apply",
        );
      }

      const applied = mutationSession.replaceSemantics({
        expectedRevision: current.editorRevision,
        semantics: proposal.candidateSemantics,
      });
      if (!applied.ok) return failure("APPLY_FAILED", applied.issue.path, applied.issue.message);
      presenceByActor.clear();
      return { ok: true, value: applied.value };
    },
  };

  return { ok: true, value: Object.freeze(session) };
}
