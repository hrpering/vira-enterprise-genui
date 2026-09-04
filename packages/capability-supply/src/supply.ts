import {
  parseViraCapabilityDefinition,
  serializeViraCapabilityDefinition,
  type ViraCapabilityDefinition,
} from "@vira-enterprise-genui/capability-contract";
import {
  parseViraHostedCapabilityBinding,
  serializeViraHostedCapabilityBinding,
  type ViraHostedCapabilityBinding,
} from "@vira-enterprise-genui/hosted-capability-runtime";
import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonArray,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_CAPABILITY_SUPPLY_MAX_SOURCES,
  VIRA_CAPABILITY_SUPPLY_MAX_SUPPLIES_PER_SOURCE,
  VIRA_CAPABILITY_SUPPLY_MAX_TOTAL_SUPPLIES,
  VIRA_CAPABILITY_SUPPLY_SCHEMA_VERSION,
  type ViraCapabilitySupplyIssue,
  type ViraCapabilitySupplyIssueCode,
  type ViraCapabilitySupplyLookupResult,
  type ViraCapabilitySupplyRecord,
  type ViraCapabilitySupplySerializationResult,
  type ViraCapabilitySupplySnapshotResult,
  type ViraCapabilitySupplySource,
  type ViraResolvedCapabilitySupply,
} from "./types.js";

const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ROOT_FIELDS = ["schemaVersion", "sources"] as const;
const SOURCE_FIELDS = ["sourceId", "supplies"] as const;
const SUPPLY_FIELDS = ["capability", "binding"] as const;
const QUERY_FIELDS = ["capabilityId", "capabilityVersion", "providerId", "locationId"] as const;

type Failure = { readonly ok: false; readonly issue: ViraCapabilitySupplyIssue };

