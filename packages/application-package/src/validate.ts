import {
  isSemanticNamespace,
  isSemanticSegment,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_APPLICATION_PACKAGE_MAX_ACTIONS,
  VIRA_APPLICATION_PACKAGE_MAX_DESCRIPTION_LENGTH,
  VIRA_APPLICATION_PACKAGE_MAX_EXPERIENCES,
  VIRA_APPLICATION_PACKAGE_MAX_NAME_LENGTH,
  VIRA_APPLICATION_PACKAGE_MAX_PUBLISHER_NAME_LENGTH,
  VIRA_APPLICATION_PACKAGE_MAX_REFERENCES,
  VIRA_APPLICATION_PACKAGE_MAX_TAGS,
  VIRA_APPLICATION_PACKAGE_SCHEMA_VERSION,
  VIRA_APPLICATION_VISIBILITIES,
  type ViraApplicationActionReference,
  type ViraApplicationCommercialMetadata,
  type ViraApplicationDistributionMetadata,
  type ViraApplicationExactReference,
  type ViraApplicationExperienceReference,
  type ViraApplicationHostCompatibility,
  type ViraApplicationPackage,
  type ViraApplicationPackageResult,
  type ViraApplicationPackageSerializationResult,
  type ViraApplicationPackageValidationCode,
  type ViraApplicationPackageValidationIssue,
  type ViraApplicationPublisher,
} from "./types.js";

const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const VERSION_REF = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const PACK_ID = /^[a-z0-9](?:[a-z0-9._-]{0,62})\/[a-z0-9](?:[a-z0-9._-]{0,62})$/;
const ENTRYPOINT = /^[a-z][a-z0-9._-]{0,127}$/;
const TAG = /^[a-z0-9](?:[a-z0-9._-]{0,63})$/;
const FLOATING_ALIASES = new Set(["latest", "current", "stable", "head", "main", "next"]);

type Failure = {
  readonly ok: false;
  readonly issue: ViraApplicationPackageValidationIssue;
};

