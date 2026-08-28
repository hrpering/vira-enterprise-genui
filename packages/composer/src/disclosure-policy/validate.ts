import { parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { freezeComposerData } from "../internal/freeze.js";
import type {
  DeferredDisclosureLevel,
  DisclosurePolicyResult,
  DisclosurePolicyValidationCode,
  SupportingDisclosureLevel,
} from "./types.js";

const policyFields = new Set(["primary", "supporting", "deferred"]);
const supportingLevels = new Set<SupportingDisclosureLevel>(["immediate", "progressive", "on-demand"]);
const deferredLevels = new Set<DeferredDisclosureLevel>(["progressive", "on-demand", "hidden"]);

function failure(code: DisclosurePolicyValidationCode, path: string, message: string): DisclosurePolicyResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSupportingLevel(value: unknown): value is SupportingDisclosureLevel {
  return typeof value === "string" && supportingLevels.has(value as SupportingDisclosureLevel);
}

function isDeferredLevel(value: unknown): value is DeferredDisclosureLevel {
  return typeof value === "string" && deferredLevels.has(value as DeferredDisclosureLevel);
}

export function createDisclosurePolicy(input: unknown): DisclosurePolicyResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "disclosure policy must be a canonical JSON object");
  const fields = parsed.value;

  const unknownField = Object.keys(fields).sort().find((field) => !policyFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown disclosure policy field: ${unknownField}`);

  if (fields.primary !== "immediate") {
    return failure(
      "INVALID_PRIMARY_DISCLOSURE",
      "$.primary",
      "primary semantic capabilities must remain immediately available",
    );
  }
  if (!isSupportingLevel(fields.supporting)) {
    return failure(
      "INVALID_SUPPORTING_DISCLOSURE",
      "$.supporting",
      "supporting disclosure must be immediate, progressive, or on-demand",
    );
  }
  if (!isDeferredLevel(fields.deferred)) {
    return failure(
      "INVALID_DEFERRED_DISCLOSURE",
      "$.deferred",
      "deferred disclosure must be progressive, on-demand, or hidden",
    );
  }

  return {
    ok: true,
    value: freezeComposerData({
      primary: "immediate",
      supporting: fields.supporting,
      deferred: fields.deferred,
    }),
  };
}
