import { isSemanticNamespace, parseJsonValue, type JsonObject, type JsonValue } from "@vira-enterprise-genui/protocol";
import { isCanonicalExperienceRegistrySnapshot, lookupExperienceRegistryManifest, type ExperienceRegistrySnapshot } from "@vira-enterprise-genui/experience-registry";
import type { ViraEnterpriseScope } from "@vira-enterprise-genui/enterprise-context";
import {
  VIRA_PRIVATE_ENTERPRISE_REGISTRY_KINDS,
  VIRA_PRIVATE_ENTERPRISE_REGISTRY_MAX_ENTRIES,
  VIRA_PRIVATE_ENTERPRISE_REGISTRY_VERSION,
  type ViraPrivateEnterpriseRegistry,
  type ViraPrivateEnterpriseRegistryConfiguration,
  type ViraPrivateEnterpriseRegistryEntry,
  type ViraPrivateEnterpriseRegistryIssue,
  type ViraPrivateEnterpriseRegistryKind,
  type ViraPrivateEnterpriseRegistryResult,
} from "./types.js";

const VERSION_REF = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const PACK_ID_MAX_LENGTH = 255;

function issue(code: ViraPrivateEnterpriseRegistryIssue["code"], path: string, message: string): ViraPrivateEnterpriseRegistryIssue {
  return Object.freeze({ code, path, message });
}
function failure<T>(code: ViraPrivateEnterpriseRegistryIssue["code"], path: string, message: string): ViraPrivateEnterpriseRegistryResult<T> {
  return { ok: false, issue: issue(code, path, message) };
}
function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}
function validKind(value: unknown): value is ViraPrivateEnterpriseRegistryKind {
  return typeof value === "string" && VIRA_PRIVATE_ENTERPRISE_REGISTRY_KINDS.includes(value as ViraPrivateEnterpriseRegistryKind);
}
function validVersionRef(value: unknown): value is string { return typeof value === "string" && VERSION_REF.test(value); }
function validResourceId(kind: ViraPrivateEnterpriseRegistryKind, value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (kind === "pack") return value.length <= PACK_ID_MAX_LENGTH;
  return isSemanticNamespace(value);
}
function key(kind: string, id: string, versionRef: string): string { return `${kind}\u0000${id}\u0000${versionRef}`; }

function parseScopeResult(input: unknown): ViraEnterpriseScope | undefined {
  if (input === null || typeof input !== "object" || !("ok" in input) || (input as { ok?: unknown }).ok !== true || !("value" in input)) return undefined;
  const parsed = parseJsonValue((input as { value: unknown }).value, "$.scope");
  if (!parsed.ok || !object(parsed.value)) return undefined;
  const value = parsed.value;
  if (Object.keys(value).sort().join("\0") !== "environment\0organizationId\0projectId\0version") return undefined;
  if (value.version !== "1" || typeof value.organizationId !== "string" || typeof value.projectId !== "string" || typeof value.environment !== "string") return undefined;
  if (!(["dev", "staging", "production"] as const).includes(value.environment as "dev" | "staging" | "production")) return undefined;
  return Object.freeze({
    version: "1",
    organizationId: value.organizationId,
    projectId: value.projectId,
    environment: value.environment as ViraEnterpriseScope["environment"],
  });
}

function parseEntry(input: unknown): ViraPrivateEnterpriseRegistryEntry | undefined {
  const parsed = parseJsonValue(input, "$.entry");
  if (!parsed.ok || !object(parsed.value)) return undefined;
  const value = parsed.value;
  const allowed = new Set(["version", "kind", "id", "versionRef", "nativeCapabilityId"]);
  const keys = Object.keys(value);
  if (keys.some((field) => !allowed.has(field)) || !["version", "kind", "id", "versionRef"].every((field) => Object.hasOwn(value, field))) return undefined;
  if (value.version !== VIRA_PRIVATE_ENTERPRISE_REGISTRY_VERSION || !validKind(value.kind) || !validResourceId(value.kind, value.id) || !validVersionRef(value.versionRef)) return undefined;
  const nativeCapabilityId = Object.hasOwn(value, "nativeCapabilityId") ? value.nativeCapabilityId : undefined;
  if (nativeCapabilityId !== undefined && (value.kind !== "component" || typeof nativeCapabilityId !== "string" || !isSemanticNamespace(nativeCapabilityId))) return undefined;
  return Object.freeze({
    version: VIRA_PRIVATE_ENTERPRISE_REGISTRY_VERSION,
    kind: value.kind,
    id: value.id,
    versionRef: value.versionRef,
    ...(nativeCapabilityId === undefined ? {} : { nativeCapabilityId }),
  });
}

