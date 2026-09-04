export {
  VIRA_WORK_CONTEXT_DEFINITION_SCHEMA_VERSION,
  VIRA_WORK_CONTEXT_DESCRIPTION_MAX_LENGTH,
  VIRA_WORK_CONTEXT_ITEM_KINDS,
  VIRA_WORK_CONTEXT_MAX_ID_LENGTH,
  VIRA_WORK_CONTEXT_MAX_ITEMS,
  VIRA_WORK_CONTEXT_MAX_PROVENANCE_REFS,
  VIRA_WORK_CONTEXT_NAME_MAX_LENGTH,
  VIRA_WORK_CONTEXT_PUBLISHER_NAME_MAX_LENGTH,
  VIRA_WORK_CONTEXT_SCHEMA_VERSION,
} from "./types.js";
export type {
  ViraWorkContext,
  ViraWorkContextDefinition,
  ViraWorkContextDefinitionResult,
  ViraWorkContextDefinitionSerializationResult,
  ViraWorkContextExactReference,
  ViraWorkContextItem,
  ViraWorkContextItemKind,
  ViraWorkContextMetadata,
  ViraWorkContextProvenance,
  ViraWorkContextPublisher,
  ViraWorkContextResult,
  ViraWorkContextSerializationResult,
  ViraWorkContextValidationCode,
  ViraWorkContextValidationIssue,
} from "./types.js";
export {
  parseViraWorkContext,
  parseViraWorkContextDefinition,
  serializeViraWorkContext,
  serializeViraWorkContextDefinition,
} from "./validate.js";
