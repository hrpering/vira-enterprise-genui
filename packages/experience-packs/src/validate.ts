import {
  EXPERIENCE_PACK_MAX_ARTIFACTS,
  EXPERIENCE_PACK_MAX_ENTRYPOINTS,
  EXPERIENCE_PACK_SCHEMA_VERSION,
} from "./types.js";
import type {
  ExperiencePackArtifactDescriptor,
  ExperiencePackManifest,
  ExperiencePackManifestResult,
  ExperiencePackSerializationResult,
  ExperiencePackValidationCode,
} from "./types.js";
import { ARTIFACT_ID, parseArtifact, parseCompatibility, parseMetadata, parsePublisher } from "./fields.js";
import { PACK_ID, exact, freeze, record, releaseVersion, stable } from "./internal.js";

function failure(
  code: ExperiencePackValidationCode,
  path: string,
  message: string,
): ExperiencePackManifestResult {
  return { ok: false, issue: { code, path, message } };
}

export function parseExperiencePackManifest(input: unknown): ExperiencePackManifestResult {
  const root = record(input);
  if (!root) return failure("INVALID_TYPE", "$", "experience pack manifest must be a plain object");

  const unknown = exact(root, [
    "schemaVersion",
    "id",
    "version",
    "publisher",
    "metadata",
    "compatibility",
    "entrypoints",
    "artifacts",
  ]);
  if (unknown) return failure("UNKNOWN_FIELD", `$.${unknown}`, `unknown experience pack field: ${unknown}`);

  if (root.schemaVersion !== EXPERIENCE_PACK_SCHEMA_VERSION) {
    return failure("INVALID_SCHEMA_VERSION", "$.schemaVersion", `schemaVersion must equal ${EXPERIENCE_PACK_SCHEMA_VERSION}`);
  }
  if (typeof root.id !== "string" || !PACK_ID.test(root.id)) {
    return failure("INVALID_ID", "$.id", "pack id must use publisher/name lowercase registry syntax");
  }
  if (!releaseVersion(root.version)) {
    return failure("INVALID_VERSION", "$.version", "pack version must be release semver");
  }

  const publisher = parsePublisher(root.publisher);
  if (!publisher.ok) return publisher.result;
  if (root.id.split("/")[0] !== publisher.value.id) {
    return failure("INVALID_PUBLISHER", "$.publisher.id", "publisher id must match the namespace in pack id");
  }

  const metadata = parseMetadata(root.metadata);
  if (!metadata.ok) return metadata.result;
  const compatibility = parseCompatibility(root.compatibility);
  if (!compatibility.ok) return compatibility.result;

  if (!Array.isArray(root.artifacts) || root.artifacts.length === 0) {
    return failure("INVALID_ARTIFACT", "$.artifacts", "artifacts must be a non-empty array");
  }
  if (root.artifacts.length > EXPERIENCE_PACK_MAX_ARTIFACTS) {
    return failure("ARTIFACT_LIMIT_EXCEEDED", "$.artifacts", `a pack may contain at most ${EXPERIENCE_PACK_MAX_ARTIFACTS} artifacts`);
  }

  const artifacts: ExperiencePackArtifactDescriptor[] = [];
  const artifactById = new Map<string, ExperiencePackArtifactDescriptor>();
  for (let index = 0; index < root.artifacts.length; index += 1) {
    const artifact = parseArtifact(root.artifacts[index], index);
    if (!artifact.ok) return artifact.result;
    if (artifactById.has(artifact.value.id)) {
      return failure("DUPLICATE_ARTIFACT", `$.artifacts[${index}].id`, "artifact ids must be unique within a pack");
    }
    artifactById.set(artifact.value.id, artifact.value);
    artifacts.push(artifact.value);
  }

  if (!Array.isArray(root.entrypoints) || root.entrypoints.length === 0) {
    return failure("INVALID_ENTRYPOINT", "$.entrypoints", "entrypoints must be a non-empty array");
  }
  if (root.entrypoints.length > EXPERIENCE_PACK_MAX_ENTRYPOINTS) {
    return failure("ENTRYPOINT_LIMIT_EXCEEDED", "$.entrypoints", `a pack may contain at most ${EXPERIENCE_PACK_MAX_ENTRYPOINTS} entrypoints`);
  }

  const entrypoints: string[] = [];
  const seenEntrypoints = new Set<string>();
  for (let index = 0; index < root.entrypoints.length; index += 1) {
    const entrypoint = root.entrypoints[index];
    if (typeof entrypoint !== "string" || !ARTIFACT_ID.test(entrypoint)) {
      return failure("INVALID_ENTRYPOINT", `$.entrypoints[${index}]`, "entrypoint must reference an artifact id");
    }
    if (seenEntrypoints.has(entrypoint)) {
      return failure("DUPLICATE_ENTRYPOINT", `$.entrypoints[${index}]`, "entrypoints must be unique");
    }
    const artifact = artifactById.get(entrypoint);
    if (!artifact) {
      return failure("INVALID_ENTRYPOINT", `$.entrypoints[${index}]`, "entrypoint references an artifact that does not exist");
    }
    if (artifact.role !== "experience") {
      return failure("INVALID_ENTRYPOINT", `$.entrypoints[${index}]`, "entrypoint must reference an experience artifact");
    }
    seenEntrypoints.add(entrypoint);
    entrypoints.push(entrypoint);
  }

  const manifest: ExperiencePackManifest = {
    schemaVersion: EXPERIENCE_PACK_SCHEMA_VERSION,
    id: root.id,
    version: root.version as string,
    publisher: publisher.value,
    metadata: metadata.value,
    compatibility: compatibility.value,
    entrypoints,
    artifacts,
  };
  return { ok: true, value: freeze(manifest) };
}

export function serializeExperiencePackManifest(input: unknown): ExperiencePackSerializationResult {
  const parsed = parseExperiencePackManifest(input);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: JSON.stringify(stable(parsed.value)),
    manifest: parsed.value,
  };
}
