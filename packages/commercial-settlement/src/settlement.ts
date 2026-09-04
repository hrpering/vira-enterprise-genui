import {
  parseViraApplicationExactReference,
  parseViraApplicationPackage,
  serializeViraApplicationExactReference,
  type ViraApplicationExactReference,
} from "@vira-enterprise-genui/application-package";
import {
  parseViraCommercialPriceQuote,
} from "@vira-enterprise-genui/commercial-pricing";
import {
  isSemanticNamespace,
  isSemanticSegment,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  splitCommercialSettlementAmount,
} from "./arithmetic.js";
import {
  VIRA_COMMERCIAL_SETTLEMENT_MAX_RULES,
  VIRA_COMMERCIAL_SETTLEMENT_SCHEMA_VERSION,
  VIRA_COMMERCIAL_SETTLEMENT_SHARE_BPS_DENOMINATOR,
  type ViraCommercialSettlementAllocationResult,
  type ViraCommercialSettlementIssue,
  type ViraCommercialSettlementIssueCode,
  type ViraCommercialSettlementRule,
  type ViraCommercialSettlementSchedule,
  type ViraCommercialSettlementScheduleResult,
  type ViraCommercialSettlementSerializationResult,
} from "./types.js";

const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ROOT_FIELDS = ["schemaVersion", "rules"] as const;
const RULE_FIELDS = [
  "settlementRef",
  "applicationId",
  "applicationVersion",
  "publisherId",
  "planRef",
  "publisherShareBps",
] as const;
const REQUEST_FIELDS = ["application", "settlementRef", "quote"] as const;

type Failure = { readonly ok: false; readonly issue: ViraCommercialSettlementIssue };

function fail(code: ViraCommercialSettlementIssueCode, path: string, message: string): Failure {
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

function refFailure(path: string, issueCode: string): Failure {
  return fail(
    issueCode === "FLOATING_REFERENCE" ? "FLOATING_REFERENCE" : "INVALID_REFERENCE",
    path,
    `invalid exact reference: ${issueCode}`,
  );
}

function refKey(reference: ViraApplicationExactReference): string {
  return `${reference.id}\u0000${reference.versionRef}`;
}

function sameRef(left: ViraApplicationExactReference, right: ViraApplicationExactReference): boolean {
  return left.id === right.id && left.versionRef === right.versionRef;
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function compareRule(left: ViraCommercialSettlementRule, right: ViraCommercialSettlementRule): number {
  const id = compareText(left.settlementRef.id, right.settlementRef.id);
  return id !== 0 ? id : compareText(left.settlementRef.versionRef, right.settlementRef.versionRef);
}

export function parseViraCommercialSettlementSchedule(input: unknown): ViraCommercialSettlementScheduleResult {
  const json = parseJsonValue(input);
  if (!json.ok) return fail("INVALID_INPUT", json.issue.path, json.issue.reason);
  const root = object(json.value);
  if (!root) return fail("INVALID_INPUT", "$", "settlement schedule must be an exact object");
  const rootShape = shape(root, ROOT_FIELDS);
  if (rootShape) return fail("UNKNOWN_FIELD", `$.${rootShape}`, "settlement schedule shape is invalid");
  if (root.schemaVersion !== VIRA_COMMERCIAL_SETTLEMENT_SCHEMA_VERSION) {
    return fail(
      "INVALID_SCHEMA_VERSION",
      "$.schemaVersion",
      `schemaVersion must be ${VIRA_COMMERCIAL_SETTLEMENT_SCHEMA_VERSION}`,
    );
  }
  if (!Array.isArray(root.rules)) return fail("INVALID_RULE", "$.rules", "rules must be an array");
  if (root.rules.length > VIRA_COMMERCIAL_SETTLEMENT_MAX_RULES) {
    return fail("RULE_LIMIT_EXCEEDED", "$.rules", `rule limit is ${VIRA_COMMERCIAL_SETTLEMENT_MAX_RULES}`);
  }

  const rules: ViraCommercialSettlementRule[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < root.rules.length; index += 1) {
    const path = `$.rules[${index}]`;
    const item = object(root.rules[index] as JsonValue);
    if (!item) return fail("INVALID_RULE", path, "settlement rule must be an exact object");
    const itemShape = shape(item, RULE_FIELDS);
    if (itemShape) return fail("UNKNOWN_FIELD", `${path}.${itemShape}`, "settlement rule shape is invalid");

    const settlementRef = parseViraApplicationExactReference(item.settlementRef);
    if (!settlementRef.ok) return refFailure(`${path}.settlementRef`, settlementRef.issue.code);
    const key = refKey(settlementRef.value);
    if (seen.has(key)) return fail("DUPLICATE_RULE", `${path}.settlementRef`, "duplicate exact settlementRef");
    seen.add(key);

    if (
      typeof item.applicationId !== "string"
      || !isSemanticNamespace(item.applicationId)
      || !item.applicationId.includes(".")
    ) {
      return fail("INVALID_APPLICATION_TARGET", `${path}.applicationId`, "applicationId must be a namespaced semantic identity");
    }
    if (
      typeof item.applicationVersion !== "string"
      || item.applicationVersion.length > 64
      || !RELEASE_VERSION.test(item.applicationVersion)
    ) {
      return fail("INVALID_APPLICATION_TARGET", `${path}.applicationVersion`, "applicationVersion must be exact release semver");
    }
    if (typeof item.publisherId !== "string" || !isSemanticSegment(item.publisherId)) {
      return fail("INVALID_PUBLISHER", `${path}.publisherId`, "publisherId must be a canonical semantic segment");
    }
    if (item.applicationId.split(".")[0] !== item.publisherId) {
      return fail("INVALID_PUBLISHER", `${path}.publisherId`, "publisherId must match the Application identity namespace");
    }

    const planRef = parseViraApplicationExactReference(item.planRef);
    if (!planRef.ok) return refFailure(`${path}.planRef`, planRef.issue.code);

    if (
      typeof item.publisherShareBps !== "number"
      || !Number.isSafeInteger(item.publisherShareBps)
      || item.publisherShareBps < 0
      || item.publisherShareBps > VIRA_COMMERCIAL_SETTLEMENT_SHARE_BPS_DENOMINATOR
    ) {
      return fail(
        "INVALID_SHARE",
        `${path}.publisherShareBps`,
        `publisherShareBps must be an integer from 0 to ${VIRA_COMMERCIAL_SETTLEMENT_SHARE_BPS_DENOMINATOR}`,
      );
    }

    rules.push(Object.freeze({
      settlementRef: settlementRef.value,
      applicationId: item.applicationId,
      applicationVersion: item.applicationVersion,
      publisherId: item.publisherId,
      planRef: planRef.value,
      publisherShareBps: item.publisherShareBps,
    }));
  }

  rules.sort(compareRule);
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: VIRA_COMMERCIAL_SETTLEMENT_SCHEMA_VERSION,
      rules: Object.freeze(rules),
    }),
  };
}