type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function fail(
  code: ViraApplicationPackageValidationCode,
  path: string,
  message: string,
): Failure {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function shape(value: JsonObject, allowed: readonly string[], required = allowed): string | undefined {
  const allow = new Set(allowed);
  return Object.keys(value).sort().find((key) => !allow.has(key))
    ?? required.find((key) => !Object.hasOwn(value, key));
}

function boundedText(value: JsonValue | undefined, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value;
}

function releaseVersion(value: JsonValue | undefined): value is string {
  return typeof value === "string" && value.length <= 64 && RELEASE_VERSION.test(value);
}

function exactVersionRef(value: JsonValue | undefined): value is string {
  if (typeof value !== "string" || !VERSION_REF.test(value)) return false;
  const normalized = value.toLowerCase();
  if (FLOATING_ALIASES.has(normalized)) return false;
  return !/(?:^|[._:+-])[xX](?:$|[._:+-])/.test(value)
    && !/\d[xX](?:$|[._:+-])/.test(value);
}

function compareRelease(left: string, right: string): number {
  const a = left.split(".").map((part) => BigInt(part));
  const b = right.split(".").map((part) => BigInt(part));
  for (let index = 0; index < 3; index += 1) {
    const av = a[index] ?? 0n;
    const bv = b[index] ?? 0n;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function freeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freeze(item);
    return Object.freeze(value) as T;
  }
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return Object.freeze(value);
}

function parsePublisher(value: JsonValue | undefined): Parsed<ViraApplicationPublisher> {
  if (!object(value)) return fail("INVALID_PUBLISHER", "$.publisher", "publisher must be an exact object");
  const unexpected = shape(value, ["id", "name"]);
  if (unexpected) return fail("INVALID_PUBLISHER", `$.publisher.${unexpected}`, "publisher shape is invalid");
  if (typeof value.id !== "string" || !isSemanticSegment(value.id)) {
    return fail("INVALID_PUBLISHER", "$.publisher.id", "publisher id must be a canonical semantic segment");
  }
  if (!boundedText(value.name, VIRA_APPLICATION_PACKAGE_MAX_PUBLISHER_NAME_LENGTH)) {
    return fail("INVALID_PUBLISHER", "$.publisher.name", "publisher name is invalid");
  }
  return { ok: true, value: Object.freeze({ id: value.id, name: value.name }) };
}

function parseExactReference(value: JsonValue, path: string): Parsed<ViraApplicationExactReference> {
  if (!object(value)) return fail("INVALID_REFERENCE", path, "reference must be an exact object");
  const unexpected = shape(value, ["id", "versionRef"]);
  if (unexpected) return fail("INVALID_REFERENCE", `${path}.${unexpected}`, "reference shape is invalid");
  if (typeof value.id !== "string" || !isSemanticNamespace(value.id)) {
    return fail("INVALID_REFERENCE", `${path}.id`, "reference id must be a canonical semantic namespace");
  }
  if (!exactVersionRef(value.versionRef)) {
    const code = typeof value.versionRef === "string" && VERSION_REF.test(value.versionRef)
      ? "FLOATING_REFERENCE"
      : "INVALID_REFERENCE";
    return fail(code, `${path}.versionRef`, "reference version must be exact and must not use a floating alias or range");
  }
  return { ok: true, value: Object.freeze({ id: value.id, versionRef: value.versionRef }) };
}

function parseReferenceArray(
  value: JsonValue | undefined,
  path: string,
): Parsed<readonly ViraApplicationExactReference[]> {
  if (!Array.isArray(value)) return fail("INVALID_REFERENCE", path, "references must be an array");
  if (value.length > VIRA_APPLICATION_PACKAGE_MAX_REFERENCES) {
    return fail("REFERENCE_LIMIT_EXCEEDED", path, `reference limit is ${VIRA_APPLICATION_PACKAGE_MAX_REFERENCES}`);
  }
  const output: ViraApplicationExactReference[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const parsed = parseExactReference(value[index] as JsonValue, `${path}[${index}]`);
    if (!parsed.ok) return parsed;
    const key = `${parsed.value.id}\u0000${parsed.value.versionRef}`;
    if (seen.has(key)) return fail("DUPLICATE_REFERENCE", `${path}[${index}]`, "duplicate exact reference");
    seen.add(key);
    output.push(parsed.value);
  }
  return { ok: true, value: Object.freeze(output) };
}

function parseExperiences(value: JsonValue | undefined): Parsed<readonly ViraApplicationExperienceReference[]> {
  if (!Array.isArray(value)) return fail("INVALID_EXPERIENCE", "$.experiences", "experiences must be an array");
  if (value.length > VIRA_APPLICATION_PACKAGE_MAX_EXPERIENCES) {
    return fail(
      "EXPERIENCE_LIMIT_EXCEEDED",
      "$.experiences",
      `experience reference limit is ${VIRA_APPLICATION_PACKAGE_MAX_EXPERIENCES}`,
    );
  }
  const output: ViraApplicationExperienceReference[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const path = `$.experiences[${index}]`;
    const item = value[index] as JsonValue;
    if (!object(item)) return fail("INVALID_EXPERIENCE", path, "experience reference must be an exact object");
    const unexpected = shape(item, ["id", "packId", "packVersion", "entrypoint"]);
    if (unexpected) return fail("INVALID_EXPERIENCE", `${path}.${unexpected}`, "experience reference shape is invalid");
    if (typeof item.id !== "string" || !isSemanticNamespace(item.id)) {
      return fail("INVALID_EXPERIENCE", `${path}.id`, "experience id must be a canonical semantic namespace");
    }
    if (typeof item.packId !== "string" || !PACK_ID.test(item.packId)) {
      return fail("INVALID_EXPERIENCE", `${path}.packId`, "packId must be an exact canonical Experience Pack id");
    }
    if (!releaseVersion(item.packVersion)) {
      return fail("INVALID_EXPERIENCE", `${path}.packVersion`, "packVersion must be an exact release semver");
    }
    if (typeof item.entrypoint !== "string" || !ENTRYPOINT.test(item.entrypoint)) {
      return fail("INVALID_EXPERIENCE", `${path}.entrypoint`, "entrypoint must be an exact Pack entrypoint identity");
    }
    const key = `${item.id}\u0000${item.packId}\u0000${item.packVersion}\u0000${item.entrypoint}`;
    if (seen.has(key)) return fail("DUPLICATE_EXPERIENCE", path, "duplicate exact experience reference");
    seen.add(key);
    output.push(Object.freeze({
      id: item.id,
      packId: item.packId,
      packVersion: item.packVersion,
      entrypoint: item.entrypoint,
    }));
  }
  return { ok: true, value: Object.freeze(output) };
}

function parseActions(value: JsonValue | undefined): Parsed<readonly ViraApplicationActionReference[]> {
  if (!Array.isArray(value)) return fail("INVALID_ACTION", "$.actions", "actions must be an array");
  if (value.length > VIRA_APPLICATION_PACKAGE_MAX_ACTIONS) {
    return fail("ACTION_LIMIT_EXCEEDED", "$.actions", `action reference limit is ${VIRA_APPLICATION_PACKAGE_MAX_ACTIONS}`);
  }
  const output: ViraApplicationActionReference[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const path = `$.actions[${index}]`;
    const item = value[index] as JsonValue;
    if (!object(item)) return fail("INVALID_ACTION", path, "action reference must be an exact object");
    const unexpected = shape(item, ["actionType"]);
    if (unexpected) return fail("INVALID_ACTION", `${path}.${unexpected}`, "action reference shape is invalid");
    if (typeof item.actionType !== "string" || !isSemanticNamespace(item.actionType)) {
      return fail("INVALID_ACTION", `${path}.actionType`, "actionType must be a canonical semantic namespace");
    }
    if (seen.has(item.actionType)) return fail("DUPLICATE_ACTION", path, "duplicate action identity");
    seen.add(item.actionType);
    output.push(Object.freeze({ actionType: item.actionType }));
  }
  return { ok: true, value: Object.freeze(output) };
}

function parseCompatibility(value: JsonValue | undefined): Parsed<ViraApplicationHostCompatibility> {
  if (!object(value)) {
    return fail("INVALID_HOST_COMPATIBILITY", "$.hostCompatibility", "hostCompatibility must be an exact object");
  }
  const unexpected = shape(
    value,
    ["minViraVersion", "maxViraVersion", "requiredCapabilities"],
    ["minViraVersion", "requiredCapabilities"],
  );
  if (unexpected) {
    return fail("INVALID_HOST_COMPATIBILITY", `$.hostCompatibility.${unexpected}`, "hostCompatibility shape is invalid");
  }
  if (!releaseVersion(value.minViraVersion)) {
    return fail("INVALID_HOST_COMPATIBILITY", "$.hostCompatibility.minViraVersion", "minViraVersion must be release semver");
  }
  const max = value.maxViraVersion;
  if (max !== undefined && !releaseVersion(max)) {
    return fail("INVALID_HOST_COMPATIBILITY", "$.hostCompatibility.maxViraVersion", "maxViraVersion must be release semver");
  }
  if (max !== undefined && compareRelease(max, value.minViraVersion) < 0) {
    return fail(
      "INVALID_HOST_COMPATIBILITY",
      "$.hostCompatibility.maxViraVersion",
      "maxViraVersion must not precede minViraVersion",
    );
  }
  if (!Array.isArray(value.requiredCapabilities) || value.requiredCapabilities.length > VIRA_APPLICATION_PACKAGE_MAX_REFERENCES) {
    return fail(
      "INVALID_HOST_COMPATIBILITY",
      "$.hostCompatibility.requiredCapabilities",
      "requiredCapabilities must be a bounded array",
    );
  }
  const requiredCapabilities: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.requiredCapabilities.length; index += 1) {
    const capability = value.requiredCapabilities[index];
    if (typeof capability !== "string" || !isSemanticNamespace(capability)) {
      return fail(
        "INVALID_HOST_COMPATIBILITY",
        `$.hostCompatibility.requiredCapabilities[${index}]`,
        "required host capability id is invalid",
      );
    }
    if (seen.has(capability)) {
      return fail("DUPLICATE_REFERENCE", `$.hostCompatibility.requiredCapabilities[${index}]`, "duplicate required host capability");
    }
    seen.add(capability);
    requiredCapabilities.push(capability);
  }
  return {
    ok: true,
    value: Object.freeze({
      minViraVersion: value.minViraVersion,
      ...(max === undefined ? {} : { maxViraVersion: max }),
      requiredCapabilities: Object.freeze(requiredCapabilities),
    }),
  };
}