function fail(code: ViraCapabilitySupplyIssueCode, path: string, message: string): Failure {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): JsonObject | null {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function jsonArray(value: JsonValue | undefined): value is JsonArray {
  return value !== undefined && Array.isArray(value);
}

function shape(value: JsonObject, allowed: readonly string[], required: readonly string[] = allowed): string | null {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) return key;
  for (const key of required) if (!Object.hasOwn(value, key)) return key;
  return null;
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function capabilityKey(capability: ViraCapabilityDefinition): string {
  return `${capability.id}\u0000${capability.version}`;
}

function bindingKey(binding: ViraHostedCapabilityBinding): string {
  return `${binding.bindingRef.id}\u0000${binding.bindingRef.versionRef}`;
}

function compareSupply(left: ViraCapabilitySupplyRecord, right: ViraCapabilitySupplyRecord): number {
  const capabilityId = compareText(left.capability.id, right.capability.id);
  if (capabilityId !== 0) return capabilityId;
  const capabilityVersion = compareText(left.capability.version, right.capability.version);
  if (capabilityVersion !== 0) return capabilityVersion;
  const provider = compareText(left.binding.providerId, right.binding.providerId);
  if (provider !== 0) return provider;
  const location = compareText(left.binding.locationId ?? "", right.binding.locationId ?? "");
  if (location !== 0) return location;
  const bindingId = compareText(left.binding.bindingRef.id, right.binding.bindingRef.id);
  if (bindingId !== 0) return bindingId;
  return compareText(left.binding.bindingRef.versionRef, right.binding.bindingRef.versionRef);
}

function compareResolved(left: ViraResolvedCapabilitySupply, right: ViraResolvedCapabilitySupply): number {
  return compareSupply(
    { capability: left.capability, binding: left.binding },
    { capability: right.capability, binding: right.binding },
  );
}

function canonicalCapability(capability: ViraCapabilityDefinition): string | null {
  const serialized = serializeViraCapabilityDefinition(capability);
  return serialized.ok ? serialized.value : null;
}

function canonicalBinding(binding: ViraHostedCapabilityBinding): string | null {
  const serialized = serializeViraHostedCapabilityBinding(binding);
  return serialized.ok ? serialized.value : null;
}

export function parseViraCapabilitySupplySnapshot(input: unknown): ViraCapabilitySupplySnapshotResult {
  const json = parseJsonValue(input);
  if (!json.ok) return fail("INVALID_INPUT", json.issue.path, json.issue.reason);
  const root = object(json.value);
  if (!root) return fail("INVALID_INPUT", "$", "capability supply snapshot must be an exact object");
  const rootShape = shape(root, ROOT_FIELDS);
  if (rootShape) return fail("UNKNOWN_FIELD", `$.${rootShape}`, "capability supply snapshot shape is invalid");
  if (root.schemaVersion !== VIRA_CAPABILITY_SUPPLY_SCHEMA_VERSION) {
    return fail("INVALID_SCHEMA_VERSION", "$.schemaVersion", `schemaVersion must be ${VIRA_CAPABILITY_SUPPLY_SCHEMA_VERSION}`);
  }
  if (!jsonArray(root.sources)) return fail("INVALID_SOURCE", "$.sources", "sources must be an array");
  if (root.sources.length > VIRA_CAPABILITY_SUPPLY_MAX_SOURCES) {
    return fail("SOURCE_LIMIT_EXCEEDED", "$.sources", `source count exceeds ${VIRA_CAPABILITY_SUPPLY_MAX_SOURCES}`);
  }

  const sourceIds = new Set<string>();
  const globalCapabilities = new Map<string, string>();
  const globalBindings = new Map<string, string>();
  const sources: ViraCapabilitySupplySource[] = [];
  let totalSupplies = 0;

  for (let sourceIndex = 0; sourceIndex < root.sources.length; sourceIndex += 1) {
    const sourcePath = `$.sources[${sourceIndex}]`;
    const sourceObject = object(root.sources[sourceIndex]);
    if (!sourceObject) return fail("INVALID_SOURCE", sourcePath, "source must be an exact object");
    const sourceShape = shape(sourceObject, SOURCE_FIELDS);
    if (sourceShape) return fail("UNKNOWN_FIELD", `${sourcePath}.${sourceShape}`, "capability supply source shape is invalid");
    if (typeof sourceObject.sourceId !== "string" || !isSemanticNamespace(sourceObject.sourceId)) {
      return fail("INVALID_SOURCE", `${sourcePath}.sourceId`, "sourceId must be a canonical semantic namespace");
    }
    const sourceId = sourceObject.sourceId;
    if (sourceIds.has(sourceId)) return fail("DUPLICATE_SOURCE", `${sourcePath}.sourceId`, "duplicate capability supply sourceId");
    sourceIds.add(sourceId);

    if (!jsonArray(sourceObject.supplies)) return fail("INVALID_SOURCE", `${sourcePath}.supplies`, "supplies must be an array");
    if (sourceObject.supplies.length > VIRA_CAPABILITY_SUPPLY_MAX_SUPPLIES_PER_SOURCE) {
      return fail(
        "SUPPLY_LIMIT_EXCEEDED",
        `${sourcePath}.supplies`,
        `supplies-per-source count exceeds ${VIRA_CAPABILITY_SUPPLY_MAX_SUPPLIES_PER_SOURCE}`,
      );
    }
    totalSupplies += sourceObject.supplies.length;
    if (totalSupplies > VIRA_CAPABILITY_SUPPLY_MAX_TOTAL_SUPPLIES) {
      return fail(
        "SUPPLY_LIMIT_EXCEEDED",
        "$.sources",
        `total capability supply count exceeds ${VIRA_CAPABILITY_SUPPLY_MAX_TOTAL_SUPPLIES}`,
      );
    }

    const localBindings = new Set<string>();
    const supplies: ViraCapabilitySupplyRecord[] = [];
    for (let supplyIndex = 0; supplyIndex < sourceObject.supplies.length; supplyIndex += 1) {
      const supplyPath = `${sourcePath}.supplies[${supplyIndex}]`;
      const supplyObject = object(sourceObject.supplies[supplyIndex]);
      if (!supplyObject) return fail("INVALID_SUPPLY", supplyPath, "supply must be an exact object");
      const supplyShape = shape(supplyObject, SUPPLY_FIELDS);
      if (supplyShape) return fail("UNKNOWN_FIELD", `${supplyPath}.${supplyShape}`, "capability supply record shape is invalid");

      const capability = parseViraCapabilityDefinition(supplyObject.capability);
      if (!capability.ok) {
        return fail("INVALID_CAPABILITY", `${supplyPath}.capability`, `invalid CapabilityDefinition: ${capability.issue.code}`);
      }
      if (capability.value.invocation.kind !== "query") {
        return fail(
          "ACTION_BOUNDARY_REQUIRED",
          `${supplyPath}.capability.invocation`,
          "hosted capability supply may contain only query Capabilities",
        );
      }

      const binding = parseViraHostedCapabilityBinding(supplyObject.binding);
      if (!binding.ok) {
        return fail("INVALID_BINDING", `${supplyPath}.binding`, `invalid hosted Capability binding: ${binding.issue.code}`);
      }
      if (
        binding.value.capabilityRef.id !== capability.value.id
        || binding.value.capabilityRef.versionRef !== capability.value.version
      ) {
        return fail(
          "CAPABILITY_MISMATCH",
          `${supplyPath}.binding.capabilityRef`,
          "binding capabilityRef must exactly match the enclosed Capability definition",
        );
      }

      const exactBindingKey = bindingKey(binding.value);
      if (localBindings.has(exactBindingKey)) {
        return fail("DUPLICATE_SUPPLY", `${supplyPath}.binding.bindingRef`, "duplicate exact bindingRef within source");
      }
      localBindings.add(exactBindingKey);

      const exactCapabilityKey = capabilityKey(capability.value);
      const capabilitySerialized = canonicalCapability(capability.value);
      if (capabilitySerialized === null) {
        return fail("INVALID_CAPABILITY", `${supplyPath}.capability`, "CapabilityDefinition serialization failed");
      }
      const existingCapability = globalCapabilities.get(exactCapabilityKey);
      if (existingCapability !== undefined && existingCapability !== capabilitySerialized) {
        return fail(
          "CAPABILITY_CONFLICT",
          `${supplyPath}.capability`,
          "sources disagree on the same exact Capability id and version",
        );
      }
      globalCapabilities.set(exactCapabilityKey, capabilitySerialized);

      const bindingSerialized = canonicalBinding(binding.value);
      if (bindingSerialized === null) {
        return fail("INVALID_BINDING", `${supplyPath}.binding`, "hosted Capability binding serialization failed");
      }
      const existingBinding = globalBindings.get(exactBindingKey);
      if (existingBinding !== undefined && existingBinding !== bindingSerialized) {
        return fail(
          "BINDING_CONFLICT",
          `${supplyPath}.binding`,
          "sources disagree on the same exact bindingRef",
        );
      }
      globalBindings.set(exactBindingKey, bindingSerialized);

      supplies.push(Object.freeze({ capability: capability.value, binding: binding.value }));
    }

    supplies.sort(compareSupply);
    sources.push(Object.freeze({ sourceId, supplies: Object.freeze(supplies) }));
  }

  sources.sort((left, right) => compareText(left.sourceId, right.sourceId));
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: VIRA_CAPABILITY_SUPPLY_SCHEMA_VERSION,
      sources: Object.freeze(sources),
    }),
  };
}