export function serializeViraCommercialSettlementSchedule(
  input: unknown,
): ViraCommercialSettlementSerializationResult<ViraCommercialSettlementSchedule> {
  const parsed = parseViraCommercialSettlementSchedule(input);
  if (!parsed.ok) return parsed;

  const rules: string[] = [];
  for (const rule of parsed.value.rules) {
    const settlementRef = serializeViraApplicationExactReference(rule.settlementRef);
    const planRef = serializeViraApplicationExactReference(rule.planRef);
    if (!settlementRef.ok || !planRef.ok) {
      return fail("INVALID_REFERENCE", "$.rules", "canonical rule reference serialization failed");
    }
    rules.push(
      `{"settlementRef":${settlementRef.value},"applicationId":${JSON.stringify(rule.applicationId)},"applicationVersion":${JSON.stringify(rule.applicationVersion)},"publisherId":${JSON.stringify(rule.publisherId)},"planRef":${planRef.value},"publisherShareBps":${rule.publisherShareBps}}`,
    );
  }

  return {
    ok: true,
    value: `{"schemaVersion":"${VIRA_COMMERCIAL_SETTLEMENT_SCHEMA_VERSION}","rules":[${rules.join(",")}]}`,
    data: parsed.value,
  };
}

export function allocateViraCommercialSettlement(
  scheduleInput: unknown,
  requestInput: unknown,
): ViraCommercialSettlementAllocationResult {
  const schedule = parseViraCommercialSettlementSchedule(scheduleInput);
  if (!schedule.ok) return schedule;

  const requestJson = parseJsonValue(requestInput, "$request");
  if (!requestJson.ok) return fail("INVALID_REQUEST", requestJson.issue.path, requestJson.issue.reason);
  const request = object(requestJson.value);
  if (!request) return fail("INVALID_REQUEST", "$request", "settlement request must be an exact object");
  const requestShape = shape(request, REQUEST_FIELDS);
  if (requestShape) return fail("INVALID_REQUEST", `$request.${requestShape}`, "settlement request shape is invalid");

  const application = parseViraApplicationPackage(request.application);
  if (!application.ok) {
    return fail("INVALID_APPLICATION", "$request.application", `invalid Application package: ${application.issue.code}`);
  }
  const settlementRef = parseViraApplicationExactReference(request.settlementRef);
  if (!settlementRef.ok) return refFailure("$request.settlementRef", settlementRef.issue.code);
  const quote = parseViraCommercialPriceQuote(request.quote);
  if (!quote.ok) return fail("INVALID_QUOTE", "$request.quote", `invalid pricing quote: ${quote.issue.code}`);

  const rule = schedule.value.rules.find((candidate) => sameRef(candidate.settlementRef, settlementRef.value));
  if (!rule) return fail("RULE_NOT_FOUND", "$request.settlementRef", "exact settlement rule was not found");

  if (
    rule.applicationId !== application.value.identity.id
    || rule.applicationVersion !== application.value.version
  ) {
    return fail("APPLICATION_MISMATCH", "$request.application", "settlement rule does not target this exact Application release");
  }
  if (!sameRef(rule.planRef, quote.value.planRef)) {
    return fail("PLAN_MISMATCH", "$request.quote.planRef", "settlement rule planRef does not match canonical pricing quote planRef");
  }

  const split = splitCommercialSettlementAmount(quote.value.totalAmountNanos, rule.publisherShareBps);
  if (!split) return fail("INVALID_ALLOCATION", "$request.quote.totalAmountNanos", "settlement allocation could not be computed safely");

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: VIRA_COMMERCIAL_SETTLEMENT_SCHEMA_VERSION,
      settlementRef: rule.settlementRef,
      applicationId: application.value.identity.id,
      applicationVersion: application.value.version,
      publisherId: application.value.publisher.id,
      publisherShareBps: rule.publisherShareBps,
      quote: quote.value,
      publisherAmountNanos: split.publisherAmountNanos,
      platformAmountNanos: split.platformAmountNanos,
    }),
  };
}
