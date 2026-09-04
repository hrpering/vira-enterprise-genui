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
  type ViraApplicationPublisher,
} from "./types.js";

const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const VERSION_REF = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const PACK_ID = /^[a-z0-9](?:[a-z0-9._-]{0,62})\/[a-z0-9](?:[a-z0-9._-]{0,62})$/;
const ENTRYPOINT = /^[a-z][a-z0-9._-]{0,127}$/;
const TAG = /^[a-z0-9](?:[a-z0-9._-]{0,63})$/;
const FLOATING_ALIASES = new Set(["latest", "current", "stable", "head", "main", "next"]);

function failure<T>(
  code: ViraApplicationPackageValidationCode,
  path: string,
  message: string,
): { readonly ok: false; readonly issue: { readonly code: ViraApplicationPackageValidationCode; readonly path: string; readonly message: string } } {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function exact(value: JsonObject, allowed: readonly string[], required = allowed): string | undefined {
  const allow = new Set(allowed);
  const unknown = Object.keys(value).sort().find((key) => !allow.has(key));
  if (unknown) return unknown;
  return required.find((key) => !Object.hasOwn(value, key));
}

function boundedText(value: JsonValue | undefined, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value;
}

function releaseVersion(value: JsonValue | undefined): value is string {
  return typeof value === "string" && RELEASE_VERSION.test(value);
}

function exactVersionRef(value: JsonValue | undefined): value is string {
  if (typeof value !== "string" || !VERSION_REF.test(value)) return false;
  const normalized = value.toLowerCase();
  if (FLOATING_ALIASES.has(normalized)) return false;
  if (/(?:^|[._:+-])[xX](?:$|[._:+-])/.test(value) || /\d[xX](?:$|[._:+-])/.test(value)) return false;
  return true;
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

function publisher(value: JsonValue | undefined):
  | { readonly ok: true; readonly value: ViraApplicationPublisher }
  | { readonly ok: false; readonly issue: { readonly code: ViraApplicationPackageValidationCode; readonly path: string; readonly message: string } } {
  if (!object(value)) return failure("INVALID_PUBLISHER", "$.publisher", "publisher must be an exact object");
  const unexpected = exact(value, ["id", "name"]);
  if (unexpected) return failure("INVALID_PUBLISHER", `$.publisher.${unexpected}`, "publisher shape is invalid");
  if (typeof value.id !== "string" || !isSemanticSegment(value.id)) {
    return failure("INVALID_PUBLISHER", "$.publisher.id", "publisher id must be a canonical semantic segment");
  }
  if (!boundedText(value.name, VIRA_APPLICATION_PACKAGE_MAX_PUBLISHER_NAME_LENGTH)) {
    return failure("INVALID_PUBLISHER", "$.publisher.name", "publisher name is invalid");
  }
  return { ok: true, value: Object.freeze({ id: value.id, name: value.name }) };
}

function exactReference(value: JsonValue, path: string):
  | { readonly ok: true; readonly value: ViraApplicationExactReference }
  | { readonly ok: false; readonly issue: { readonly code: ViraApplicationPackageValidationCode; readonly path: string; readonly message: string } } {
  if (!object(value)) return failure("INVALID_REFERENCE", path, "reference must be an exact object");
  const unexpected = exact(value, ["id", "versionRef"]);
  if (unexpected) return failure("INVALID_REFERENCE", `${path}.${unexpected}`, "reference shape is invalid");
  if (typeof value.id !== "string" || !isSemanticNamespace(value.id)) {
    return failure("INVALID_REFERENCE", `${path}.id`, "reference id must be a canonical semantic namespace");
  }
  if (!exactVersionRef(value.versionRef)) {
    const code = typeof value.versionRef === "string" && VERSION_REF.test(value.versionRef)
      ? "FLOATING_REFERENCE"
      : "INVALID_REFERENCE";
    return failure(code, `${path}.versionRef`, "reference version must be exact and must not use a floating alias or range");
  }
  return { ok: true, value: Object.freeze({ id: value.id, versionRef: value.versionRef }) };
}

function referenceArray(
  value: JsonValue | undefined,
  path: string,
):
  | { readonly ok: true; readonly value: readonly ViraApplicationExactReference[] }
  | { readonly ok: false; readonly issue: { readonly code: ViraApplicationPackageValidationCode; readonly path: string; readonly message: string } } {
  if (!Array.isArray(value)) return failure("INVALID_REFERENCE", path, "references must be an array");
  if (value.length > VIRA_APPLICATION_PACKAGE_MAX_REFERENCES) {
    return failure("REFERENCE_LIMIT_EXCEEDED", path, `reference limit is ${VIRA_APPLICATION_PACKAGE_MAX_REFERENCES}`);
  }
  const output: ViraApplicationExactReference[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const parsed = exactReference(value[index] as JsonValue, `${path}[${index}]`);
    if (!parsed.ok) return parsed;
    const key = `${parsed.value.id}\u0000${parsed.value.versionRef}`;
    if (seen.has(key)) return failure("DUPLICATE_REFERENCE", `${path}[${index}]`, "duplicate exact reference");
    seen.add(key);
    output.push(parsed.value);
  }
  return { ok: true, value: Object.freeze(output) };
}

function experienceArray(value: JsonValue | undefined):
  | { readonly ok: true; readonly value: readonly ViraApplicationExperienceReference[] }
  | { readonly ok: false; readonly issue: { readonly code: ViraApplicationPackageValidationCode; readonly path: string; readonly message: string } } {
  if (!Array.isArray(value)) return failure("INVALID_EXPERIENCE", "$.experiences", "experiences must be an array");
  if (value.length > VIRA_APPLICATION_PACKAGE_MAX_EXPERIENCES) {
    return failure("EXPERIENCE_LIMIT_EXCEEDED", "$.experiences", `experience reference limit is ${VIRA_APPLICATION_PACKAGE_MAX_EXPERIENCES}`);
  }
  const output: ViraApplicationExperienceReference[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const path = `$.experiences[${index}]`;
    const item = value[index] as JsonValue;
    if (!object(item)) return failure("INVALID_EXPERIENCE", path, "experience reference must be an exact object");
    const unexpected = exact(item, ["id", "packId", "packVersion", "entrypoint"]);
    if (unexpected) return failure("INVALID_EXPERIENCE", `${path}.${unexpected}`, "experience reference shape is invalid");
    if (typeof item.id !== "string" || !isSemanticNamespace(item.id)) {
      return failure("INVALID_EXPERIENCE", `${path}.id`, "experience id must be a canonical semantic namespace");
    }
    if (typeof item.packId !== "string" || !PACK_ID.test(item.packId)) {
      return failure("INVALID_EXPERIENCE", `${path}.packId`, "packId must be an exact canonical Experience Pack id");
    }
    if (!releaseVersion(item.packVersion)) {
      return failure("INVALID_EXPERIENCE", `${path}.packVersion`, "packVersion must be an exact release semver");
    }
    if (typeof item.entrypoint !== "string" || !ENTRYPOINT.test(item.entrypoint)) {
      return failure("INVALID_EXPERIENCE", `${path}.entrypoint`, "entrypoint must be an exact Pack entrypoint identity");
    }
    const key = `${item.id}\u0000${item.packId}\u0000${item.packVersion}\u0000${item.entrypoint}`;
    if (seen.has(key)) return failure("DUPLICATE_EXPERIENCE", path, "duplicate exact experience reference");
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

function actionArray(value: JsonValue | undefined):
  | { readonly ok: true; readonly value: readonly ViraApplicationActionReference[] }
  | { readonly ok: false; readonly issue: { readonly code: ViraApplicationPackageValidationCode; readonly path: string; readonly message: string } } {
  if (!Array.isArray(value)) return failure("INVALID_ACTION", "$.actions", "actions must be an array");
  if (value.length > VIRA_APPLICATION_PACKAGE_MAX_ACTIONS) {
    return failure("ACTION_LIMIT_EXCEEDED", "$.actions", `action reference limit is ${VIRA_APPLICATION_PACKAGE_MAX_ACTIONS}`);
  }
  const output: ViraApplicationActionReference[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const path = `$.actions[${index}]`;
    const item = value[index] as JsonValue;
    if (!object(item)) return failure("INVALID_ACTION", path, "action reference must be an exact object");
    const unexpected = exact(item, ["actionType"]);
    if (unexpected) return failure("INVALID_ACTION", `${path}.${unexpected}`, "action reference shape is invalid");
    if (typeof item.actionType !== "string" || !isSemanticNamespace(item.actionType)) {
      return failure("INVALID_ACTION", `${path}.actionType`, "actionType must be a canonical semantic namespace");
    }
    if (seen.has(item.actionType)) return failure("DUPLICATE_ACTION", path, "duplicate action identity");
    seen.add(item.actionType);
    output.push(Object.freeze({ actionType: item.actionType }));
  }
  return { ok: true, value: Object.freeze(output) };
}

function compatibility(value: JsonValue | undefined):
  | { readonly ok: true; readonly value: ViraApplicationHostCompatibility }
  | { readonly ok: false; readonly issue: { readonly code: ViraApplicationPackageValidationCode; readonly path: string; readonly message: string } } {
  if (!object(value)) return failure("INVALID_HOST_COMPATIBILITY", "$.hostCompatibility", "hostCompatibility must be an exact object");
  const unexpected = exact(
    value,
    ["minViraVersion", "maxViraVersion", "requiredCapabilities"],
    ["minViraVersion", "requiredCapabilities"],
  );
  if (unexpected) return failure("INVALID_HOST_COMPATIBILITY", `$.hostCompatibility.${unexpected}`, "hostCompatibility shape is invalid");
  if (!releaseVersion(value.minViraVersion)) {
    return failure("INVALID_HOST_COMPATIBILITY", "$.hostCompatibility.minViraVersion", "minViraVersion must be release semver");
  }
  const max = value.maxViraVersion;
  if (max !== undefined && !releaseVersion(max)) {
    return failure("INVALID_HOST_COMPATIBILITY", "$.hostCompatibility.maxViraVersion", "maxViraVersion must be release semver");
  }
  if (max !== undefined && compareRelease(max, value.minViraVersion) < 0) {
    return failure("INVALID_HOST_COMPATIBILITY", "$.hostCompatibility.maxViraVersion", "maxViraVersion must not precede minViraVersion");
  }
  if (!Array.isArray(value.requiredCapabilities) || value.requiredCapabilities.length > VIRA_APPLICATION_PACKAGE_MAX_REFERENCES) {
    return failure("INVALID_HOST_COMPATIBILITY", "$.hostCompatibility.requiredCapabilities", "requiredCapabilities must be a bounded array");
  }
  const requiredCapabilities: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.requiredCapabilities.length; index += 1) {
    const capability = value.requiredCapabilities[index];
    if (typeof capability !== "string" || !isSemanticNamespace(capability)) {
      return failure("INVALID_HOST_COMPATIBILITY", `$.hostCompatibility.requiredCapabilities[${index}]`, "required host capability id is invalid");
    }
    if (seen.has(capability)) {
      return failure("DUPLICATE_REFERENCE", `$.hostCompatibility.requiredCapabilities[${index}]`, "duplicate required host capability");
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

function distribution(value: JsonValue | undefined):
  | { readonly ok: true; readonly value: ViraApplicationDistributionMetadata }
  | { readonly ok: false; readonly issue: { readonly code: ViraApplicationPackageValidationCode; readonly path: string; readonly message: string } } {
  if (!object(value)) return failure("INVALID_DISTRIBUTION", "$.distribution", "distribution must be an exact object");
  const unexpected = exact(value, ["name", "description", "tags", "visibility", "discoverable"], ["name", "tags", "visibility", "discoverable"]);
  if (unexpected) return failure("INVALID_DISTRIBUTION", `$.distribution.${unexpected}`, "distribution shape is invalid");
  if (!boundedText(value.name, VIRA_APPLICATION_PACKAGE_MAX_NAME_LENGTH)) {
    return failure("INVALID_DISTRIBUTION", "$.distribution.name", "distribution name is invalid");
  }
  const description = value.description;
  if (description !== undefined && (typeof description !== "string" || description.length > VIRA_APPLICATION_PACKAGE_MAX_DESCRIPTION_LENGTH || description.trim() !== description)) {
    return failure("INVALID_DISTRIBUTION", "$.distribution.description", "distribution description is invalid");
  }
  if (!Array.isArray(value.tags) || value.tags.length > VIRA_APPLICATION_PACKAGE_MAX_TAGS) {
    return failure("INVALID_DISTRIBUTION", "$.distribution.tags", "distribution tags must be a bounded array");
  }
  const tags: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.tags.length; index += 1) {
    const tag = value.tags[index];
    if (typeof tag !== "string" || !TAG.test(tag) || seen.has(tag)) {
      return failure("INVALID_DISTRIBUTION", `$.distribution.tags[${index}]`, "distribution tags must be unique canonical tags");
    }
    seen.add(tag);
    tags.push(tag);
  }
  if (typeof value.visibility !== "string" || !VIRA_APPLICATION_VISIBILITIES.includes(value.visibility as (typeof VIRA_APPLICATION_VISIBILITIES)[number])) {
    return failure("INVALID_DISTRIBUTION", "$.distribution.visibility", "distribution visibility is invalid");
  }
  if (typeof value.discoverable !== "boolean") {
    return failure("INVALID_DISTRIBUTION", "$.distribution.discoverable", "discoverable must be boolean");
  }
  if (value.visibility === "private" && value.discoverable) {
    return failure("INVALID_DISTRIBUTION", "$.distribution.discoverable", "private applications cannot be publicly discoverable");
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

function commercial(value: JsonValue | undefined):
  | { readonly ok: true; readonly value: ViraApplicationCommercialMetadata }
  | { readonly ok: false; readonly issue: { readonly code: ViraApplicationPackageValidationCode; readonly path: string; readonly message: string } } {
  if (!object(value)) return failure("INVALID_COMMERCIAL", "$.commercial", "commercial must be an exact metadata object");
  const unexpected = exact(value, ["entitlementRefs", "meteringRefs"]);
  if (unexpected) return failure("INVALID_COMMERCIAL", `$.commercial.${unexpected}`, "commercial shape is invalid");
  const entitlements = referenceArray(value.entitlementRefs, "$.commercial.entitlementRefs");
  if (!entitlements.ok) return { ok: false, issue: { ...entitlements.issue, code: entitlements.issue.code === "REFERENCE_LIMIT_EXCEEDED" ? entitlements.issue.code : "INVALID_COMMERCIAL" } };
  const metering = referenceArray(value.meteringRefs, "$.commercial.meteringRefs");
  if (!metering.ok) return { ok: false, issue: { ...metering.issue, code: metering.issue.code === "REFERENCE_LIMIT_EXCEEDED" ? metering.issue.code : "INVALID_COMMERCIAL" } };
  return { ok: true, value: Object.freeze({ entitlementRefs: entitlements.value, meteringRefs: metering.value }) };
}

function compareRelease(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

export function parseViraApplicationPackage(input: unknown): ViraApplicationPackageResult {
  const parsed = parseJsonValue(input, "$" );
  if (!parsed.ok || !object(parsed.value)) {
    return failure("INVALID_TYPE", parsed.ok ? "$" : parsed.issue.path, parsed.ok ? "application package must be a plain object" : parsed.issue.reason);
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
  const unexpected = exact(root, fields);
  if (unexpected) return failure("UNKNOWN_FIELD", `$.${unexpected}`, `unknown or missing application package field: ${unexpected}`);
  if (root.schemaVersion !== VIRA_APPLICATION_PACKAGE_SCHEMA_VERSION) {
    return failure("INVALID_SCHEMA_VERSION", "$.schemaVersion", `schemaVersion must equal ${VIRA_APPLICATION_PACKAGE_SCHEMA_VERSION}`);
  }
  if (!object(root.identity)) return failure("INVALID_IDENTITY", "$.identity", "identity must be an exact object");
  const identityUnexpected = exact(root.identity, ["id"]);
  if (identityUnexpected) return failure("INVALID_IDENTITY", `$.identity.${identityUnexpected}`, "identity shape is invalid");
  if (typeof root.identity.id !== "string" || !isSemanticNamespace(root.identity.id) || !root.identity.id.includes(".")) {
    return failure("INVALID_IDENTITY", "$.identity.id", "application id must be a namespaced semantic identity");
  }
  if (!releaseVersion(root.version)) return failure("INVALID_VERSION", "$.version", "application release version must be semver");

  const parsedPublisher = publisher(root.publisher);
  if (!parsedPublisher.ok) return parsedPublisher;
  if (root.identity.id.split(".")[0] !== parsedPublisher.value.id) {
    return failure("INVALID_PUBLISHER", "$.publisher.id", "publisher id must match the first Application identity namespace segment");
  }

  const experiences = experienceArray(root.experiences); if (!experiences.ok) return experiences;
  const capabilities = referenceArray(root.capabilities, "$.capabilities"); if (!capabilities.ok) return capabilities;
  const contextTypes = referenceArray(root.contextTypes, "$.contextTypes"); if (!contextTypes.ok) return contextTypes;
  const actions = actionArray(root.actions); if (!actions.ok) return actions;
  const flows = referenceArray(root.flows, "$.flows"); if (!flows.ok) return flows;

  let brandRef: ViraApplicationExactReference | null;
  if (root.brandRef === null) {
    brandRef = null;
  } else {
    const parsedBrand = exactReference(root.brandRef as JsonValue, "$.brandRef");
    if (!parsedBrand.ok) return parsedBrand;
    brandRef = parsedBrand.value;
  }

  const governance = referenceArray(root.governanceRequirements, "$.governanceRequirements"); if (!governance.ok) return governance;
  const host = compatibility(root.hostCompatibility); if (!host.ok) return host;
  const projections = referenceArray(root.protocolProjections, "$.protocolProjections"); if (!projections.ok) return projections;
  const parsedDistribution = distribution(root.distribution); if (!parsedDistribution.ok) return parsedDistribution;
  const parsedCommercial = commercial(root.commercial); if (!parsedCommercial.ok) return parsedCommercial;

  if (experiences.value.length + capabilities.value.length + actions.value.length + flows.value.length === 0) {
    return failure("EMPTY_APPLICATION", "$", "application must reference at least one Experience, Capability, Action or Flow");
  }

  const value: ViraApplicationPackage = {
    schemaVersion: VIRA_APPLICATION_PACKAGE_SCHEMA_VERSION,
    identity: Object.freeze({ id: root.identity.id }),
    version: root.version,
    publisher: parsedPublisher.value,
    experiences: experiences.value,
    capabilities: capabilities.value,
    contextTypes: contextTypes.value,
    actions: actions.value,
    flows: flows.value,
    brandRef,
    governanceRequirements: governance.value,
    hostCompatibility: host.value,
    protocolProjections: projections.value,
    distribution: parsedDistribution.value,
    commercial: parsedCommercial.value,
  };
  return { ok: true, value: freeze(value) };
}

export function serializeViraApplicationPackage(input: unknown): ViraApplicationPackageSerializationResult {
  const parsed = parseViraApplicationPackage(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), package: parsed.value };
}
