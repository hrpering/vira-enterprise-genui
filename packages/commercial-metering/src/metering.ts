import {
  parseViraApplicationPackage,
  type ViraApplicationExactReference,
} from "@vira-enterprise-genui/application-package";
import {
  evaluateViraCommercialEntitlement,
} from "@vira-enterprise-genui/commercial-entitlement";
import {
  createViraEnterpriseContext,
  VIRA_ENTERPRISE_CONTEXT_VERSION,
  VIRA_ENTERPRISE_ENVIRONMENTS,
  type ViraEnterpriseEnvironmentName,
  type ViraEnterprisePrincipal,
  type ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";
import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_COMMERCIAL_METERING_MAX_METERS,
  VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS,
  VIRA_COMMERCIAL_METERING_SCHEMA_VERSION,
  VIRA_COMMERCIAL_METER_UNITS,
  VIRA_COMMERCIAL_METER_WINDOWS,
  type ViraCommercialMeterCatalog,
  type ViraCommercialMeterCatalogResult,
  type ViraCommercialMeterDefinition,
  type ViraCommercialMeteringIssue,
  type ViraCommercialMeteringIssueCode,
  type ViraCommercialMeteringSerializationResult,
  type ViraCommercialMeterUnit,
  type ViraCommercialMeterWindow,
  type ViraCommercialUsageBatch,
  type ViraCommercialUsageBatchResult,
  type ViraCommercialUsageRating,
  type ViraCommercialUsageRatingRequest,
  type ViraCommercialUsageRatingResult,
  type ViraCommercialUsageRatingStatus,
  type ViraCommercialUsageRecord,
} from "./types.js";

const VERSION_REF = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const FLOATING_ALIASES = new Set(["latest", "current", "stable", "head", "main", "next"]);
const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ENTERPRISE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const USAGE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const CATALOG_FIELDS = ["schemaVersion", "meters"] as const;
const METER_FIELDS = ["meteringRef", "unit", "window"] as const;
const REFERENCE_FIELDS = ["id", "versionRef"] as const;
const BATCH_FIELDS = ["schemaVersion", "records"] as const;
const USAGE_FIELDS = [
  "usageId",
  "sourceId",
  "occurredAt",
  "applicationId",
  "applicationVersion",
  "entitlementRef",
  "meteringRef",
  "principal",
  "scope",
  "capabilityRef",
  "locationId",
  "quantity",
] as const;
const RATING_FIELDS = [
  "application",
  "entitlementRef",
  "principal",
  "scope",
  "capabilityRef",
  "locationId",
  "meteringRef",
  "asOf",
  "usage",
] as const;
const SCOPE_FIELDS = ["version", "organizationId", "projectId", "environment"] as const;

