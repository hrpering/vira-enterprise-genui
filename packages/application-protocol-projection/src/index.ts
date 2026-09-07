export {
  VIRA_APPLICATION_PROTOCOL_PROJECTION_MAX_LOSSES,
  VIRA_APPLICATION_PROTOCOL_PROJECTION_PATH_MAX_LENGTH,
  VIRA_APPLICATION_PROTOCOL_PROJECTION_REASON_MAX_LENGTH,
  VIRA_APPLICATION_PROTOCOL_PROJECTION_SCHEMA_VERSION,
} from "./types.js";
export type {
  ViraApplicationProtocolProjectionArtifact,
  ViraApplicationProtocolProjectionFidelity,
  ViraApplicationProtocolProjectionIssue,
  ViraApplicationProtocolProjectionLoss,
  ViraApplicationProtocolProjectionLosslessResult,
  ViraApplicationProtocolProjectionLossyResult,
  ViraApplicationProtocolProjectionParseResult,
  ViraApplicationProtocolProjectionRef,
  ViraApplicationProtocolProjectionResult,
  ViraApplicationProtocolProjectionSerializationResult,
  ViraApplicationProtocolProjectionUnsupportedResult,
  ViraApplicationProtocolProjectionValidationCode,
} from "./types.js";
export {
  parseViraApplicationProtocolProjection,
  serializeViraApplicationProtocolProjection,
} from "./validate.js";

export { VIRA_APPLICATION_PROTOCOL_PROJECTION_V2_SCHEMA_VERSION } from "./v2-types.js";
export type {
  ViraApplicationProtocolProjectionArtifactV2,
  ViraApplicationProtocolProjectionRefV2,
  ViraApplicationProtocolProjectionV2Issue,
  ViraApplicationProtocolProjectionV2ParseResult,
  ViraApplicationProtocolProjectionV2SerializationResult,
} from "./v2-types.js";
export {
  parseViraApplicationProtocolProjectionV2,
  serializeViraApplicationProtocolProjectionV2,
} from "./v2-validate.js";
