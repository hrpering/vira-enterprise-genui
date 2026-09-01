import { parseExperiencePackManifest } from "@vira-enterprise-genui/experience-packs";
import type { ExperiencePackManifest } from "@vira-enterprise-genui/experience-packs";
import { preflightPlainData } from "./safety.js";
import type {
  ExperienceRegistryLookupResult,
  ExperienceRegistrySnapshotResult,
  ExperienceRegistryValidationCode,
} from "./types.js";
import {
  EXPERIENCE_REGISTRY_MAX_MANIFESTS,
  EXPERIENCE_REGISTRY_QUERY_ID_MAX_LENGTH,
  EXPERIENCE_REGISTRY_QUERY_VERSION_MAX_LENGTH,
  EXPERIENCE_REGISTRY_SCHEMA_VERSION,
} from "./types.js";

const SNAPSHOT_FIELDS = new Set(["schemaVersion", "manifests"]);
const QUERY_FIELDS = new Set(["id", "version"]);

function snapshotFailure(
  code: ExperienceRegistryValidationCode,
  path: string,
  message: string,
): ExperienceRegistrySnapshotResult {
  return { ok: false, issue: { code, path, message } };
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownData(object: object, key: PropertyKey): PropertyDescriptor | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && "value" in descriptor ? descriptor : undefined;
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareManifest(left: ExperiencePackManifest, right: ExperiencePackManifest): number {
  const idOrder = compareText(left.id, right.id);
  return idOrder === 0 ? compareText(left.version, right.version) : idOrder;
}

export function createExperienceRegistrySnapshot(input: unknown): ExperienceRegistrySnapshotResult {
  try {
    if (!plainObject(input)) {
      return snapshotFailure("INVALID_INPUT", "$", "experience registry snapshot must be a plain object");
    }
    if (Object.getOwnPropertySymbols(input).length > 0) {
      return snapshotFailure("INVALID_INPUT", "$", "experience registry snapshot must not contain symbol properties");
    }

    const names = Object.getOwnPropertyNames(input).sort();
    if (names.some((name) => !SNAPSHOT_FIELDS.has(name))) {
      return snapshotFailure("UNKNOWN_FIELD", "$", "experience registry snapshot contains an unsupported field");
    }
    for (const name of names) {
      if (!ownData(input, name)) {
        return snapshotFailure("INVALID_INPUT", `$.${name}`, "experience registry fields must be own data properties");
      }
    }

    const schemaVersion = ownData(input, "schemaVersion")?.value;
    if (schemaVersion !== EXPERIENCE_REGISTRY_SCHEMA_VERSION) {
      return snapshotFailure(
        "INVALID_SCHEMA_VERSION",
        "$.schemaVersion",
        `experience registry schemaVersion must equal ${EXPERIENCE_REGISTRY_SCHEMA_VERSION}`,
      );
    }

    const manifests = ownData(input, "manifests")?.value;
    if (!Array.isArray(manifests)) {
      return snapshotFailure("INVALID_MANIFESTS", "$.manifests", "manifests must be a dense array");
    }
    if (manifests.length > EXPERIENCE_REGISTRY_MAX_MANIFESTS) {
      return snapshotFailure(
        "MANIFEST_LIMIT_EXCEEDED",
        "$.manifests",
        `experience registry may contain at most ${EXPERIENCE_REGISTRY_MAX_MANIFESTS} manifests`,
      );
    }

    const budget = { nodes: 0 };
    if (!preflightPlainData(manifests, budget)) {
      return snapshotFailure(
        "UNSAFE_MANIFEST",
        "$.manifests",
        "registry manifests must be bounded plain data without accessors, symbols, or custom array state",
      );
    }

    const canonical: ExperiencePackManifest[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < manifests.length; index += 1) {
      const parsed = parseExperiencePackManifest(manifests[index]);
      if (!parsed.ok) {
        return snapshotFailure(
          "INVALID_MANIFEST",
          `$.manifests[${index}]`,
          "registry manifest is not a valid canonical Experience Pack manifest",
        );
      }
      const key = `${parsed.value.id}\u0000${parsed.value.version}`;
      if (seen.has(key)) {
        return snapshotFailure(
          "DUPLICATE_MANIFEST",
          `$.manifests[${index}]`,
          "registry snapshot contains a duplicate pack id and version",
        );
      }
      seen.add(key);
      canonical.push(parsed.value);
    }

    canonical.sort(compareManifest);
    return {
      ok: true,
      value: Object.freeze({
        schemaVersion: EXPERIENCE_REGISTRY_SCHEMA_VERSION,
        manifests: Object.freeze(canonical),
      }),
    };
  } catch {
    return snapshotFailure("INVALID_INPUT", "$", "experience registry snapshot could not be inspected safely");
  }
}

function boundedQueryString(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && value === value.trim();
}

export function lookupExperienceRegistryManifest(
  snapshotInput: unknown,
  queryInput: unknown,
): ExperienceRegistryLookupResult {
  const snapshot = createExperienceRegistrySnapshot(snapshotInput);
  if (!snapshot.ok) {
    return {
      ok: false,
      issue: {
        code: "INVALID_SNAPSHOT",
        path: "$.snapshot",
        message: "experience registry snapshot is invalid",
      },
    };
  }

  try {
    if (!plainObject(queryInput) || Object.getOwnPropertySymbols(queryInput).length > 0) {
      return {
        ok: false,
        issue: { code: "INVALID_QUERY", path: "$.query", message: "registry lookup query is invalid" },
      };
    }
    const names = Object.getOwnPropertyNames(queryInput).sort();
    if (names.some((name) => !QUERY_FIELDS.has(name))) {
      return {
        ok: false,
        issue: { code: "INVALID_QUERY", path: "$.query", message: "registry lookup query is invalid" },
      };
    }
    for (const name of names) {
      if (!ownData(queryInput, name)) {
        return {
          ok: false,
          issue: { code: "INVALID_QUERY", path: "$.query", message: "registry lookup query is invalid" },
        };
      }
    }

    const id = ownData(queryInput, "id")?.value;
    const version = ownData(queryInput, "version")?.value;
    if (
      !boundedQueryString(id, EXPERIENCE_REGISTRY_QUERY_ID_MAX_LENGTH)
      || !boundedQueryString(version, EXPERIENCE_REGISTRY_QUERY_VERSION_MAX_LENGTH)
    ) {
      return {
        ok: false,
        issue: { code: "INVALID_QUERY", path: "$.query", message: "registry lookup query is invalid" },
      };
    }

    const manifest = snapshot.value.manifests.find(
      (candidate) => candidate.id === id && candidate.version === version,
    ) ?? null;
    return { ok: true, value: Object.freeze({ manifest }) };
  } catch {
    return {
      ok: false,
      issue: { code: "INVALID_QUERY", path: "$.query", message: "registry lookup query could not be inspected safely" },
    };
  }
}
