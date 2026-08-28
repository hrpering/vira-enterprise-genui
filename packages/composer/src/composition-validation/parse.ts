import { isExperiencePlanId } from "@vira-enterprise-genui/protocol";
import { isCompositionPriorityMode } from "@vira-enterprise-genui/planner";
import { createDisclosurePolicy } from "../disclosure-policy/index.js";
import { freezeComposerData } from "../internal/freeze.js";
import { readComposerDataObject } from "../internal/data-object-input.js";
import { createLayoutPolicy } from "../layout-policy/index.js";
import { createSemanticRegionSet } from "../semantic-regions/index.js";
import type { ComposedExperience } from "../composition-engine/index.js";
import type {
  ComposedExperienceParseResult,
  ComposedExperienceValidationCode,
} from "./types.js";

const rootFields = new Set(["planId", "mode", "layout", "disclosure", "regions"]);

function failure(
  code: ComposedExperienceValidationCode,
  path: string,
  message: string,
): ComposedExperienceParseResult {
  return { ok: false, issue: { code, path, message } };
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

export function parseComposedExperience(input: unknown): ComposedExperienceParseResult {
  const raw = readComposerDataObject(input);
  if (!raw.ok) return failure("INVALID_TYPE", raw.issue.path, raw.issue.reason);

  const unknownField = Object.keys(raw.value).sort().find((field) => !rootFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown composed experience field: ${unknownField}`);

  if (!isExperiencePlanId(raw.value.planId)) {
    return failure("INVALID_PLAN_ID", "$.planId", "composed experience planId must be a valid ExperiencePlan identifier");
  }
  if (!isCompositionPriorityMode(raw.value.mode)) {
    return failure("INVALID_MODE", "$.mode", "composed experience mode must be a planner composition priority mode");
  }

  const layout = createLayoutPolicy(raw.value.layout);
  if (!layout.ok) return failure("INVALID_LAYOUT_POLICY", nestedPath("$.layout", layout.issue.path), layout.issue.message);
  const disclosure = createDisclosurePolicy(raw.value.disclosure);
  if (!disclosure.ok) {
    return failure("INVALID_DISCLOSURE_POLICY", nestedPath("$.disclosure", disclosure.issue.path), disclosure.issue.message);
  }
  const regions = createSemanticRegionSet({ regions: raw.value.regions });
  if (!regions.ok) return failure("INVALID_REGIONS", nestedPath("$.regions", regions.issue.path === "$.regions" ? "$" : regions.issue.path.replace("$.regions", "$")), regions.issue.message);

  const roles = new Set(regions.value.regions.map((region) => region.role));
  if ((raw.value.mode === "resolve" || raw.value.mode === "interact") && !roles.has("primary")) {
    return failure(
      "INVALID_MODE_REGION_COMBINATION",
      "$.regions",
      `${raw.value.mode} composed experiences require at least one primary semantic region`,
    );
  }
  if (raw.value.mode === "settled" && (roles.has("primary") || roles.has("supporting"))) {
    return failure(
      "INVALID_MODE_REGION_COMBINATION",
      "$.regions",
      "settled composed experiences may contain deferred regions only",
    );
  }

  const value: ComposedExperience = {
    planId: raw.value.planId,
    mode: raw.value.mode,
    layout: layout.value,
    disclosure: disclosure.value,
    regions: regions.value.regions,
  };
  return { ok: true, value: freezeComposerData(value) };
}
