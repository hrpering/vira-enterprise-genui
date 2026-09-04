export {
  VIRA_CANVAS_AI_EXPLANATION_MAX_LENGTH,
  VIRA_CANVAS_AI_MAX_DIFF_ENTRIES,
  VIRA_CANVAS_AI_MAX_SUPPORTED_REFERENCES,
  VIRA_CANVAS_AI_PROMPT_MAX_LENGTH,
  VIRA_CANVAS_AI_VERSION,
} from "./types.js";
export type {
  ViraCanvasAiDiffEntry,
  ViraCanvasAiDiffKind,
  ViraCanvasAiIssue,
  ViraCanvasAiIssueCode,
  ViraCanvasAiProjectionCompatibility,
  ViraCanvasAiProposal,
  ViraCanvasAiProposalResult,
  ViraCanvasAiProvider,
  ViraCanvasAiRequest,
  ViraCanvasAiSupportedReferences,
} from "./types.js";
export { generateViraCanvasAiProposal } from "./guard.js";
