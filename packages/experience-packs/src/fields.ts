import {
  EXPERIENCE_PACK_ALLOWED_MEDIA_TYPES,
  EXPERIENCE_PACK_MAX_ARTIFACT_SIZE_BYTES,
  EXPERIENCE_PACK_MAX_DESCRIPTION_LENGTH,
  EXPERIENCE_PACK_MAX_NAME_LENGTH,
  EXPERIENCE_PACK_MAX_TAGS,
} from "./types.js";
import type {
  ExperiencePackArtifactDescriptor,
  ExperiencePackCompatibility,
  ExperiencePackManifestResult,
  ExperiencePackMetadata,
  ExperiencePackPublisher,
} from "./types.js";
import {
  ARTIFACT_ID,
  SEGMENT,
  SHA256,
  TAG,
  appendOwnArrayValue,
  artifactRole,
  boundedText,
  compareVersion,
  containsOwnString,
  denseOwnDataArray,
  exact,
  hasOwnField,
  matches,
  ownArrayLength,
  ownArrayValue,
  record,
  releaseVersion,
  safeInteger,
} from "./internal.js";

function canonicalRecord<T extends object>(value: T): T {
  const snapshot = record(value);
  if (!snapshot) throw new Error("canonical Pack record construction failed");
  return snapshot as unknown as T;
}

export function parsePublisher(value: unknown):
  | { readonly ok: true; readonly value: ExperiencePackPublisher }
  | { readonly ok: false; readonly result: ExperiencePackManifestResult } {
  const publisher = record(value);
  if (!publisher) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_PUBLISHER", path: "$.publisher", message: "publisher must be a plain object" } } };
  }
  const unknown = exact(publisher, ["id", "name"]);
  if (unknown) {
    return { ok: false, result: { ok: false, issue: { code: "UNKNOWN_FIELD", path: `$.publisher.${unknown}`, message: `unknown publisher field: ${unknown}` } } };
  }
  if (typeof publisher.id !== "string" || !matches(SEGMENT, publisher.id)) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_PUBLISHER", path: "$.publisher.id", message: "publisher id must be a lowercase registry segment" } } };
  }
  if (!boundedText(publisher.name, EXPERIENCE_PACK_MAX_NAME_LENGTH)) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_PUBLISHER", path: "$.publisher.name", message: "publisher name is invalid or too long" } } };
  }
  return { ok: true, value: canonicalRecord({ id: publisher.id, name: publisher.name }) };
}

export function parseMetadata(value: unknown):
  | { readonly ok: true; readonly value: ExperiencePackMetadata }
  | { readonly ok: false; readonly result: ExperiencePackManifestResult } {
  const metadata = record(value);
  if (!metadata) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_METADATA", path: "$.metadata", message: "metadata must be a plain object" } } };
  }
  const unknown = exact(metadata, ["name", "description", "tags"]);
  if (unknown) {
    return { ok: false, result: { ok: false, issue: { code: "UNKNOWN_FIELD", path: `$.metadata.${unknown}`, message: `unknown metadata field: ${unknown}` } } };
  }
  if (!boundedText(metadata.name, EXPERIENCE_PACK_MAX_NAME_LENGTH)) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_METADATA", path: "$.metadata.name", message: "metadata name is invalid or too long" } } };
  }
  const hasDescription = hasOwnField(metadata, "description");
  if (hasDescription && !boundedText(metadata.description, EXPERIENCE_PACK_MAX_DESCRIPTION_LENGTH)) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_METADATA", path: "$.metadata.description", message: "description is invalid or too long" } } };
  }

  const tagValues = denseOwnDataArray(metadata.tags, EXPERIENCE_PACK_MAX_TAGS);
  if (!tagValues.ok) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_METADATA", path: "$.metadata.tags", message: `tags must be a dense own-data array with at most ${EXPERIENCE_PACK_MAX_TAGS} entries` } } };
  }
  const tagCount = ownArrayLength(tagValues.value);
  if (tagCount === undefined) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_METADATA", path: "$.metadata.tags", message: "tags must be a dense own-data array" } } };
  }

  const tags: string[] = [];
  for (let index = 0; index < tagCount; index += 1) {
    const tag = ownArrayValue(tagValues.value, index);
    if (typeof tag !== "string" || !matches(TAG, tag)) {
      return { ok: false, result: { ok: false, issue: { code: "INVALID_METADATA", path: `$.metadata.tags[${index}]`, message: "tag must be a lowercase registry token" } } };
    }
    if (containsOwnString(tags, tag)) {
      return { ok: false, result: { ok: false, issue: { code: "INVALID_METADATA", path: `$.metadata.tags[${index}]`, message: "duplicate metadata tag" } } };
    }
    appendOwnArrayValue(tags, tag);
  }
  const result: ExperiencePackMetadata = hasDescription
    ? canonicalRecord({ name: metadata.name, description: metadata.description as string, tags })
    : canonicalRecord({ name: metadata.name, tags });
  return { ok: true, value: result };
}

