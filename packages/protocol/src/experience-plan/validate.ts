import { parseCapability } from "../capability/index.js";
import type { Capability } from "../capability/index.js";
import { parseIntent } from "../intent/index.js";
import { parseJsonValue } from "../json-value.js";
import type { JsonObject, JsonValue } from "../json-value.js";
import { readDataObjectInput } from "../object-input.js";
import {
  EXPERIENCE_PLAN_ID_MAX_LENGTH,
  EXPERIENCE_PLAN_MAX_CAPABILITIES,
  EXPERIENCE_PLAN_PROTOCOL_VERSION,
} from "./types.js";
import type {
  ExperiencePlan,
  ExperiencePlanParseResult,
  ExperiencePlanValidationCode,
  PlannedCapabilities,
} from "./types.js";

const allowedFields = new Set(["version", "id", "intent", "state", "capabilities"]);
const capabilityBucketFields = new Set(["required", "available", "future"]);
const capabilityBuckets = ["required", "available", "future"] as const;
const planIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

type CapabilityBucket = (typeof capabilityBuckets)[number];

function failure(
  code: ExperiencePlanValidationCode,
  path: string,
  message: string,
): ExperiencePlanParseResult {
  return { ok: false, issue: { code, path, message } };
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseCapabilityBucket(
  rawValue: unknown,
  bucket: CapabilityBucket,
):
  | { readonly ok: true; readonly value: readonly Capability[] }
  | { readonly ok: false; readonly path: string; readonly message: string } {
  if (rawValue === undefined) return { ok: true, value: [] };

  const basePath = `$.capabilities.${bucket}`;
  const parsed = parseJsonValue(rawValue, basePath);
  if (!parsed.ok) return { ok: false, path: parsed.issue.path, message: parsed.issue.reason };
  if (!Array.isArray(parsed.value)) {
    return { ok: false, path: basePath, message: `${bucket} capabilities must be an array` };
  }

  const capabilities: Capability[] = [];
  for (let index = 0; index < parsed.value.length; index += 1) {
    const result = parseCapability(parsed.value[index]);
    if (!result.ok) {
      return {
        ok: false,
        path: nestedPath(`${basePath}[${index}]`, result.issue.path),
        message: result.issue.message,
      };
    }
    capabilities.push(result.value);
  }
  return { ok: true, value: capabilities };
}

export function parseExperiencePlan(value: unknown): ExperiencePlanParseResult {
  const input = readDataObjectInput(value);
  if (!input.ok) return failure("INVALID_TYPE", input.issue.path, input.issue.reason);
  const fields = input.value;

  const unknownField = Object.keys(fields).sort().find((field) => !allowedFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown experience plan field: ${unknownField}`);

  if (fields.version !== EXPERIENCE_PLAN_PROTOCOL_VERSION) {
    return failure("INVALID_VERSION", "$.version", `experience plan version must be ${EXPERIENCE_PLAN_PROTOCOL_VERSION}`);
  }

  if (
    typeof fields.id !== "string"
    || fields.id.length < 1
    || fields.id.length > EXPERIENCE_PLAN_ID_MAX_LENGTH
    || !planIdPattern.test(fields.id)
  ) {
    return failure(
      "INVALID_ID",
      "$.id",
      `experience plan id must use safe identifier characters and be at most ${EXPERIENCE_PLAN_ID_MAX_LENGTH} characters`,
    );
  }

  const intent = parseIntent(fields.intent);
  if (!intent.ok) return failure("INVALID_INTENT", nestedPath("$.intent", intent.issue.path), intent.issue.message);

  const state = parseJsonValue(fields.state, "$.state");
  if (!state.ok) return failure("INVALID_STATE", state.issue.path, state.issue.reason);
  if (!isJsonObject(state.value)) return failure("INVALID_STATE", "$.state", "state must be a canonical JSON object");

  const capabilityInput = readDataObjectInput(fields.capabilities, "$.capabilities");
  if (!capabilityInput.ok) {
    return failure("INVALID_CAPABILITIES", capabilityInput.issue.path, capabilityInput.issue.reason);
  }

  const unknownCapabilityField = Object.keys(capabilityInput.value)
    .sort()
    .find((field) => !capabilityBucketFields.has(field));
  if (unknownCapabilityField) {
    return failure(
      "INVALID_CAPABILITIES",
      `$.capabilities.${unknownCapabilityField}`,
      `unknown capability bucket: ${unknownCapabilityField}`,
    );
  }

  const normalized = {} as Record<CapabilityBucket, readonly Capability[]>;
  const seen = new Set<string>();
  let totalCapabilities = 0;

  for (const bucket of capabilityBuckets) {
    const rawBucket = capabilityInput.value[bucket];
    if (Array.isArray(rawBucket) && rawBucket.length > EXPERIENCE_PLAN_MAX_CAPABILITIES) {
      return failure(
        "CAPABILITY_LIMIT_EXCEEDED",
        `$.capabilities.${bucket}`,
        `experience plan may contain at most ${EXPERIENCE_PLAN_MAX_CAPABILITIES} capabilities`,
      );
    }

    const parsedBucket = parseCapabilityBucket(rawBucket, bucket);
    if (!parsedBucket.ok) return failure("INVALID_CAPABILITIES", parsedBucket.path, parsedBucket.message);

    totalCapabilities += parsedBucket.value.length;
    if (totalCapabilities > EXPERIENCE_PLAN_MAX_CAPABILITIES) {
      return failure(
        "CAPABILITY_LIMIT_EXCEEDED",
        "$.capabilities",
        `experience plan may contain at most ${EXPERIENCE_PLAN_MAX_CAPABILITIES} capabilities`,
      );
    }

    for (let index = 0; index < parsedBucket.value.length; index += 1) {
      const capability = parsedBucket.value[index];
      if (!capability) continue;
      if (seen.has(capability.id)) {
        return failure(
          "DUPLICATE_CAPABILITY",
          `$.capabilities.${bucket}[${index}].id`,
          `capability ${capability.id} appears in more than one planned position`,
        );
      }
      seen.add(capability.id);
    }

    normalized[bucket] = parsedBucket.value;
  }

  const capabilities: PlannedCapabilities = {
    required: normalized.required,
    available: normalized.available,
    future: normalized.future,
  };

  return {
    ok: true,
    value: {
      version: EXPERIENCE_PLAN_PROTOCOL_VERSION,
      id: fields.id,
      intent: intent.value,
      state: state.value,
      capabilities,
    },
  };
}

export function isExperiencePlan(value: unknown): value is ExperiencePlan {
  return parseExperiencePlan(value).ok;
}