export function serializeViraCapabilitySupplySnapshot(input: unknown): ViraCapabilitySupplySerializationResult {
  const parsed = parseViraCapabilitySupplySnapshot(input);
  if (!parsed.ok) return parsed;

  const sourceStrings: string[] = [];
  for (const source of parsed.value.sources) {
    const supplyStrings: string[] = [];
    for (const supply of source.supplies) {
      const capability = serializeViraCapabilityDefinition(supply.capability);
      if (!capability.ok) return fail("INVALID_CAPABILITY", "$.sources", "CapabilityDefinition serialization failed");
      const binding = serializeViraHostedCapabilityBinding(supply.binding);
      if (!binding.ok) return fail("INVALID_BINDING", "$.sources", "hosted Capability binding serialization failed");
      supplyStrings.push(`{"capability":${capability.value},"binding":${binding.value}}`);
    }
    sourceStrings.push(`{"sourceId":${JSON.stringify(source.sourceId)},"supplies":[${supplyStrings.join(",")}]}`);
  }

  return {
    ok: true,
    value: `{"schemaVersion":"${VIRA_CAPABILITY_SUPPLY_SCHEMA_VERSION}","sources":[${sourceStrings.join(",")}]}`,
    snapshot: parsed.value,
  };
}

export function lookupViraCapabilitySupply(
  snapshotInput: unknown,
  queryInput: unknown,
): ViraCapabilitySupplyLookupResult {
  const snapshot = parseViraCapabilitySupplySnapshot(snapshotInput);
  if (!snapshot.ok) return snapshot;

  const queryJson = parseJsonValue(queryInput, "$query");
  if (!queryJson.ok) return fail("INVALID_QUERY", queryJson.issue.path, queryJson.issue.reason);
  const query = object(queryJson.value);
  if (!query) return fail("INVALID_QUERY", "$query", "query must be an exact object");
  const queryShape = shape(query, QUERY_FIELDS);
  if (queryShape) return fail("INVALID_QUERY", `$query.${queryShape}`, "capability supply query shape is invalid");
  if (
    typeof query.capabilityId !== "string"
    || !isSemanticNamespace(query.capabilityId)
    || !query.capabilityId.includes(".")
  ) {
    return fail("INVALID_QUERY", "$query.capabilityId", "capabilityId must be a namespaced semantic identity");
  }
  if (
    typeof query.capabilityVersion !== "string"
    || query.capabilityVersion.length > 64
    || !RELEASE_VERSION.test(query.capabilityVersion)
  ) {
    return fail("INVALID_QUERY", "$query.capabilityVersion", "capabilityVersion must be an exact release semver");
  }
  if (query.providerId !== null && (typeof query.providerId !== "string" || !isSemanticNamespace(query.providerId))) {
    return fail("INVALID_QUERY", "$query.providerId", "providerId must be null or a canonical semantic namespace");
  }
  if (query.locationId !== null && (typeof query.locationId !== "string" || !isSemanticNamespace(query.locationId))) {
    return fail("INVALID_QUERY", "$query.locationId", "locationId must be null or a canonical semantic namespace");
  }

  const capabilityId = query.capabilityId;
  const capabilityVersion = query.capabilityVersion;
  const providerId = query.providerId as string | null;
  const locationId = query.locationId as string | null;
  const grouped = new Map<string, {
    readonly capability: ViraCapabilityDefinition;
    readonly binding: ViraHostedCapabilityBinding;
    readonly sourceIds: string[];
  }>();

  for (const source of snapshot.value.sources) {
    for (const supply of source.supplies) {
      if (supply.capability.id !== capabilityId || supply.capability.version !== capabilityVersion) continue;
      if (providerId !== null && supply.binding.providerId !== providerId) continue;
      if (locationId !== null && supply.binding.locationId !== locationId) continue;
      const key = bindingKey(supply.binding);
      const existing = grouped.get(key);
      if (existing) {
        existing.sourceIds.push(source.sourceId);
      } else {
        grouped.set(key, {
          capability: supply.capability,
          binding: supply.binding,
          sourceIds: [source.sourceId],
        });
      }
    }
  }

  const supplies: ViraResolvedCapabilitySupply[] = Array.from(grouped.values(), (entry) => Object.freeze({
    capability: entry.capability,
    binding: entry.binding,
    sourceIds: Object.freeze(entry.sourceIds),
  }));
  supplies.sort(compareResolved);

  return {
    ok: true,
    value: Object.freeze({
      capabilityId,
      capabilityVersion,
      providerId,
      locationId,
      supplies: Object.freeze(supplies),
    }),
  };
}
