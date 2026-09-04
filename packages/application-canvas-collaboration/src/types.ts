import type {
  ViraCanvasDraft,
  ViraCanvasGraphRef,
  ViraCanvasSemantics,
} from "@vira-enterprise-genui/application-canvas";

export const VIRA_CANVAS_COLLABORATION_VERSION = "1" as const;
export const VIRA_CANVAS_COLLABORATION_MAX_PARTICIPANTS = 64 as const;
export const VIRA_CANVAS_COLLABORATION_MAX_ID_LENGTH = 128 as const;
export const VIRA_CANVAS_COLLABORATION_MAX_DISPLAY_NAME_LENGTH = 120 as const;
export const VIRA_CANVAS_COLLABORATION_MAX_SUMMARY_LENGTH = 2_000 as const;
export const VIRA_CANVAS_COLLABORATION_MAX_REVIEW_NOTE_LENGTH = 4_096 as const;

export interface ViraCanvasCollaborator {
  readonly id: string;
  readonly displayName: string;
}

export interface ViraCanvasPresenceCursor {
  readonly x: number;
  readonly y: number;
}

export interface ViraCanvasPresence {
  readonly version: typeof VIRA_CANVAS_COLLABORATION_VERSION;
  readonly actorId: string;
  readonly sequence: number;
  readonly activeGraphRef: ViraCanvasGraphRef | null;
  readonly selectedNodeIds: readonly string[];
  readonly selectedEdgeIds: readonly string[];
  readonly cursor: ViraCanvasPresenceCursor | null;
}

export type ViraCanvasProjectionCompatibility = "compatible" | "requires-reconcile";

export interface ViraCanvasSemanticProposal {
  readonly version: typeof VIRA_CANVAS_COLLABORATION_VERSION;
  readonly proposalId: string;
  readonly draftId: string;
  readonly authorId: string;
  readonly baseEditorRevision: number;
  readonly baseSemantics: ViraCanvasSemantics;
  readonly candidateSemantics: ViraCanvasSemantics;
  readonly summary: string;
  readonly projectionCompatibility: ViraCanvasProjectionCompatibility;
}

export type ViraCanvasSemanticReviewDecision = "approve" | "reject";

export interface ViraCanvasSemanticReview {
  readonly version: typeof VIRA_CANVAS_COLLABORATION_VERSION;
  readonly proposalId: string;
  readonly reviewerId: string;
  readonly decision: ViraCanvasSemanticReviewDecision;
  readonly note?: string;
}

export type ViraCanvasCollaborationIssueCode =
  | "INVALID_INPUT"
  | "INVALID_PARTICIPANTS"
  | "DUPLICATE_PARTICIPANT"
  | "UNKNOWN_PARTICIPANT"
  | "INVALID_APPROVAL_REQUIREMENT"
  | "INVALID_PRESENCE"
  | "STALE_PRESENCE"
  | "INVALID_PROPOSAL"
  | "DUPLICATE_PROPOSAL"
  | "NO_SEMANTIC_CHANGE"
  | "IDENTITY_MISMATCH"
  | "STALE_REVISION"
  | "PROPOSAL_NOT_FOUND"
  | "INVALID_REVIEW"
  | "SELF_REVIEW"
  | "DUPLICATE_REVIEW"
  | "REVIEW_BLOCKED"
  | "INSUFFICIENT_APPROVALS"
  | "PROJECTION_RECONCILIATION_REQUIRED"
  | "APPLY_FAILED";

export interface ViraCanvasCollaborationIssue {
  readonly code: ViraCanvasCollaborationIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCanvasPresenceResult =
  | { readonly ok: true; readonly value: ViraCanvasPresence }
  | { readonly ok: false; readonly issue: ViraCanvasCollaborationIssue };

export type ViraCanvasProposalResult =
  | { readonly ok: true; readonly value: ViraCanvasSemanticProposal }
  | { readonly ok: false; readonly issue: ViraCanvasCollaborationIssue };

export type ViraCanvasReviewResult =
  | { readonly ok: true; readonly value: ViraCanvasSemanticReview }
  | { readonly ok: false; readonly issue: ViraCanvasCollaborationIssue };

export type ViraCanvasApplyProposalResult =
  | { readonly ok: true; readonly value: ViraCanvasDraft }
  | { readonly ok: false; readonly issue: ViraCanvasCollaborationIssue };

export interface ViraCanvasCollaborationSession {
  readonly currentDraft: () => ViraCanvasDraft;
  readonly participants: () => readonly ViraCanvasCollaborator[];
  readonly requiredApprovals: number;
  readonly listPresence: () => readonly ViraCanvasPresence[];
  readonly updatePresence: (input: unknown) => ViraCanvasPresenceResult;
  readonly listProposals: () => readonly ViraCanvasSemanticProposal[];
  readonly createProposal: (input: unknown) => ViraCanvasProposalResult;
  readonly listReviews: (proposalId: string) => readonly ViraCanvasSemanticReview[];
  readonly reviewProposal: (input: unknown) => ViraCanvasReviewResult;
  readonly applyProposal: (input: unknown) => ViraCanvasApplyProposalResult;
}

export type CreateViraCanvasCollaborationSessionResult =
  | { readonly ok: true; readonly value: ViraCanvasCollaborationSession }
  | { readonly ok: false; readonly issue: ViraCanvasCollaborationIssue };
