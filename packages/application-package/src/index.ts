export {
  VIRA_APPLICATION_PACKAGE_MAX_ACTIONS,
  VIRA_APPLICATION_PACKAGE_MAX_DESCRIPTION_LENGTH,
  VIRA_APPLICATION_PACKAGE_MAX_EXPERIENCES,
  VIRA_APPLICATION_PACKAGE_MAX_NAME_LENGTH,
  VIRA_APPLICATION_PACKAGE_MAX_PUBLISHER_NAME_LENGTH,
  VIRA_APPLICATION_PACKAGE_MAX_REFERENCES,
  VIRA_APPLICATION_PACKAGE_MAX_TAGS,
  VIRA_APPLICATION_PACKAGE_SCHEMA_VERSION,
  VIRA_APPLICATION_VISIBILITIES,
} from "./types.js";
export type {
  ViraApplicationActionReference,
  ViraApplicationCommercialMetadata,
  ViraApplicationDistributionMetadata,
  ViraApplicationExactReference,
  ViraApplicationExperienceReference,
  ViraApplicationHostCompatibility,
  ViraApplicationIdentity,
  ViraApplicationPackage,
  ViraApplicationPackageResult,
  ViraApplicationPackageSerializationResult,
  ViraApplicationPackageValidationCode,
  ViraApplicationPackageValidationIssue,
  ViraApplicationPublisher,
  ViraApplicationVisibility,
} from "./types.js";
export {
  parseViraApplicationPackage,
  serializeViraApplicationPackage,
} from "./validate.js";
export {
  parseViraApplicationExactReference,
  serializeViraApplicationExactReference,
} from "./reference.js";
export type {
  ViraApplicationExactReferenceParseResult,
  ViraApplicationExactReferenceSerializationResult,
} from "./reference.js";
export {
  parseViraApplicationReleaseReference,
  serializeViraApplicationReleaseReference,
} from "./release-reference.js";
export type {
  ViraApplicationReleaseReference,
  ViraApplicationReleaseReferenceParseResult,
  ViraApplicationReleaseReferenceSerializationResult,
} from "./release-reference.js";

export {
  VIRA_APPLICATION_PACKAGE_V2_SCHEMA_VERSION,
  VIRA_APPLICATION_TRIGGER_TYPES,
} from "./v2-types.js";
export type {
  ViraApplicationCommercialMetadataV2,
  ViraApplicationPackageV2,
  ViraApplicationPackageV2Result,
  ViraApplicationPackageV2SerializationResult,
  ViraApplicationPackageV2ValidationCode,
  ViraApplicationPackageV2ValidationIssue,
  ViraApplicationTriggerDeclaration,
  ViraApplicationTriggerType,
} from "./v2-types.js";
export {
  parseViraApplicationPackageV2,
  serializeViraApplicationPackageV2,
} from "./v2-validate.js";
export {
  migrateViraApplicationPackageV1ToV2,
} from "./migrate-v1-to-v2.js";
export type {
  ViraApplicationV1ActionMapping,
  ViraApplicationV1ToV2MigrationCode,
  ViraApplicationV1ToV2MigrationDeclaration,
  ViraApplicationV1ToV2MigrationIssue,
  ViraApplicationV1ToV2MigrationResult,
} from "./migrate-v1-to-v2.js";