type Failure = { readonly ok: false; readonly issue: ViraCommercialMeteringIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function fail(code: ViraCommercialMeteringIssueCode, path: string, message: string): Failure {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): JsonObject | null {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function shape(value: JsonObject, allowed: readonly string[], required: readonly string[] = allowed): string | null {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) return key;
  for (const key of required) if (!Object.hasOwn(value, key)) return key;
  return null;
}

function exactVersionRef(value: JsonValue | undefined): value is string {
  if (typeof value !== "string" || !VERSION_REF.test(value)) return false;
  if (FLOATING_ALIASES.has(value.toLowerCase())) return false;
  return !/(?:^|[._:+-])[xX](?:$|[._:+-])/.test(value)
    && !/\d[xX](?:$|[._:+-])/.test(value);
}

function floatingVersionRef(value: JsonValue | undefined): boolean {
  if (typeof value !== "string" || !VERSION_REF.test(value)) return false;
  return FLOATING_ALIASES.has(value.toLowerCase())
    || /(?:^|[._:+-])[xX](?:$|[._:+-])/.test(value)
    || /\d[xX](?:$|[._:+-])/.test(value);
}

function parseReference(value: JsonValue | undefined, path: string): Parsed<ViraApplicationExactReference> {
  const item = object(value);
  if (!item) return fail("INVALID_REFERENCE", path, "reference must be an exact object");
  const unexpected = shape(item, REFERENCE_FIELDS);
  if (unexpected) return fail("INVALID_REFERENCE", `${path}.${unexpected}`, "reference shape is invalid");
  if (typeof item.id !== "string" || !isSemanticNamespace(item.id)) {
    return fail("INVALID_REFERENCE", `${path}.id`, "reference id must be a canonical semantic namespace");
  }
  if (!exactVersionRef(item.versionRef)) {
    return fail(
      floatingVersionRef(item.versionRef) ? "FLOATING_REFERENCE" : "INVALID_REFERENCE",
      `${path}.versionRef`,
      "reference version must be exact and non-floating",
    );
  }
  return { ok: true, value: Object.freeze({ id: item.id, versionRef: item.versionRef }) };
}

function sameRef(left: ViraApplicationExactReference | null, right: ViraApplicationExactReference | null): boolean {
  if (left === null || right === null) return left === right;
  return left.id === right.id && left.versionRef === right.versionRef;
}

function refKey(value: ViraApplicationExactReference): string {
  return `${value.id}\u0000${value.versionRef}`;
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function canonicalUtc(value: JsonValue | undefined, path: string): Parsed<string> {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)) {
    return fail("INVALID_TIMESTAMP", path, "timestamp must be canonical UTC ISO-8601 with seconds and optional milliseconds");
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return fail("INVALID_TIMESTAMP", path, "timestamp is invalid");
  const canonical = new Date(milliseconds).toISOString();
  const normalizedInput = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (canonical !== normalizedInput) return fail("INVALID_TIMESTAMP", path, "timestamp does not represent a valid canonical UTC instant");
  return { ok: true, value: canonical };
}

function parseEnterprise(
  principalValue: JsonValue | undefined,
  scopeValue: JsonValue | undefined,
  path: string,
): Parsed<{ readonly principal: ViraEnterprisePrincipal; readonly scope: ViraEnterpriseScope }> {
  const scopeObject = object(scopeValue);
  if (!scopeObject) return fail("INVALID_INPUT", `${path}.scope`, "scope must be an exact enterprise scope");
  const scopeShape = shape(scopeObject, SCOPE_FIELDS);
  if (scopeShape) return fail("INVALID_INPUT", `${path}.scope.${scopeShape}`, "enterprise scope shape is invalid");
  if (
    scopeObject.version !== VIRA_ENTERPRISE_CONTEXT_VERSION
    || typeof scopeObject.organizationId !== "string"
    || !ENTERPRISE_ID.test(scopeObject.organizationId)
    || typeof scopeObject.projectId !== "string"
    || !ENTERPRISE_ID.test(scopeObject.projectId)
    || typeof scopeObject.environment !== "string"
    || !VIRA_ENTERPRISE_ENVIRONMENTS.includes(scopeObject.environment as ViraEnterpriseEnvironmentName)
  ) {
    return fail("INVALID_INPUT", `${path}.scope`, "enterprise scope values are invalid");
  }
  const context = createViraEnterpriseContext({
    organizationId: scopeObject.organizationId,
    projectId: scopeObject.projectId,
    environments: [scopeObject.environment],
  });
  if (!context.ok) return fail("INVALID_INPUT", `${path}.scope`, context.issue.message);
  const scope = context.value.scope(scopeObject.environment as ViraEnterpriseEnvironmentName);
  if (!scope.ok) return fail("INVALID_INPUT", `${path}.scope`, scope.issue.message);
  const principal = context.value.principal(principalValue);
  if (!principal.ok) return fail("INVALID_INPUT", `${path}.principal`, principal.issue.message);
  return { ok: true, value: Object.freeze({ principal: principal.value, scope: scope.value }) };
}

function parseMeter(value: JsonValue, path: string): Parsed<ViraCommercialMeterDefinition> {
  const item = object(value);
  if (!item) return fail("INVALID_METER", path, "meter definition must be an exact object");
  const unexpected = shape(item, METER_FIELDS);
  if (unexpected) return fail("INVALID_METER", `${path}.${unexpected}`, "meter definition shape is invalid");
  const meteringRef = parseReference(item.meteringRef, `${path}.meteringRef`);
  if (!meteringRef.ok) return meteringRef;
  if (typeof item.unit !== "string" || !VIRA_COMMERCIAL_METER_UNITS.includes(item.unit as ViraCommercialMeterUnit)) {
    return fail("INVALID_METER", `${path}.unit`, "meter unit is invalid");
  }
  if (typeof item.window !== "string" || !VIRA_COMMERCIAL_METER_WINDOWS.includes(item.window as ViraCommercialMeterWindow)) {
    return fail("INVALID_METER", `${path}.window`, "meter window is invalid");
  }
  return {
    ok: true,
    value: Object.freeze({
      meteringRef: meteringRef.value,
      unit: item.unit as ViraCommercialMeterUnit,
      window: item.window as ViraCommercialMeterWindow,
    }),
  };
}

export function parseViraCommercialMeterCatalog(input: unknown): ViraCommercialMeterCatalogResult {
  const json = parseJsonValue(input);
  if (!json.ok) return fail("INVALID_INPUT", json.issue.path, json.issue.reason);
  const root = object(json.value);
  if (!root) return fail("INVALID_INPUT", "$", "meter catalog must be an exact object");
  const unexpected = shape(root, CATALOG_FIELDS);
  if (unexpected) return fail("UNKNOWN_FIELD", `$.${unexpected}`, "meter catalog shape is invalid");
  if (root.schemaVersion !== VIRA_COMMERCIAL_METERING_SCHEMA_VERSION) {
    return fail("INVALID_SCHEMA_VERSION", "$.schemaVersion", `schemaVersion must be ${VIRA_COMMERCIAL_METERING_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(root.meters)) return fail("INVALID_METER", "$.meters", "meters must be an array");
  if (root.meters.length > VIRA_COMMERCIAL_METERING_MAX_METERS) {
    return fail("METER_LIMIT_EXCEEDED", "$.meters", `meter count exceeds ${VIRA_COMMERCIAL_METERING_MAX_METERS}`);
  }
  const meters: ViraCommercialMeterDefinition[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < root.meters.length; index += 1) {
    const parsed = parseMeter(root.meters[index] as JsonValue, `$.meters[${index}]`);
    if (!parsed.ok) return parsed;
    const key = refKey(parsed.value.meteringRef);
    if (seen.has(key)) return fail("DUPLICATE_METER", `$.meters[${index}]`, "duplicate exact meteringRef");
    seen.add(key);
    meters.push(parsed.value);
  }
  meters.sort((left, right) => compareText(refKey(left.meteringRef), refKey(right.meteringRef)));
  return {
    ok: true,
    value: Object.freeze({ schemaVersion: VIRA_COMMERCIAL_METERING_SCHEMA_VERSION, meters: Object.freeze(meters) }),
  };
}

export function serializeViraCommercialMeterCatalog(
  input: unknown,
): ViraCommercialMeteringSerializationResult<ViraCommercialMeterCatalog> {
  const parsed = parseViraCommercialMeterCatalog(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), data: parsed.value };
}

function parseUsageRecord(value: JsonValue, path: string): Parsed<ViraCommercialUsageRecord> {
  const item = object(value);
  if (!item) return fail("INVALID_USAGE_RECORD", path, "usage record must be an exact object");
  const unexpected = shape(item, USAGE_FIELDS);
  if (unexpected) return fail("INVALID_USAGE_RECORD", `${path}.${unexpected}`, "usage record shape is invalid");
  if (typeof item.usageId !== "string" || !USAGE_ID.test(item.usageId)) {
    return fail("INVALID_USAGE_RECORD", `${path}.usageId`, "usageId is invalid");
  }
  if (typeof item.sourceId !== "string" || !isSemanticNamespace(item.sourceId)) {
    return fail("INVALID_USAGE_RECORD", `${path}.sourceId`, "sourceId must be a canonical provenance namespace");
  }
  const occurredAt = canonicalUtc(item.occurredAt, `${path}.occurredAt`);
  if (!occurredAt.ok) return occurredAt;
  if (typeof item.applicationId !== "string" || !isSemanticNamespace(item.applicationId)) {
    return fail("INVALID_USAGE_RECORD", `${path}.applicationId`, "applicationId must be a canonical semantic namespace");
  }
  if (typeof item.applicationVersion !== "string" || !RELEASE_VERSION.test(item.applicationVersion)) {
    return fail("INVALID_USAGE_RECORD", `${path}.applicationVersion`, "applicationVersion must be an exact release semver");
  }
  const entitlementRef = parseReference(item.entitlementRef, `${path}.entitlementRef`);
  if (!entitlementRef.ok) return entitlementRef;
  const meteringRef = parseReference(item.meteringRef, `${path}.meteringRef`);
  if (!meteringRef.ok) return meteringRef;
  const enterprise = parseEnterprise(item.principal, item.scope, path);
  if (!enterprise.ok) return fail("INVALID_USAGE_RECORD", enterprise.issue.path, enterprise.issue.message);
  let capabilityRef: ViraApplicationExactReference | null = null;
  if (item.capabilityRef !== null) {
    const parsedCapability = parseReference(item.capabilityRef, `${path}.capabilityRef`);
    if (!parsedCapability.ok) return parsedCapability;
    capabilityRef = parsedCapability.value;
  }
  if (item.locationId !== null && (typeof item.locationId !== "string" || !isSemanticNamespace(item.locationId))) {
    return fail("INVALID_USAGE_RECORD", `${path}.locationId`, "locationId must be null or a canonical semantic namespace");
  }
  if (typeof item.quantity !== "number" || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
    return fail("INVALID_QUANTITY", `${path}.quantity`, "usage quantity must be a positive safe integer");
  }
  return {
    ok: true,
    value: Object.freeze({
      usageId: item.usageId,
      sourceId: item.sourceId,
      occurredAt: occurredAt.value,
      applicationId: item.applicationId,
      applicationVersion: item.applicationVersion,
      entitlementRef: entitlementRef.value,
      meteringRef: meteringRef.value,
      principal: enterprise.value.principal,
      scope: enterprise.value.scope,
      capabilityRef,
      locationId: item.locationId as string | null,
      quantity: item.quantity,
    }),
  };
}

export function parseViraCommercialUsageBatch(input: unknown): ViraCommercialUsageBatchResult {
  const json = parseJsonValue(input);
  if (!json.ok) return fail("INVALID_INPUT", json.issue.path, json.issue.reason);
  const root = object(json.value);
  if (!root) return fail("INVALID_USAGE_BATCH", "$", "usage batch must be an exact object");
  const unexpected = shape(root, BATCH_FIELDS);
  if (unexpected) return fail("UNKNOWN_FIELD", `$.${unexpected}`, "usage batch shape is invalid");
  if (root.schemaVersion !== VIRA_COMMERCIAL_METERING_SCHEMA_VERSION) {
    return fail("INVALID_SCHEMA_VERSION", "$.schemaVersion", `schemaVersion must be ${VIRA_COMMERCIAL_METERING_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(root.records)) return fail("INVALID_USAGE_BATCH", "$.records", "records must be an array");
  if (root.records.length > VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS) {
    return fail("USAGE_LIMIT_EXCEEDED", "$.records", `usage record count exceeds ${VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS}`);
  }
  const records: ViraCommercialUsageRecord[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < root.records.length; index += 1) {
    const parsed = parseUsageRecord(root.records[index] as JsonValue, `$.records[${index}]`);
    if (!parsed.ok) return parsed;
    if (ids.has(parsed.value.usageId)) {
      return fail("DUPLICATE_USAGE_ID", `$.records[${index}].usageId`, "duplicate usageId is not permitted");
    }
    ids.add(parsed.value.usageId);
    records.push(parsed.value);
  }
  records.sort((left, right) => {
    const time = compareText(left.occurredAt, right.occurredAt);
    return time !== 0 ? time : compareText(left.usageId, right.usageId);
  });
  return {
    ok: true,
    value: Object.freeze({ schemaVersion: VIRA_COMMERCIAL_METERING_SCHEMA_VERSION, records: Object.freeze(records) }),
  };
}

export function serializeViraCommercialUsageBatch(
  input: unknown,
): ViraCommercialMeteringSerializationResult<ViraCommercialUsageBatch> {
  const parsed = parseViraCommercialUsageBatch(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), data: parsed.value };
}

function parseRatingRequest(input: unknown): Parsed<ViraCommercialUsageRatingRequest> {
  const json = parseJsonValue(input, "$request");
  if (!json.ok) return fail("INVALID_REQUEST", json.issue.path, json.issue.reason);
  const root = object(json.value);
  if (!root) return fail("INVALID_REQUEST", "$request", "rating request must be an exact object");
  const unexpected = shape(root, RATING_FIELDS);
  if (unexpected) return fail("INVALID_REQUEST", `$request.${unexpected}`, "rating request shape is invalid");
  const application = parseViraApplicationPackage(root.application);
  if (!application.ok) {
    return fail("INVALID_REQUEST", "$request.application", `application package is invalid: ${application.issue.code}`);
  }
  const entitlementRef = parseReference(root.entitlementRef, "$request.entitlementRef");
  if (!entitlementRef.ok) return entitlementRef;
  if (!application.value.commercial.entitlementRefs.some((ref) => sameRef(ref, entitlementRef.value))) {
    return fail("INVALID_REQUEST", "$request.entitlementRef", "entitlementRef is not declared by the exact Application package");
  }
  const meteringRef = parseReference(root.meteringRef, "$request.meteringRef");
  if (!meteringRef.ok) return meteringRef;
  if (!application.value.commercial.meteringRefs.some((ref) => sameRef(ref, meteringRef.value))) {
    return fail("UNDECLARED_METERING", "$request.meteringRef", "meteringRef is not declared by the exact Application package");
  }
  const enterprise = parseEnterprise(root.principal, root.scope, "$request");
  if (!enterprise.ok) return fail("INVALID_REQUEST", enterprise.issue.path, enterprise.issue.message);
  let capabilityRef: ViraApplicationExactReference | null = null;
  if (root.capabilityRef !== null) {
    const parsedCapability = parseReference(root.capabilityRef, "$request.capabilityRef");
    if (!parsedCapability.ok) return parsedCapability;
    if (!application.value.capabilities.some((ref) => sameRef(ref, parsedCapability.value))) {
      return fail("INVALID_REQUEST", "$request.capabilityRef", "capabilityRef is not declared by the exact Application package");
    }
    capabilityRef = parsedCapability.value;
  }
  if (root.locationId !== null && (typeof root.locationId !== "string" || !isSemanticNamespace(root.locationId))) {
    return fail("INVALID_REQUEST", "$request.locationId", "locationId must be null or a canonical semantic namespace");
  }
  const asOf = canonicalUtc(root.asOf, "$request.asOf");
  if (!asOf.ok) return asOf;
  const usage = parseViraCommercialUsageBatch(root.usage);
  if (!usage.ok) return usage;
  return {
    ok: true,
    value: Object.freeze({
      application: application.value,
      entitlementRef: entitlementRef.value,
      principal: enterprise.value.principal,
      scope: enterprise.value.scope,
      capabilityRef,
      locationId: root.locationId as string | null,
      meteringRef: meteringRef.value,
      asOf: asOf.value,
      usage: usage.value,
    }),
  };
}

function samePrincipal(left: ViraEnterprisePrincipal, right: ViraEnterprisePrincipal): boolean {
  return left.version === right.version
    && left.kind === right.kind
    && left.id === right.id
    && left.organizationId === right.organizationId;
}

function sameScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function recordMatches(record: ViraCommercialUsageRecord, request: ViraCommercialUsageRatingRequest): boolean {
  return record.applicationId === request.application.identity.id
    && record.applicationVersion === request.application.version
    && sameRef(record.entitlementRef, request.entitlementRef)
    && sameRef(record.meteringRef, request.meteringRef)
    && samePrincipal(record.principal, request.principal)
    && sameScope(record.scope, request.scope)
    && sameRef(record.capabilityRef, request.capabilityRef)
    && record.locationId === request.locationId;
}

function windowBounds(window: ViraCommercialMeterWindow, asOf: string): {
  readonly start: number | null;
  readonly end: number | null;
  readonly startText: string | null;
  readonly endText: string | null;
} {
  if (window === "lifetime") return { start: null, end: null, startText: null, endText: null };
  const date = new Date(asOf);
  const start = window === "utc-day"
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const end = window === "utc-day"
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
    : Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return {
    start,
    end,
    startText: new Date(start).toISOString(),
    endText: new Date(end).toISOString(),
  };
}

function ratingStatus(used: number, limit: number | null): {
  readonly status: ViraCommercialUsageRatingStatus;
  readonly remaining: number | null;
  readonly excess: number;
} {
  if (limit === null) return { status: "unlimited", remaining: null, excess: 0 };
  if (used < limit) return { status: "within-limit", remaining: limit - used, excess: 0 };
  if (used === limit) return { status: "limit-reached", remaining: 0, excess: 0 };
  return { status: "over-limit", remaining: 0, excess: used - limit };
}

export function rateViraCommercialUsage(
  meterCatalogInput: unknown,
  entitlementSetInput: unknown,
  requestInput: unknown,
): ViraCommercialUsageRatingResult {
  const catalog = parseViraCommercialMeterCatalog(meterCatalogInput);
  if (!catalog.ok) return catalog;
  const request = parseRatingRequest(requestInput);
  if (!request.ok) return request;
  const meter = catalog.value.meters.find((candidate) => sameRef(candidate.meteringRef, request.value.meteringRef));
  if (!meter) return fail("METER_NOT_FOUND", "$request.meteringRef", "exact meteringRef is not present in the meter catalog");

  const entitlement = evaluateViraCommercialEntitlement(entitlementSetInput, {
    application: request.value.application,
    entitlementRef: request.value.entitlementRef,
    principal: request.value.principal,
    scope: request.value.scope,
    capabilityRef: request.value.capabilityRef,
    locationId: request.value.locationId,
  });
  if (!entitlement.ok) {
    return fail("INVALID_REQUEST", "$request.entitlementRef", `entitlement evaluation failed: ${entitlement.issue.code}`);
  }
  if (entitlement.value.decision !== "entitled") {
    return fail("NOT_ENTITLED", "$request.entitlementRef", `commercial entitlement is ${entitlement.value.reason}`);
  }

  for (let index = 0; index < request.value.usage.records.length; index += 1) {
    if (!recordMatches(request.value.usage.records[index]!, request.value)) {
      return fail(
        "USAGE_SCOPE_MISMATCH",
        `$request.usage.records[${index}]`,
        "usage record does not match the exact Application/entitlement/meter/principal/scope/Capability/location rating context",
      );
    }
  }

  const bounds = windowBounds(meter.window, request.value.asOf);
  const asOfMs = Date.parse(request.value.asOf);
  let used = 0;
  let includedRecordCount = 0;
  for (const record of request.value.usage.records) {
    const occurredAt = Date.parse(record.occurredAt);
    if (occurredAt > asOfMs) continue;
    if (bounds.start !== null && occurredAt < bounds.start) continue;
    if (bounds.end !== null && occurredAt >= bounds.end) continue;
    if (used > Number.MAX_SAFE_INTEGER - record.quantity) {
      return fail("QUANTITY_OVERFLOW", "$request.usage.records", "usage quantity aggregation exceeds safe integer range");
    }
    used += record.quantity;
    includedRecordCount += 1;
  }

  const limitEntry = entitlement.value.limits.find((limit) => sameRef(limit.meteringRef, request.value.meteringRef));
  const limit = limitEntry?.quantity ?? null;
  const status = ratingStatus(used, limit);
  const rating: ViraCommercialUsageRating = Object.freeze({
    meteringRef: request.value.meteringRef,
    unit: meter.unit,
    window: meter.window,
    windowStart: bounds.startText,
    windowEnd: bounds.endText,
    asOf: request.value.asOf,
    includedRecordCount,
    usedQuantity: used,
    limitQuantity: limit,
    remainingQuantity: status.remaining,
    excessQuantity: status.excess,
    status: status.status,
  });
  return { ok: true, value: rating };
}
