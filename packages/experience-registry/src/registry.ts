import { parseExperiencePackManifest } from "@vira-enterprise-genui/experience-packs";
import type { ExperiencePackManifest } from "@vira-enterprise-genui/experience-packs";
import type {
  ExperienceRegistryLookupResult,
  ExperienceRegistrySnapshot,
  ExperienceRegistrySnapshotResult,
  ExperienceRegistryValidationCode,
} from "./types.js";
import {
  EXPERIENCE_REGISTRY_MAX_MANIFESTS,
  EXPERIENCE_REGISTRY_MAX_SERIALIZED_LENGTH,
  EXPERIENCE_REGISTRY_QUERY_MAX_LENGTH,
  EXPERIENCE_REGISTRY_SCHEMA_VERSION,
} from "./types.js";

const SNAPSHOT_FIELDS = new Set(["schemaVersion", "manifests"]);
const CANONICAL_SNAPSHOTS = new WeakSet<object>();

type JsonContainer = Record<string, unknown> | unknown[];
interface DetachWorkItem {
  readonly source: JsonContainer;
  readonly target: JsonContainer;
}

function snapshotFailure(
  code: ExperienceRegistryValidationCode,
  path: string,
  message: string,
): ExperienceRegistrySnapshotResult {
  return { ok: false, issue: { code, path, message } };
}

function parsedObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function detachedContainer(source: JsonContainer): JsonContainer {
  if (!Array.isArray(source)) {
    return Object.create(null) as Record<string, unknown>;
  }
  const target = new Array<unknown>(source.length);
  Object.setPrototypeOf(target, null);
  return target;
}