export function createViraPrivateEnterpriseRegistry(configuration: ViraPrivateEnterpriseRegistryConfiguration): ViraPrivateEnterpriseRegistryResult<ViraPrivateEnterpriseRegistry> {
  if (
    configuration === null || typeof configuration !== "object"
    || configuration.context === null || typeof configuration.context !== "object"
    || configuration.context.version !== "1"
    || typeof configuration.context.organizationId !== "string"
    || typeof configuration.context.projectId !== "string"
    || typeof configuration.context.scope !== "function"
  ) {
    return failure("INVALID_CONFIGURATION", "$", "enterprise registry requires an enterprise context authority");
  }
  if (!isCanonicalExperienceRegistrySnapshot(configuration.packRegistry)) {
    return failure("INVALID_CONFIGURATION", "$.packRegistry", "enterprise registry requires a canonical Experience Registry snapshot");
  }
  let rawScope: unknown;
  try { rawScope = configuration.context.scope(configuration.environment); } catch { return failure("INVALID_SCOPE", "$.environment", "enterprise registry scope resolution failed closed"); }
  const scope = parseScopeResult(rawScope);
  if (!scope || scope.environment !== configuration.environment || scope.organizationId !== configuration.context.organizationId || scope.projectId !== configuration.context.projectId) {
    return failure("INVALID_SCOPE", "$.environment", "enterprise registry requires an exact registered enterprise scope");
  }

  const approvedNativeCapabilities = new Set<string>();
  const rawCapabilities = configuration.approvedNativeCapabilities ?? [];
  if (!Array.isArray(rawCapabilities) || rawCapabilities.length > 512) return failure("INVALID_CONFIGURATION", "$.approvedNativeCapabilities", "native capability allowlist is invalid");
  for (const capability of rawCapabilities) {
    if (typeof capability !== "string" || !isSemanticNamespace(capability) || approvedNativeCapabilities.has(capability)) return failure("INVALID_CONFIGURATION", "$.approvedNativeCapabilities", "native capability allowlist contains invalid or duplicate entries");
    approvedNativeCapabilities.add(capability);
  }

  const entries = new Map<string, ViraPrivateEnterpriseRegistryEntry>();
  const packRegistry = configuration.packRegistry as ExperienceRegistrySnapshot;
  const registry: ViraPrivateEnterpriseRegistry = {
    version: VIRA_PRIVATE_ENTERPRISE_REGISTRY_VERSION,
    scope,
    approve(input) {
      const entry = parseEntry(input);
      if (!entry) return failure("INVALID_ENTRY", "$.entry", "enterprise registry entry must be exact canonical metadata; executable payloads are not accepted");
      if (entry.nativeCapabilityId !== undefined && !approvedNativeCapabilities.has(entry.nativeCapabilityId)) return failure("UNKNOWN_NATIVE_CAPABILITY", "$.entry.nativeCapabilityId", "native component capability is not approved for this registry");
      if (entry.kind === "pack") {
        const lookup = lookupExperienceRegistryManifest(packRegistry, entry.id, entry.versionRef);
        if (!lookup.ok || lookup.value.manifest === null) return failure("PACK_NOT_REGISTERED", "$.entry", "Pack approval requires an exact manifest already present in the canonical Experience Registry");
      }
      const identity = key(entry.kind, entry.id, entry.versionRef);
      if (entries.has(identity)) return failure("DUPLICATE_ENTRY", "$.entry", "enterprise registry already contains this exact resource identity");
      if (entries.size >= VIRA_PRIVATE_ENTERPRISE_REGISTRY_MAX_ENTRIES) return failure("ENTRY_LIMIT_EXCEEDED", "$.entry", "enterprise registry entry limit exceeded");
      entries.set(identity, entry);
      return { ok: true, value: entry };
    },
    lookup(kindInput, idInput, versionRefInput) {
      if (!validKind(kindInput) || !validResourceId(kindInput, idInput) || !validVersionRef(versionRefInput)) return failure("INVALID_QUERY", "$.query", "enterprise registry lookup requires a valid kind/id/versionRef");
      return { ok: true, value: entries.get(key(kindInput, idInput, versionRefInput)) ?? null };
    },
    list() { return Object.freeze([...entries.values()]); },
  };
  return { ok: true, value: Object.freeze(registry) };
}
