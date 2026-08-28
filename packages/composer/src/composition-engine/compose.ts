import { planComposition } from "@vira-enterprise-genui/planner";
import { createDisclosurePolicy } from "../disclosure-policy/index.js";
import { freezeComposerData } from "../internal/freeze.js";
import { readComposerDataObject } from "../internal/data-object-input.js";
import { createLayoutPolicy } from "../layout-policy/index.js";
import { createSemanticRegionSet } from "../semantic-regions/index.js";
import type {
  CompositionEngineResult,
  CompositionEngineValidationCode,
} from "./types.js";

const inputFields = new Set(["plan", "layout", "disclosure"]);

function failure(code: CompositionEngineValidationCode, path: string, message: string): CompositionEngineResult {
  return { ok: false, issue: { code, path, message } };
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

export function composeExperience(input: unknown): CompositionEngineResult {
  const raw = readComposerDataObject(input);
  if (!raw.ok) return failure("INVALID_TYPE", raw.issue.path, raw.issue.reason);

  const unknownField = Object.keys(raw.value).sort().find((field) => !inputFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown composition engine field: ${unknownField}`);

  const directive = planComposition(raw.value.plan);
  if (!directive.ok) {
    return failure("INVALID_PLAN", nestedPath("$.plan", directive.issue.path), directive.issue.message);
  }

  const layout = createLayoutPolicy(raw.value.layout);
  if (!layout.ok) {
    return failure("INVALID_LAYOUT_POLICY", nestedPath("$.layout", layout.issue.path), layout.issue.message);
  }

  const disclosure = createDisclosurePolicy(raw.value.disclosure);
  if (!disclosure.ok) {
    return failure("INVALID_DISCLOSURE_POLICY", nestedPath("$.disclosure", disclosure.issue.path), disclosure.issue.message);
  }

  const regionInputs = [
    { id: "primary", role: "primary", capabilities: directive.value.primary },
    { id: "supporting", role: "supporting", capabilities: directive.value.supporting },
    { id: "deferred", role: "deferred", capabilities: directive.value.deferred },
  ].filter((region) => region.capabilities.length > 0);

  const semanticRegions = createSemanticRegionSet({ regions: regionInputs });
  if (!semanticRegions.ok) {
    return failure("INTERNAL_REGION_COMPOSITION", "$.plan.capabilities", semanticRegions.issue.message);
  }

  return {
    ok: true,
    value: freezeComposerData({
      planId: directive.value.planId,
      mode: directive.value.mode,
      layout: layout.value,
      disclosure: disclosure.value,
      regions: semanticRegions.value.regions,
    }),
  };
}
