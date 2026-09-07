export {
  VIRA_CAPABILITY_DEFINITION_SCHEMA_VERSION,
  VIRA_CAPABILITY_DESCRIPTION_MAX_LENGTH,
  VIRA_CAPABILITY_MAX_CONTEXT_REQUIREMENTS,
  VIRA_CAPABILITY_NAME_MAX_LENGTH,
  VIRA_CAPABILITY_PUBLISHER_NAME_MAX_LENGTH,
} from "./types.js";
export type {
  ViraCapabilityActionInvocation,
  ViraCapabilityDefinition,
  ViraCapabilityDefinitionResult,
  ViraCapabilityExactReference,
  ViraCapabilityInvocation,
  ViraCapabilityMetadata,
  ViraCapabilityPublisher,
  ViraCapabilityQueryInvocation,
  ViraCapabilitySerializationResult,
  ViraCapabilityValidationCode,
  ViraCapabilityValidationIssue,
  ViraCapabilityValueContract,
} from "./types.js";
export {
  parseViraCapabilityDefinition,
  serializeViraCapabilityDefinition,
} from "./validate.js";
export {
  parseViraCapabilityExactReference,
  serializeViraCapabilityExactReference,
} from "./reference.js";
export type {
  ViraCapabilityExactReferenceParseResult,
  ViraCapabilityExactReferenceSerializationResult,
} from "./reference.js";
export {
  parseViraCapabilityReleaseReference,
  serializeViraCapabilityReleaseReference,
} from "./release-reference.js";
export type {
  ViraCapabilityReleaseReference,
  ViraCapabilityReleaseReferenceParseResult,
  ViraCapabilityReleaseReferenceSerializationResult,
} from "./release-reference.js";

export { VIRA_CAPABILITY_DEFINITION_V2_SCHEMA_VERSION } from "./v2-types.js";
export type {
  ViraCapabilityActionInvocationV2,
  ViraCapabilityDefinitionV2,
  ViraCapabilityDefinitionV2Result,
  ViraCapabilityDefinitionV2SerializationResult,
  ViraCapabilityDefinitionV2ValidationIssue,
  ViraCapabilityInvocationV2,
} from "./v2-types.js";
export {
  parseViraCapabilityDefinitionV2,
  serializeViraCapabilityDefinitionV2,
} from "./v2-validate.js";
