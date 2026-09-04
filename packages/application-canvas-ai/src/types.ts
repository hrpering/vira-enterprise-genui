import type {
  ViraCanvasGraphRef,
  ViraCanvasSemantics,
} from "@vira-enterprise-genui/application-canvas";
import type {
  ViraApplicationActionReference,
  ViraApplicationExactReference,
  ViraApplicationExperienceReference,
} from "@vira-enterprise-genui/application-package";

export const VIRA_CANVAS_AI_VERSION = "1" as const;
export const VIRA_CANVAS_AI_PROMPT_MAX_LENGTH = 16_000 as const;
export const VIRA_CANVAS_AI_EXPLANATION_MAX_LENGTH = 16_000 as const;
export const VIRA_CANVAS_AI_MAX_SUPPORTED_REFERENCES = 256 as const;
export const VIRA_CANVAS_AI_MAX_DIFF_ENTRIES = 256 as const;

export interface ViraCanvasAiSupportedReferences {
  readonly experiences: readonly ViraApplicationExperienceReference[];
  readonly capabilities: readonly ViraApplicationExactReference[];
  readonly contextTypes: readonly ViraApplicationExactReference[];
  readonly actions: readonly ViraApplicationActionReference[];
  readonly flows: readonly ViraApplicationExactReference[];
  readonly brandRefs: readonly ViraApplicationExactReference[];
  readonly governanceRequirements: readonly ViraApplicationExactReference[];
  readonly protocolProjections: readonly ViraApplicationExactReference[];
  readonly entitlementRefs: readonly ViraApplicationExactReference[];
  readonly meteringRefs: readonly ViraApplicationExactReference[];
  readonly hostCapabilities: readonly string[];
}

export interface ViraCanvasAiRequest {
  readonly version: typeof VIRA_CANVAS_AI_VERSION;
  readonly prompt: string;
  readonly draftId: string;
  readonly editorRevision: number;
  readonly baseSemantics: ViraCanvasSemantics;
  readonly supported: ViraCanvasAiSupportedReferences;
}

export interface ViraCanvasAiProvider {
  readonly generate: (request: ViraCanvasAiRequest) => unknown | Promise<unknown>;
}

export type ViraCanvasAiDiffKind =
  | "application-field-changed"
  | "graph-added"
  | "graph-removed"
  | "graph-changed";

export interface ViraCanvasAiDiffEntry {
  readonly kind: ViraCanvasAiDiffKind;
  readonly path: string;
  readonly graphRef?: ViraCanvasGraphRef;
}

export interface ViraCanvasAiProposal {
  readonly version: typeof VIRA_CANVAS_AI_VERSION;
  readonly draftId: string;
  readonly expectedRevision: number;
  readonly baseSemantics: ViraCanvasSemantics;
  readonly candidateSemantics: ViraCanvasSemantics;
  readonly explanation: string;
  readonly diff: readonly ViraCanvasAiDiffEntry[];
}

export type ViraCanvasAiIssueCode =
  | "INVALID_INPUT"
  | "INVALID_PROMPT"
  | "INVALID_BASE_DRAFT"
  | "INVALID_SUPPORTED_REFERENCES"
  | "INVALID_PROVIDER"
  | "PROVIDER_FAILED"
  | "INVALID_PROVIDER_RESPONSE"
  | "INVALID_CANDIDATE"
  | "IDENTITY_MISMATCH"
  | "UNSUPPORTED_REFERENCE"
  | "DIFF_LIMIT_EXCEEDED";

export interface ViraCanvasAiIssue {
  readonly code: ViraCanvasAiIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCanvasAiProposalResult =
  | { readonly ok: true; readonly value: ViraCanvasAiProposal }
  | { readonly ok: false; readonly issue: ViraCanvasAiIssue };
