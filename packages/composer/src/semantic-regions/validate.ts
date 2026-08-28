import {
  EXPERIENCE_PLAN_MAX_CAPABILITIES,
  isSemanticSegment,
  parseCapability,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { Capability, JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { freezeComposerData } from "../internal/freeze.js";
import {
  SEMANTIC_REGION_MAX_REGIONS,
  SEMANTIC_REGION_ROLES,
} from "./types.js";
import type {
  SemanticRegion,
  SemanticRegionRole,
  SemanticRegionSetResult,
  SemanticRegionValidationCode,
} from "./types.js";

const rootFields = new Set(["regions"]);
const regionFields = new Set(["id", "role", "capabilities"]);

function failure(code: SemanticRegionValidationCode, path: string, message: string): SemanticRegionSetResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRole(value: unknown): value is SemanticRegionRole {
  return typeof value === "string" && SEMANTIC_REGION_ROLES.includes(value as SemanticRegionRole);
}

function preflight(input: unknown): SemanticRegionSetResult | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const regionsDescriptor = Object.getOwnPropertyDescriptor(input, "regions");
  if (!regionsDescriptor || !("value" in regionsDescriptor)) return undefined;
  const regions = regionsDescriptor.value;
  if (!Array.isArray(regions)) return undefined;
  if (regions.length > SEMANTIC_REGION_MAX_REGIONS) {
    return failure(
      "REGION_LIMIT_EXCEEDED",
      "$.regions",
      `semantic region set may contain at most ${SEMANTIC_REGION_MAX_REGIONS} regions`,
    );
  }

  let capabilityCount = 0;
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    if (region === null || typeof region !== "object" || Array.isArray(region)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(region, "capabilities");
    if (!descriptor || !("value" in descriptor) || !Array.isArray(descriptor.value)) continue;
    capabilityCount += descriptor.value.length;
    if (capabilityCount > EXPERIENCE_PLAN_MAX_CAPABILITIES) {
      return failure(
        "CAPABILITY_LIMIT_EXCEEDED",
        "$.regions",
        `semantic regions may contain at most ${EXPERIENCE_PLAN_MAX_CAPABILITIES} capabilities in total`,
      );
    }
  }
  return undefined;
}

export function createSemanticRegionSet(input: unknown): SemanticRegionSetResult {
  const preflightResult = preflight(input);
  if (preflightResult) return preflightResult;

  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "semantic region set must be a canonical JSON object");
  const fields = parsed.value;

  const unknownRoot = Object.keys(fields).sort().find((field) => !rootFields.has(field));
  if (unknownRoot) return failure("UNKNOWN_FIELD", `$.${unknownRoot}`, `unknown semantic region set field: ${unknownRoot}`);
  if (!Array.isArray(fields.regions)) return failure("INVALID_TYPE", "$.regions", "regions must be an array");
  if (fields.regions.length > SEMANTIC_REGION_MAX_REGIONS) {
    return failure("REGION_LIMIT_EXCEEDED", "$.regions", `semantic region set may contain at most ${SEMANTIC_REGION_MAX_REGIONS} regions`);
  }

  const regionIds = new Set<string>();
  const capabilityIds = new Set<string>();
  const regions: SemanticRegion[] = [];
  let capabilityCount = 0;

  for (let index = 0; index < fields.regions.length; index += 1) {
    const regionInput = fields.regions[index];
    if (!isJsonObject(regionInput)) {
      return failure("INVALID_REGION", `$.regions[${index}]`, "semantic region must be a canonical JSON object");
    }
    const unknownField = Object.keys(regionInput).sort().find((field) => !regionFields.has(field));
    if (unknownField) {
      return failure("INVALID_REGION", `$.regions[${index}].${unknownField}`, `unknown semantic region field: ${unknownField}`);
    }
    if (typeof regionInput.id !== "string" || !isSemanticSegment(regionInput.id)) {
      return failure("INVALID_REGION_ID", `$.regions[${index}].id`, "region id must be a lower-case semantic segment");
    }
    if (regionIds.has(regionInput.id)) {
      return failure("DUPLICATE_REGION_ID", `$.regions[${index}].id`, `duplicate semantic region id: ${regionInput.id}`);
    }
    if (!isRole(regionInput.role)) {
      return failure("INVALID_REGION_ROLE", `$.regions[${index}].role`, "region role must be primary, supporting, or deferred");
    }
    if (!Array.isArray(regionInput.capabilities) || regionInput.capabilities.length === 0) {
      return failure("INVALID_CAPABILITIES", `$.regions[${index}].capabilities`, "semantic region must contain at least one capability");
    }

    capabilityCount += regionInput.capabilities.length;
    if (capabilityCount > EXPERIENCE_PLAN_MAX_CAPABILITIES) {
      return failure(
        "CAPABILITY_LIMIT_EXCEEDED",
        "$.regions",
        `semantic regions may contain at most ${EXPERIENCE_PLAN_MAX_CAPABILITIES} capabilities in total`,
      );
    }

    const capabilities: Capability[] = [];
    for (let capabilityIndex = 0; capabilityIndex < regionInput.capabilities.length; capabilityIndex += 1) {
      const capability = parseCapability(regionInput.capabilities[capabilityIndex]);
      if (!capability.ok) {
        return failure(
          "INVALID_CAPABILITIES",
          `$.regions[${index}].capabilities[${capabilityIndex}]`,
          capability.issue.message,
        );
      }
      if (capabilityIds.has(capability.value.id)) {
        return failure(
          "DUPLICATE_CAPABILITY",
          `$.regions[${index}].capabilities[${capabilityIndex}].id`,
          `capability ${capability.value.id} appears in more than one semantic position`,
        );
      }
      capabilityIds.add(capability.value.id);
      capabilities.push(capability.value);
    }

    regionIds.add(regionInput.id);
    regions.push({ id: regionInput.id, role: regionInput.role, capabilities });
  }

  return { ok: true, value: freezeComposerData({ regions }) };
}
