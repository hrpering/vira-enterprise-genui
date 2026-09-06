import type {
  ViraCanvasDraftV2,
  ViraCanvasGraphRefV2,
  ViraCanvasSemanticsV2,
} from "@vira-enterprise-genui/application-canvas";
import type {
  ViraCanvasCollaborationIssue,
  ViraCanvasCollaborator,
  ViraCanvasPresenceCursor,
  ViraCanvasProjectionCompatibility,
  ViraCanvasSemanticReviewDecision,
} from "./types.js";

export const VIRA_CANVAS_COLLABORATION_V2_VERSION = "2" as const;

export interface ViraCanvasPresenceV2 {
  readonly version: typeof VIRA_CANVAS_COLLABORATION_V2_VERSION;
  readonly actorId: string;
  readonly sequence: number;
  readonly activeGraphRef: ViraCanvasGraphRefV2 | null;
  readonly selectedNodeIds: readonly string[];
  readonly selectedEdgeIds: readonly string[];
  readonly cursor: ViraCanvasPresenceCursor | null;
}

export interface ViraCanvasSemanticProposalV2 {
  readonly version: typeof VIRA_CANVAS_COLLABORATION_V2_VERSION;
  readonly proposalId: string;
  readonly draftId: string;
  readonly authorId: string;
  readonly baseEditorRevision: number;
  readonly baseSemantics: ViraCanvasSemanticsV2;
  readonly candidateSemantics: ViraCanvasSemanticsV2;
  readonly summary: string;
  readonly projectionCompatibility: ViraCanvasProjectionCompatibility;
}

export interface ViraCanvasSemanticReviewV2 {
  readonly version: typeof VIRA_CANVAS_COLLABORATION_V2_VERSION;
  readonly proposalId: string;
  readonly reviewerId: string;
  readonly decision: ViraCanvasSemanticReviewDecision;
  readonly note?: string;
}

export type ViraCanvasPresenceV2Result =
  | { readonly ok: true; readonly value: ViraCanvasPresenceV2 }
  | { readonly ok: false; readonly issue: ViraCanvasCollaborationIssue };

export type ViraCanvasProposalV2Result =
  | { readonly ok: true; readonly value: ViraCanvasSemanticProposalV2 }
  | { readonly ok: false; readonly issue: ViraCanvasCollaborationIssue };

export type ViraCanvasReviewV2Result =
  | { readonly ok: true; readonly value: ViraCanvasSemanticReviewV2 }
  | { readonly ok: false; readonly issue: ViraCanvasCollaborationIssue };

export type ViraCanvasApplyProposalV2Result =
  | { readonly ok: true; readonly value: ViraCanvasDraftV2 }
  | { readonly ok: false; readonly issue: ViraCanvasCollaborationIssue };

export interface ViraCanvasCollaborationSessionV2 {
  readonly currentDraft: () => ViraCanvasDraftV2;
  readonly participants: () => readonly ViraCanvasCollaborator[];
  readonly requiredApprovals: number;
  readonly listPresence: () => readonly ViraCanvasPresenceV2[];
  readonly updatePresence: (input: unknown) => ViraCanvasPresenceV2Result;
  readonly listProposals: () => readonly ViraCanvasSemanticProposalV2[];
  readonly createProposal: (input: unknown) => ViraCanvasProposalV2Result;
  readonly listReviews: (proposalId: string) => readonly ViraCanvasSemanticReviewV2[];
  readonly reviewProposal: (input: unknown) => ViraCanvasReviewV2Result;
  readonly applyProposal: (input: unknown) => ViraCanvasApplyProposalV2Result;
}

export type CreateViraCanvasCollaborationSessionV2Result =
  | { readonly ok: true; readonly value: ViraCanvasCollaborationSessionV2 }
  | { readonly ok: false; readonly issue: ViraCanvasCollaborationIssue };
