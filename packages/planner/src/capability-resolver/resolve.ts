import {
  EXPERIENCE_PLAN_MAX_CAPABILITIES,
  isSemanticSegment,
  parseCapability,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { Capability, JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { readPlannerDataObject } from "../internal/data-object-input.js";
import { CAPABILITY_RESOLVER_MAX_ENTRIES } from "./types.js";
import type {
  CapabilityRequirement,
  CapabilityResolverResult,
  CapabilityResolverValidationCode,
} from "./types.js";

const inputFields = new Set(["missing", "conflicts", "requirements", "available", "future"]);
const requirementFields = new Set(["field", "capability"]);
const arrayFields = ["missing", "conflicts", "requirements", "available", "future"] as const;

function failure(code: CapabilityResolverValidationCode, path: string, message: string): CapabilityResolverResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function preflight(input: unknown): CapabilityResolverResult | undefined {
  const raw = readPlannerDataObject(input);
  if (!raw.ok) return failure("INVALID_TYPE", raw.issue.path, raw.issue.reason);
  const unknownField = Object.keys(raw.value).sort().find((field) => !inputFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown capability resolver field: ${unknownField}`);

  for (const field of arrayFields) {
    const value = raw.value[field];
    if ((field === "available" || field === "future") && value === undefined) continue;
    if (!Array.isArray(value)) return failure("INVALID_TYPE", `$.${field}`, `${field} must be an array`);
    if (value.length > CAPABILITY_RESOLVER_MAX_ENTRIES) {
      return failure(
        "ENTRY_LIMIT_EXCEEDED",
        `$.${field}`,
        `${field} may contain at most ${CAPABILITY_RESOLVER_MAX_ENTRIES} entries`,
      );
    }
  }

  const rawAvailable = raw.value.available;
  const rawFuture = raw.value.future;
  const staticCount = (Array.isArray(rawAvailable) ? rawAvailable.length : 0) + (Array.isArray(rawFuture) ? rawFuture.length : 0);
  if (staticCount > EXPERIENCE_PLAN_MAX_CAPABILITIES) {
    return failure(
      "OUTPUT_LIMIT_EXCEEDED",
      "$",
      `available + future capabilities may not exceed ${EXPERIENCE_PLAN_MAX_CAPABILITIES}`,
    );
  }
  return undefined;
}

function parseBlockers(
  value: readonly JsonValue[],
  path: "$.missing" | "$.conflicts",
):
  | { readonly ok: true; readonly value: readonly string[] }
  | { readonly ok: false; readonly result: CapabilityResolverResult } {
  const output: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const field = value[index];
    if (typeof field !== "string" || !isSemanticSegment(field)) {
      return { ok: false, result: failure("INVALID_BLOCKERS", `${path}[${index}]`, "blocker field must be a lower-case semantic segment") };
    }
    if (seen.has(field)) {
      return { ok: false, result: failure("INVALID_BLOCKERS", `${path}[${index}]`, `duplicate blocker field: ${field}`) };
    }
    seen.add(field);
    output.push(field);
  }
  return { ok: true, value: output };
}

function parseCapabilityArray(
  value: readonly JsonValue[],
  path: "$.available" | "$.future",
):
  | { readonly ok: true; readonly value: readonly Capability[] }
  | { readonly ok: false; readonly result: CapabilityResolverResult } {
  const output: Capability[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const capability = parseCapability(value[index]);
    if (!capability.ok) {
      return { ok: false, result: failure("INVALID_CAPABILITY", `${path}[${index}]`, capability.issue.message) };
    }
    output.push(Object.freeze(capability.value));
  }
  return { ok: true, value: output };
}

export function resolveCapabilities(input: unknown): CapabilityResolverResult {
  const preflightResult = preflight(input);
  if (preflightResult) return preflightResult;

  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "capability resolver input must be a canonical JSON object");
  const fields = parsed.value;

  if (!Array.isArray(fields.missing) || !Array.isArray(fields.conflicts) || !Array.isArray(fields.requirements)) {
    return failure("INVALID_TYPE", "$", "missing, conflicts, and requirements must be arrays");
  }
  const availableInput = Object.hasOwn(fields, "available") ? fields.available : [];
  const futureInput = Object.hasOwn(fields, "future") ? fields.future : [];
  if (!Array.isArray(availableInput) || !Array.isArray(futureInput)) {
    return failure("INVALID_TYPE", "$", "available and future must be arrays when present");
  }

  const missing = parseBlockers(fields.missing, "$.missing");
  if (!missing.ok) return missing.result;
  const conflicts = parseBlockers(fields.conflicts, "$.conflicts");
  if (!conflicts.ok) return conflicts.result;

  const missingSet = new Set(missing.value);
  for (let index = 0; index < conflicts.value.length; index += 1) {
    const field = conflicts.value[index];
    if (field !== undefined && missingSet.has(field)) {
      return failure("AMBIGUOUS_BLOCKER", `$.conflicts[${index}]`, `field cannot be both missing and conflicting: ${field}`);
    }
  }
  const blockerSet = new Set([...missing.value, ...conflicts.value]);

  const requirements: CapabilityRequirement[] = [];
  const requirementFieldsSeen = new Set<string>();
  const capabilityIds = new Set<string>();

  for (let index = 0; index < fields.requirements.length; index += 1) {
    const rawRequirement = fields.requirements[index];
    if (!isJsonObject(rawRequirement)) {
      return failure("INVALID_REQUIREMENT", `$.requirements[${index}]`, "capability requirement must be an object");
    }
    const unknownField = Object.keys(rawRequirement).sort().find((field) => !requirementFields.has(field));
    if (unknownField) {
      return failure("INVALID_REQUIREMENT", `$.requirements[${index}].${unknownField}`, `unknown requirement field: ${unknownField}`);
    }
    if (typeof rawRequirement.field !== "string" || !isSemanticSegment(rawRequirement.field)) {
      return failure("INVALID_REQUIREMENT", `$.requirements[${index}].field`, "requirement field must be a lower-case semantic segment");
    }
    if (requirementFieldsSeen.has(rawRequirement.field)) {
      return failure("DUPLICATE_REQUIREMENT", `$.requirements[${index}].field`, `duplicate capability requirement: ${rawRequirement.field}`);
    }
    const capability = parseCapability(rawRequirement.capability);
    if (!capability.ok) {
      return failure("INVALID_CAPABILITY", `$.requirements[${index}].capability`, capability.issue.message);
    }
    if (capabilityIds.has(capability.value.id)) {
      return failure("DUPLICATE_CAPABILITY", `$.requirements[${index}].capability.id`, `duplicate capability id: ${capability.value.id}`);
    }
    requirementFieldsSeen.add(rawRequirement.field);
    capabilityIds.add(capability.value.id);
    requirements.push(Object.freeze({ field: rawRequirement.field, capability: Object.freeze(capability.value) }));
  }

  for (const field of blockerSet) {
    if (!requirementFieldsSeen.has(field)) {
      return failure("UNMAPPED_BLOCKER", "$.requirements", `no capability mapping exists for blocked field: ${field}`);
    }
  }

  const available = parseCapabilityArray(availableInput, "$.available");
  if (!available.ok) return available.result;
  const future = parseCapabilityArray(futureInput, "$.future");
  if (!future.ok) return future.result;

  for (const [bucket, capabilities] of [["available", available.value], ["future", future.value]] as const) {
    for (let index = 0; index < capabilities.length; index += 1) {
      const capability = capabilities[index];
      if (capability === undefined) continue;
      if (capabilityIds.has(capability.id)) {
        return failure("DUPLICATE_CAPABILITY", `$.${bucket}[${index}].id`, `duplicate capability id: ${capability.id}`);
      }
      capabilityIds.add(capability.id);
    }
  }

  const required = requirements
    .filter((requirement) => blockerSet.has(requirement.field))
    .map((requirement) => requirement.capability);
  const outputCount = required.length + available.value.length + future.value.length;
  if (outputCount > EXPERIENCE_PLAN_MAX_CAPABILITIES) {
    return failure(
      "OUTPUT_LIMIT_EXCEEDED",
      "$",
      `resolved capability output may contain at most ${EXPERIENCE_PLAN_MAX_CAPABILITIES} capabilities`,
    );
  }

  return {
    ok: true,
    value: Object.freeze({
      required: Object.freeze(required),
      available: Object.freeze([...available.value]),
      future: Object.freeze([...future.value]),
    }),
  };
}
