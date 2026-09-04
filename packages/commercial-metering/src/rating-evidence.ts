import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_COMMERCIAL_METER_UNITS,
  VIRA_COMMERCIAL_METER_WINDOWS,
  VIRA_COMMERCIAL_USAGE_RATING_STATUSES,
  type ViraCommercialMeteringIssue,
  type ViraCommercialMeteringIssueCode,
  type ViraCommercialMeteringSerializationResult,
  type ViraCommercialMeterUnit,
  type ViraCommercialMeterWindow,
  type ViraCommercialUsageRating,
  type ViraCommercialUsageRatingResult,
  type ViraCommercialUsageRatingStatus,
} from "./types.js";
import type { ViraApplicationExactReference } from "@vira-enterprise-genui/application-package";

const VERSION_REF = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const FLOATING_ALIASES = new Set(["latest", "current", "stable", "head", "main", "next"]);
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const RATING_FIELDS = [
  "meteringRef",
  "unit",
  "window",
  "windowStart",
  "windowEnd",
  "asOf",
  "includedRecordCount",
  "usedQuantity",
  "limitQuantity",
  "remainingQuantity",
  "excessQuantity",
  "status",
] as const;
const REFERENCE_FIELDS = ["id", "versionRef"] as const;

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

function shape(value: JsonObject, allowed: readonly string[]): string | null {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) return key;
  for (const key of allowed) if (!Object.hasOwn(value, key)) return key;
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

function nonNegativeSafeInteger(value: JsonValue | undefined, path: string): Parsed<number> {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return fail("INVALID_QUANTITY", path, "rating quantity must be a non-negative safe integer");
  }
  return { ok: true, value };
}

function nullableQuantity(value: JsonValue | undefined, path: string): Parsed<number | null> {
  if (value === null) return { ok: true, value: null };
  return nonNegativeSafeInteger(value, path);
}

function meterUnit(value: JsonValue | undefined): value is ViraCommercialMeterUnit {
  return typeof value === "string" && VIRA_COMMERCIAL_METER_UNITS.includes(value as ViraCommercialMeterUnit);
}

function meterWindow(value: JsonValue | undefined): value is ViraCommercialMeterWindow {
  return typeof value === "string" && VIRA_COMMERCIAL_METER_WINDOWS.includes(value as ViraCommercialMeterWindow);
}

function ratingStatus(value: JsonValue | undefined): value is ViraCommercialUsageRatingStatus {
  return typeof value === "string" && VIRA_COMMERCIAL_USAGE_RATING_STATUSES.includes(value as ViraCommercialUsageRatingStatus);
}

function expectedStatus(used: number, limit: number | null): {
  readonly status: ViraCommercialUsageRatingStatus;
  readonly remaining: number | null;
  readonly excess: number;
} {
  if (limit === null) return { status: "unlimited", remaining: null, excess: 0 };
  if (used < limit) return { status: "within-limit", remaining: limit - used, excess: 0 };
  if (used === limit) return { status: "limit-reached", remaining: 0, excess: 0 };
  return { status: "over-limit", remaining: 0, excess: used - limit };
}

function expectedWindow(window: ViraCommercialMeterWindow, asOf: string): {
  readonly start: string | null;
  readonly end: string | null;
} {
  if (window === "lifetime") return { start: null, end: null };
  const date = new Date(asOf);
  const start = window === "utc-day"
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const end = window === "utc-day"
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
    : Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

export function parseViraCommercialUsageRating(input: unknown): ViraCommercialUsageRatingResult {
  const json = parseJsonValue(input);
  if (!json.ok) return fail("INVALID_INPUT", json.issue.path, json.issue.reason);
  const root = object(json.value);
  if (!root) return fail("INVALID_INPUT", "$", "commercial usage rating must be an exact object");
  const unexpected = shape(root, RATING_FIELDS);
  if (unexpected) return fail("INVALID_INPUT", `$.${unexpected}`, "commercial usage rating shape is invalid");

  const meteringRef = parseReference(root.meteringRef, "$.meteringRef");
  if (!meteringRef.ok) return meteringRef;
  if (!meterUnit(root.unit)) return fail("INVALID_INPUT", "$.unit", "rating unit is invalid");
  if (!meterWindow(root.window)) return fail("INVALID_INPUT", "$.window", "rating window is invalid");
  const asOf = canonicalUtc(root.asOf, "$.asOf");
  if (!asOf.ok) return asOf;

  const includedRecordCount = nonNegativeSafeInteger(root.includedRecordCount, "$.includedRecordCount");
  if (!includedRecordCount.ok) return includedRecordCount;
  const usedQuantity = nonNegativeSafeInteger(root.usedQuantity, "$.usedQuantity");
  if (!usedQuantity.ok) return usedQuantity;
  const limitQuantity = nullableQuantity(root.limitQuantity, "$.limitQuantity");
  if (!limitQuantity.ok) return limitQuantity;
  const remainingQuantity = nullableQuantity(root.remainingQuantity, "$.remainingQuantity");
  if (!remainingQuantity.ok) return remainingQuantity;
  const excessQuantity = nonNegativeSafeInteger(root.excessQuantity, "$.excessQuantity");
  if (!excessQuantity.ok) return excessQuantity;
  if (!ratingStatus(root.status)) return fail("INVALID_INPUT", "$.status", "rating status is invalid");

  const expected = expectedStatus(usedQuantity.value, limitQuantity.value);
  if (
    root.status !== expected.status
    || remainingQuantity.value !== expected.remaining
    || excessQuantity.value !== expected.excess
  ) {
    return fail("INVALID_INPUT", "$", "rating status/remaining/excess values are inconsistent with used/limit quantities");
  }

  const window = expectedWindow(root.window, asOf.value);
  if (root.window === "lifetime") {
    if (root.windowStart !== null || root.windowEnd !== null) {
      return fail("INVALID_INPUT", "$", "lifetime rating windowStart/windowEnd must be null");
    }
  } else {
    const start = canonicalUtc(root.windowStart, "$.windowStart");
    if (!start.ok) return start;
    const end = canonicalUtc(root.windowEnd, "$.windowEnd");
    if (!end.ok) return end;
    if (start.value !== window.start || end.value !== window.end) {
      return fail("INVALID_INPUT", "$", "rating window bounds do not match window/asOf semantics");
    }
  }

  const rating: ViraCommercialUsageRating = Object.freeze({
    meteringRef: meteringRef.value,
    unit: root.unit,
    window: root.window,
    windowStart: window.start,
    windowEnd: window.end,
    asOf: asOf.value,
    includedRecordCount: includedRecordCount.value,
    usedQuantity: usedQuantity.value,
    limitQuantity: limitQuantity.value,
    remainingQuantity: remainingQuantity.value,
    excessQuantity: excessQuantity.value,
    status: root.status,
  });
  return { ok: true, value: rating };
}

export function serializeViraCommercialUsageRating(
  input: unknown,
): ViraCommercialMeteringSerializationResult<ViraCommercialUsageRating> {
  const parsed = parseViraCommercialUsageRating(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), data: parsed.value };
}