function defineOwnData(target: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function detachParsedJson(input: unknown): unknown {
  if (input === null || typeof input !== "object") return input;

  const rootSource = input as JsonContainer;
  const rootTarget = detachedContainer(rootSource);
  const worklist = Object.create(null) as Record<number, DetachWorkItem | undefined>;
  let readIndex = 0;
  let writeIndex = 1;
  worklist[0] = { source: rootSource, target: rootTarget };

  while (readIndex < writeIndex) {
    const current = worklist[readIndex];
    delete worklist[readIndex];
    readIndex += 1;
    if (!current) continue;

    if (Array.isArray(current.source)) {
      const target = current.target as unknown[];
      for (let index = 0; index < current.source.length; index += 1) {
        const child = current.source[index];
        if (child !== null && typeof child === "object") {
          const childSource = child as JsonContainer;
          const childTarget = detachedContainer(childSource);
          defineOwnData(target, String(index), childTarget);
          worklist[writeIndex] = { source: childSource, target: childTarget };
          writeIndex += 1;
        } else {
          defineOwnData(target, String(index), child);
        }
      }
      continue;
    }

    const target = current.target as Record<string, unknown>;
    for (const key of Object.keys(current.source)) {
      const child = current.source[key];
      if (child !== null && typeof child === "object") {
        const childSource = child as JsonContainer;
        const childTarget = detachedContainer(childSource);
        defineOwnData(target, key, childTarget);
        worklist[writeIndex] = { source: childSource, target: childTarget };
        writeIndex += 1;
      } else {
        defineOwnData(target, key, child);
      }
    }
  }

  return rootTarget;
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareManifest(left: ExperiencePackManifest, right: ExperiencePackManifest): number {
  const idOrder = compareText(left.id, right.id);
  return idOrder === 0 ? compareText(left.version, right.version) : idOrder;
}

export function parseExperienceRegistrySnapshot(input: unknown): ExperienceRegistrySnapshotResult {
  if (
    typeof input !== "string"
    || input.length === 0
    || input.length > EXPERIENCE_REGISTRY_MAX_SERIALIZED_LENGTH
  ) {
    return snapshotFailure(
      "INVALID_INPUT",
      "$",
      `experience registry input must be JSON text of at most ${EXPERIENCE_REGISTRY_MAX_SERIALIZED_LENGTH} characters`,
    );
  }

  let parsed: unknown;
  try {
    parsed = detachParsedJson(JSON.parse(input) as unknown);
  } catch {
    return snapshotFailure("INVALID_JSON", "$", "experience registry input must be valid JSON");
  }

  if (!parsedObject(parsed)) {
    return snapshotFailure("INVALID_INPUT", "$", "experience registry JSON root must be an object");
  }

  const names = Object.keys(parsed);
  if (names.some((name) => !SNAPSHOT_FIELDS.has(name))) {
    return snapshotFailure("UNKNOWN_FIELD", "$", "experience registry snapshot contains an unsupported field");
  }

  if (parsed.schemaVersion !== EXPERIENCE_REGISTRY_SCHEMA_VERSION) {
    return snapshotFailure(
      "INVALID_SCHEMA_VERSION",
      "$.schemaVersion",
      `experience registry schemaVersion must equal ${EXPERIENCE_REGISTRY_SCHEMA_VERSION}`,
    );
  }

  if (!Array.isArray(parsed.manifests)) {
    return snapshotFailure("INVALID_MANIFESTS", "$.manifests", "manifests must be an array");
  }
  if (parsed.manifests.length > EXPERIENCE_REGISTRY_MAX_MANIFESTS) {
    return snapshotFailure(
      "MANIFEST_LIMIT_EXCEEDED",
      "$.manifests",
      `experience registry may contain at most ${EXPERIENCE_REGISTRY_MAX_MANIFESTS} manifests`,
    );
  }

  const canonical: ExperiencePackManifest[] = [];
  const versionsById = new Map<string, Set<string>>();
  for (let index = 0; index < parsed.manifests.length; index += 1) {
    const pack = parseExperiencePackManifest(parsed.manifests[index]);
    if (!pack.ok) {
      return snapshotFailure(
        "INVALID_MANIFEST",
        `$.manifests[${index}]`,
        "registry manifest is not a valid canonical Experience Pack manifest",
      );
    }

    let versions = versionsById.get(pack.value.id);
    if (!versions) {
      versions = new Set<string>();
      versionsById.set(pack.value.id, versions);
    }
    if (versions.has(pack.value.version)) {
      return snapshotFailure(
        "DUPLICATE_MANIFEST",
        `$.manifests[${index}]`,
        "registry snapshot contains a duplicate pack id and version",
      );
    }
    versions.add(pack.value.version);
    canonical.push(pack.value);
  }

  canonical.sort(compareManifest);
  const snapshot: ExperienceRegistrySnapshot = Object.freeze({
    schemaVersion: EXPERIENCE_REGISTRY_SCHEMA_VERSION,
    manifests: Object.freeze(canonical),
  });
  CANONICAL_SNAPSHOTS.add(snapshot);
  return { ok: true, value: snapshot };
}

export function isCanonicalExperienceRegistrySnapshot(
  input: unknown,
): input is ExperienceRegistrySnapshot {
  return input !== null
    && typeof input === "object"
    && CANONICAL_SNAPSHOTS.has(input as object);
}

function boundedQueryString(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= EXPERIENCE_REGISTRY_QUERY_MAX_LENGTH
    && value === value.trim();
}

export function lookupExperienceRegistryManifest(
  snapshotInput: unknown,
  idInput: unknown,
  versionInput: unknown,
): ExperienceRegistryLookupResult {
  if (!isCanonicalExperienceRegistrySnapshot(snapshotInput)) {
    return {
      ok: false,
      issue: {
        code: "INVALID_SNAPSHOT",
        path: "$.snapshot",
        message: "experience registry snapshot must be a canonical parsed snapshot",
      },
    };
  }
  if (!boundedQueryString(idInput) || !boundedQueryString(versionInput)) {
    return {
      ok: false,
      issue: {
        code: "INVALID_QUERY",
        path: "$.query",
        message: "registry lookup id and version must be bounded non-empty strings",
      },
    };
  }

  const manifest = snapshotInput.manifests.find(
    (candidate) => candidate.id === idInput && candidate.version === versionInput,
  ) ?? null;
  return { ok: true, value: Object.freeze({ manifest }) };
}
