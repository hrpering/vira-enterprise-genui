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
import {
  PACK_ID,
  appendOwnArrayValue,
  denseOwnDataArray,
  exact,
  freeze,
  record,
  releaseVersion,
  stable,
} from "./internal.js";

function failure(
  code: ExperiencePackValidationCode,
  path: string,
  message: string,
): ExperiencePackManifestResult {
  return { ok: false, issue: { code, path, message } };
}

export function parseExperiencePackManifest(input: unknown): ExperiencePackManifestResult {
  const root = record(input);
  if (!root) return failure("INVALID_TYPE", "$", "experience pack manifest must be a plain own-data object");

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

  const artifactValues = denseOwnDataArray(root.artifacts, EXPERIENCE_PACK_MAX_ARTIFACTS);
  if (!artifactValues.ok) {
    return artifactValues.reason === "limit-exceeded"
      ? failure("ARTIFACT_LIMIT_EXCEEDED", "$.artifacts", `a pack may contain at most ${EXPERIENCE_PACK_MAX_ARTIFACTS} artifacts`)
      : failure("INVALID_ARTIFACT", "$.artifacts", "artifacts must be a non-empty dense own-data array");
  }
  if (artifactValues.value.length === 0) {
    return failure("INVALID_ARTIFACT", "$.artifacts", "artifacts must be a non-empty dense own-data array");
  }

  const artifacts: ExperiencePackArtifactDescriptor[] = [];
  const artifactById = new Map<string, ExperiencePackArtifactDescriptor>();
  for (let index = 0; index < artifactValues.value.length; index += 1) {
    const artifact = parseArtifact(artifactValues.value[index], index);
    if (!artifact.ok) return artifact.result;
    if (artifactById.has(artifact.value.id)) {
      return failure("DUPLICATE_ARTIFACT", `$.artifacts[${index}].id`, "artifact ids must be unique within a pack");
    }
    artifactById.set(artifact.value.id, artifact.value);
    appendOwnArrayValue(artifacts, artifact.value);
  }

  const entrypointValues = denseOwnDataArray(root.entrypoints, EXPERIENCE_PACK_MAX_ENTRYPOINTS);
  if (!entrypointValues.ok) {
    return entrypointValues.reason === "limit-exceeded"
      ? failure("ENTRYPOINT_LIMIT_EXCEEDED", "$.entrypoints", `a pack may contain at most ${EXPERIENCE_PACK_MAX_ENTRYPOINTS} entrypoints`)
      : failure("INVALID_ENTRYPOINT", "$.entrypoints", "entrypoints must be a non-empty dense own-data array");
  }
  if (entrypointValues.value.length === 0) {
    return failure("INVALID_ENTRYPOINT", "$.entrypoints", "entrypoints must be a non-empty dense own-data array");
  }

  const entrypoints: string[] = [];
  const seenEntrypoints = new Set<string>();
  for (let index = 0; index < entrypointValues.value.length; index += 1) {
    const entrypoint = entrypointValues.value[index];
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
    if (artifact.role !== "studio-publication") {
      return failure("INVALID_ENTRYPOINT", `$.entrypoints[${index}]`, "entrypoint must reference a Studio publication artifact");
    }
    seenEntrypoints.add(entrypoint);
    appendOwnArrayValue(entrypoints, entrypoint);
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