function parseDistribution(value: JsonValue | undefined): Parsed<ViraApplicationDistributionMetadata> {
  if (!object(value)) return fail("INVALID_DISTRIBUTION", "$.distribution", "distribution must be an exact object");
  const unexpected = shape(
    value,
    ["name", "description", "tags", "visibility", "discoverable"],
    ["name", "tags", "visibility", "discoverable"],
  );
  if (unexpected) return fail("INVALID_DISTRIBUTION", `$.distribution.${unexpected}`, "distribution shape is invalid");
  if (!boundedText(value.name, VIRA_APPLICATION_PACKAGE_MAX_NAME_LENGTH)) {
    return fail("INVALID_DISTRIBUTION", "$.distribution.name", "distribution name is invalid");
  }
  const description = value.description;
  if (
    description !== undefined
    && (typeof description !== "string"
      || description.length > VIRA_APPLICATION_PACKAGE_MAX_DESCRIPTION_LENGTH
      || description.trim() !== description)
  ) {
    return fail("INVALID_DISTRIBUTION", "$.distribution.description", "distribution description is invalid");
  }
  if (!Array.isArray(value.tags) || value.tags.length > VIRA_APPLICATION_PACKAGE_MAX_TAGS) {
    return fail("INVALID_DISTRIBUTION", "$.distribution.tags", "distribution tags must be a bounded array");
  }
  const tags: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.tags.length; index += 1) {
    const tag = value.tags[index];
    if (typeof tag !== "string" || !TAG.test(tag) || seen.has(tag)) {
      return fail("INVALID_DISTRIBUTION", `$.distribution.tags[${index}]`, "distribution tags must be unique canonical tags");
    }
    seen.add(tag);
    tags.push(tag);
  }
  if (
    typeof value.visibility !== "string"
    || !VIRA_APPLICATION_VISIBILITIES.includes(value.visibility as ViraApplicationDistributionMetadata["visibility"])
  ) {
    return fail("INVALID_DISTRIBUTION", "$.distribution.visibility", "distribution visibility is invalid");
  }
  if (typeof value.discoverable !== "boolean") {
    return fail("INVALID_DISTRIBUTION", "$.distribution.discoverable", "discoverable must be boolean");
  }
  return {
    ok: true,
    value: Object.freeze({
      name: value.name,
      ...(description === undefined ? {} : { description }),
      tags: Object.freeze(tags),
      visibility: value.visibility as ViraApplicationDistributionMetadata["visibility"],
      discoverable: value.discoverable,
    }),
  };
}

