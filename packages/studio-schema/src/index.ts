export {
  STUDIO_DOCUMENT_VERSION,
  STUDIO_EVENT_MAX_LENGTH,
  STUDIO_MAX_ACTION_PAYLOAD_BINDINGS,
  STUDIO_MAX_BINDINGS,
  STUDIO_MAX_INTERACTIONS,
  STUDIO_MAX_NODES_PER_VIEW,
  STUDIO_MAX_VIEWS,
} from "./types.js";
export type {
  StudioBinding,
  StudioBindingSource,
  StudioBindingSourceKind,
  StudioExperienceDocument,
  StudioExperienceDocumentResult,
  StudioInteraction,
  StudioInteractionOutcome,
  StudioInteractionPayloadBinding,
  StudioInteractionPayloadSource,
  StudioInteractionRoute,
  StudioNode,
  StudioRepeat,
  StudioValidationCode,
  StudioValidationIssue,
  StudioView,
} from "./types.js";
export { parseStudioExperienceDocument } from "./validate-v2.js";
export { isSemanticSegment as isStudioSemanticSegment } from "@vira-enterprise-genui/protocol";