export function parseCompatibility(value: unknown):
  | { readonly ok: true; readonly value: ExperiencePackCompatibility }
  | { readonly ok: false; readonly result: ExperiencePackManifestResult } {
  const compatibility = record(value);
  if (!compatibility) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_COMPATIBILITY", path: "$.compatibility", message: "compatibility must be a plain object" } } };
  }
  const unknown = exact(compatibility, ["minViraVersion", "maxViraVersion"]);
  if (unknown) {
    return { ok: false, result: { ok: false, issue: { code: "UNKNOWN_FIELD", path: `$.compatibility.${unknown}`, message: `unknown compatibility field: ${unknown}` } } };
  }
  const minimum = releaseVersion(compatibility.minViraVersion);
  if (!minimum) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_COMPATIBILITY", path: "$.compatibility.minViraVersion", message: "minimum Vira version must be release semver" } } };
  }
  if (!hasOwnField(compatibility, "maxViraVersion")) {
    return { ok: true, value: canonicalRecord({ minViraVersion: compatibility.minViraVersion as string }) };
  }
  const maximum = releaseVersion(compatibility.maxViraVersion);
  if (!maximum) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_COMPATIBILITY", path: "$.compatibility.maxViraVersion", message: "maximum Vira version must be release semver" } } };
  }
  if (compareVersion(maximum, minimum) < 0) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_COMPATIBILITY", path: "$.compatibility.maxViraVersion", message: "maximum Vira version must not be lower than minimum" } } };
  }
  return {
    ok: true,
    value: canonicalRecord({
      minViraVersion: compatibility.minViraVersion as string,
      maxViraVersion: compatibility.maxViraVersion as string,
    }),
  };
}

export function parseArtifact(value: unknown, index: number):
  | { readonly ok: true; readonly value: ExperiencePackArtifactDescriptor }
  | { readonly ok: false; readonly result: ExperiencePackManifestResult } {
  const path = `$.artifacts[${index}]`;
  const artifact = record(value);
  if (!artifact) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_ARTIFACT", path, message: "artifact must be a plain object" } } };
  }
  const unknown = exact(artifact, ["id", "role", "mediaType", "digest", "size"]);
  if (unknown) {
    return { ok: false, result: { ok: false, issue: { code: "UNKNOWN_FIELD", path: `${path}.${unknown}`, message: `unknown artifact field: ${unknown}` } } };
  }
  if (typeof artifact.id !== "string" || !matches(ARTIFACT_ID, artifact.id)) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_ARTIFACT", path: `${path}.id`, message: "artifact id must be a bounded lowercase token" } } };
  }
  if (!artifactRole(artifact.role)) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_ARTIFACT", path: `${path}.role`, message: "artifact role is unsupported" } } };
  }
  const allowedMediaTypes = EXPERIENCE_PACK_ALLOWED_MEDIA_TYPES[artifact.role] as readonly string[];
  if (typeof artifact.mediaType !== "string" || !containsOwnString(allowedMediaTypes, artifact.mediaType)) {
    return { ok: false, result: { ok: false, issue: { code: "UNSAFE_MEDIA_TYPE", path: `${path}.mediaType`, message: `media type is not allowed for ${artifact.role} artifacts` } } };
  }
  if (typeof artifact.digest !== "string" || !matches(SHA256, artifact.digest)) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_ARTIFACT", path: `${path}.digest`, message: "artifact digest must be lowercase sha256:<64 hex>" } } };
  }
  if (!safeInteger(artifact.size) || artifact.size < 0 || artifact.size > EXPERIENCE_PACK_MAX_ARTIFACT_SIZE_BYTES) {
    return { ok: false, result: { ok: false, issue: { code: "INVALID_ARTIFACT", path: `${path}.size`, message: `artifact size must be an integer between 0 and ${EXPERIENCE_PACK_MAX_ARTIFACT_SIZE_BYTES}` } } };
  }
  return {
    ok: true,
    value: canonicalRecord({
      id: artifact.id,
      role: artifact.role,
      mediaType: artifact.mediaType,
      digest: artifact.digest,
      size: artifact.size,
    }),
  };
}

export { ARTIFACT_ID } from "./internal.js";