function parseCommercial(value: JsonValue | undefined): Parsed<ViraApplicationCommercialMetadata> {
  if (!object(value)) return fail("INVALID_COMMERCIAL", "$.commercial", "commercial must be an exact metadata object");
  const unexpected = shape(value, ["entitlementRefs", "meteringRefs"]);
  if (unexpected) return fail("INVALID_COMMERCIAL", `$.commercial.${unexpected}`, "commercial shape is invalid");
  const entitlements = parseReferenceArray(value.entitlementRefs, "$.commercial.entitlementRefs");
  if (!entitlements.ok) return entitlements;
  const metering = parseReferenceArray(value.meteringRefs, "$.commercial.meteringRefs");
  if (!metering.ok) return metering;
  return {
    ok: true,
    value: Object.freeze({
      entitlementRefs: entitlements.value,
      meteringRefs: metering.value,
    }),
  };
}

export function parseViraApplicationPackage(input: unknown): ViraApplicationPackageResult {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !object(parsed.value)) {
    return fail(
      "INVALID_TYPE",
      parsed.ok ? "$" : parsed.issue.path,
      parsed.ok ? "application package must be a plain object" : parsed.issue.reason,
    );
  }

  const root = parsed.value;
  const fields = [
    "schemaVersion",
    "identity",
    "version",
    "publisher",
    "experiences",
    "capabilities",
    "contextTypes",
    "actions",
    "flows",
    "brandRef",
    "governanceRequirements",
    "hostCompatibility",
    "protocolProjections",
    "distribution",
    "commercial",
  ] as const;
  const unexpected = shape(root, fields);
  if (unexpected) {
    return fail("UNKNOWN_FIELD", `$.${unexpected}`, `unknown or missing application package field: ${unexpected}`);
  }
  if (root.schemaVersion !== VIRA_APPLICATION_PACKAGE_SCHEMA_VERSION) {
    return fail("INVALID_SCHEMA_VERSION", "$.schemaVersion", `schemaVersion must equal ${VIRA_APPLICATION_PACKAGE_SCHEMA_VERSION}`);
  }

  if (!object(root.identity)) return fail("INVALID_IDENTITY", "$.identity", "identity must be an exact object");
  const identityUnexpected = shape(root.identity, ["id"]);
  if (identityUnexpected) return fail("INVALID_IDENTITY", `$.identity.${identityUnexpected}`, "identity shape is invalid");
  if (typeof root.identity.id !== "string" || !isSemanticNamespace(root.identity.id) || !root.identity.id.includes(".")) {
    return fail("INVALID_IDENTITY", "$.identity.id", "application id must be a namespaced semantic identity");
  }
  if (!releaseVersion(root.version)) {
    return fail("INVALID_VERSION", "$.version", "application release version must be semver");
  }

  const publisher = parsePublisher(root.publisher);
  if (!publisher.ok) return publisher;
  if (root.identity.id.split(".")[0] !== publisher.value.id) {
    return fail("INVALID_PUBLISHER", "$.publisher.id", "publisher id must match the first Application identity namespace segment");
  }

  const experiences = parseExperiences(root.experiences);
  if (!experiences.ok) return experiences;
  const capabilities = parseReferenceArray(root.capabilities, "$.capabilities");
  if (!capabilities.ok) return capabilities;
  const contextTypes = parseReferenceArray(root.contextTypes, "$.contextTypes");
  if (!contextTypes.ok) return contextTypes;
  const actions = parseActions(root.actions);
  if (!actions.ok) return actions;
  const flows = parseReferenceArray(root.flows, "$.flows");
  if (!flows.ok) return flows;

  let brandRef: ViraApplicationExactReference | null;
  if (root.brandRef === null) {
    brandRef = null;
  } else {
    const brand = parseExactReference(root.brandRef as JsonValue, "$.brandRef");
    if (!brand.ok) return brand;
    brandRef = brand.value;
  }

  const governanceRequirements = parseReferenceArray(root.governanceRequirements, "$.governanceRequirements");
  if (!governanceRequirements.ok) return governanceRequirements;
  const hostCompatibility = parseCompatibility(root.hostCompatibility);
  if (!hostCompatibility.ok) return hostCompatibility;
  const protocolProjections = parseReferenceArray(root.protocolProjections, "$.protocolProjections");
  if (!protocolProjections.ok) return protocolProjections;
  const distribution = parseDistribution(root.distribution);
  if (!distribution.ok) return distribution;
  const commercial = parseCommercial(root.commercial);
  if (!commercial.ok) return commercial;

  if (experiences.value.length + capabilities.value.length + actions.value.length + flows.value.length === 0) {
    return fail("EMPTY_APPLICATION", "$", "application must reference at least one Experience, Capability, Action or Flow");
  }

  const value: ViraApplicationPackage = {
    schemaVersion: VIRA_APPLICATION_PACKAGE_SCHEMA_VERSION,
    identity: Object.freeze({ id: root.identity.id }),
    version: root.version,
    publisher: publisher.value,
    experiences: experiences.value,
    capabilities: capabilities.value,
    contextTypes: contextTypes.value,
    actions: actions.value,
    flows: flows.value,
    brandRef,
    governanceRequirements: governanceRequirements.value,
    hostCompatibility: hostCompatibility.value,
    protocolProjections: protocolProjections.value,
    distribution: distribution.value,
    commercial: commercial.value,
  };
  return { ok: true, value: freeze(value) };
}

export function serializeViraApplicationPackage(input: unknown): ViraApplicationPackageSerializationResult {
  const parsed = parseViraApplicationPackage(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), package: parsed.value };
}
