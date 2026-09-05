import {
  parseViraApplicationExactReference,
  parseViraApplicationReleaseReference,
  serializeViraApplicationExactReference,
} from "@vira-enterprise-genui/application-package";
import {
  parseViraCommercialPriceQuote,
  serializeViraCommercialPriceQuote,
} from "@vira-enterprise-genui/commercial-pricing";
import {
  isSemanticSegment,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  splitCommercialSettlementAmount,
} from "./arithmetic.js";
import {
  VIRA_COMMERCIAL_SETTLEMENT_SCHEMA_VERSION,
  VIRA_COMMERCIAL_SETTLEMENT_SHARE_BPS_DENOMINATOR,
  type ViraCommercialSettlementAllocation,
  type ViraCommercialSettlementAllocationResult,
  type ViraCommercialSettlementIssue,
  type ViraCommercialSettlementIssueCode,
  type ViraCommercialSettlementSerializationResult,
} from "./types.js";

const ALLOCATION_FIELDS = [
  "schemaVersion",
  "settlementRef",
  "applicationId",
  "applicationVersion",
  "publisherId",
  "publisherShareBps",
  "quote",
  "publisherAmountNanos",
  "platformAmountNanos",
] as const;

type Failure = { readonly ok: false; readonly issue: ViraCommercialSettlementIssue };

function fail(code: ViraCommercialSettlementIssueCode, path: string, message: string): Failure {
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

export function parseViraCommercialSettlementAllocation(
  input: unknown,
): ViraCommercialSettlementAllocationResult {
  const json = parseJsonValue(input);
  if (!json.ok) return fail("INVALID_ALLOCATION", json.issue.path, json.issue.reason);
  const root = object(json.value);
  if (!root) return fail("INVALID_ALLOCATION", "$", "settlement allocation must be an exact object");
  const rootShape = shape(root, ALLOCATION_FIELDS);
  if (rootShape) return fail("UNKNOWN_FIELD", `$.${rootShape}`, "settlement allocation shape is invalid");
  if (root.schemaVersion !== VIRA_COMMERCIAL_SETTLEMENT_SCHEMA_VERSION) {
    return fail(
      "INVALID_SCHEMA_VERSION",
      "$.schemaVersion",
      `schemaVersion must be ${VIRA_COMMERCIAL_SETTLEMENT_SCHEMA_VERSION}`,
    );
  }

  const settlementRef = parseViraApplicationExactReference(root.settlementRef);
  if (!settlementRef.ok) {
    return fail(
      settlementRef.issue.code === "FLOATING_REFERENCE" ? "FLOATING_REFERENCE" : "INVALID_REFERENCE",
      "$.settlementRef",
      `invalid exact settlementRef: ${settlementRef.issue.code}`,
    );
  }

  const release = parseViraApplicationReleaseReference({
    id: root.applicationId,
    version: root.applicationVersion,
  });
  if (!release.ok) {
    const releasePath = release.issue.path === "$.id"
      ? "$.applicationId"
      : release.issue.path === "$.version"
        ? "$.applicationVersion"
        : "$";
    return fail("INVALID_APPLICATION_TARGET", releasePath, release.issue.message);
  }

  if (typeof root.publisherId !== "string" || !isSemanticSegment(root.publisherId)) {
    return fail("INVALID_PUBLISHER", "$.publisherId", "publisherId must be a canonical semantic segment");
  }
  if (release.value.id.split(".")[0] !== root.publisherId) {
    return fail("INVALID_PUBLISHER", "$.publisherId", "publisherId must match the Application identity namespace");
  }
  if (
    typeof root.publisherShareBps !== "number"
    || !Number.isSafeInteger(root.publisherShareBps)
    || root.publisherShareBps < 0
    || root.publisherShareBps > VIRA_COMMERCIAL_SETTLEMENT_SHARE_BPS_DENOMINATOR
  ) {
    return fail("INVALID_SHARE", "$.publisherShareBps", "publisherShareBps is invalid");
  }

  const quote = parseViraCommercialPriceQuote(root.quote);
  if (!quote.ok) return fail("INVALID_QUOTE", "$.quote", `invalid canonical pricing quote: ${quote.issue.code}`);

  if (
    typeof root.publisherAmountNanos !== "number"
    || !Number.isSafeInteger(root.publisherAmountNanos)
    || root.publisherAmountNanos < 0
    || typeof root.platformAmountNanos !== "number"
    || !Number.isSafeInteger(root.platformAmountNanos)
    || root.platformAmountNanos < 0
  ) {
    return fail("INVALID_ALLOCATION", "$", "allocation amounts must be non-negative safe integers");
  }

  const split = splitCommercialSettlementAmount(quote.value.totalAmountNanos, root.publisherShareBps);
  if (!split) return fail("INVALID_ALLOCATION", "$.quote.totalAmountNanos", "allocation arithmetic is invalid");
  if (
    root.publisherAmountNanos !== split.publisherAmountNanos
    || root.platformAmountNanos !== split.platformAmountNanos
  ) {
    return fail("ALLOCATION_MISMATCH", "$", "settlement allocation amounts do not match canonical share arithmetic");
  }

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: VIRA_COMMERCIAL_SETTLEMENT_SCHEMA_VERSION,
      settlementRef: settlementRef.value,
      applicationId: release.value.id,
      applicationVersion: release.value.version,
      publisherId: root.publisherId,
      publisherShareBps: root.publisherShareBps,
      quote: quote.value,
      publisherAmountNanos: root.publisherAmountNanos,
      platformAmountNanos: root.platformAmountNanos,
    }),
  };
}

export function serializeViraCommercialSettlementAllocation(
  input: unknown,
): ViraCommercialSettlementSerializationResult<ViraCommercialSettlementAllocation> {
  const parsed = parseViraCommercialSettlementAllocation(input);
  if (!parsed.ok) return parsed;
  const settlementRef = serializeViraApplicationExactReference(parsed.value.settlementRef);
  if (!settlementRef.ok) return fail("INVALID_REFERENCE", "$.settlementRef", "settlementRef serialization failed");
  const quote = serializeViraCommercialPriceQuote(parsed.value.quote);
  if (!quote.ok) return fail("INVALID_QUOTE", "$.quote", "pricing quote serialization failed");

  return {
    ok: true,
    value: `{"schemaVersion":"${VIRA_COMMERCIAL_SETTLEMENT_SCHEMA_VERSION}","settlementRef":${settlementRef.value},"applicationId":${JSON.stringify(parsed.value.applicationId)},"applicationVersion":${JSON.stringify(parsed.value.applicationVersion)},"publisherId":${JSON.stringify(parsed.value.publisherId)},"publisherShareBps":${parsed.value.publisherShareBps},"quote":${quote.value},"publisherAmountNanos":${parsed.value.publisherAmountNanos},"platformAmountNanos":${parsed.value.platformAmountNanos}}`,
    data: parsed.value,
  };
}
