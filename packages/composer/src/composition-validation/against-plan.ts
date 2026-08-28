import { planComposition } from "@vira-enterprise-genui/planner";
import type { Capability } from "@vira-enterprise-genui/protocol";
import type { SemanticRegionRole } from "../semantic-regions/index.js";
import { parseComposedExperience } from "./parse.js";
import type { ComposedExperienceParseResult } from "./types.js";

function failure(
  code: "INVALID_SOURCE_PLAN" | "PLAN_ID_MISMATCH" | "MODE_MISMATCH" | "CAPABILITY_MISMATCH",
  path: string,
  message: string,
): ComposedExperienceParseResult {
  return { ok: false, issue: { code, path, message } };
}

function capabilitiesForRole(
  regions: readonly { readonly role: SemanticRegionRole; readonly capabilities: readonly Capability[] }[],
  role: SemanticRegionRole,
): readonly Capability[] {
  return regions.filter((region) => region.role === role).flatMap((region) => [...region.capabilities]);
}

function sameCapabilities(actual: readonly Capability[], expected: readonly Capability[]): boolean {
  if (actual.length !== expected.length) return false;
  for (let index = 0; index < actual.length; index += 1) {
    const actualCapability = actual[index];
    const expectedCapability = expected[index];
    if (!actualCapability || !expectedCapability) return false;
    if (actualCapability.version !== expectedCapability.version || actualCapability.id !== expectedCapability.id) return false;
  }
  return true;
}

export function validateComposedExperienceAgainstPlan(
  composedInput: unknown,
  planInput: unknown,
): ComposedExperienceParseResult {
  const composed = parseComposedExperience(composedInput);
  if (!composed.ok) return composed;

  const directive = planComposition(planInput);
  if (!directive.ok) {
    return failure("INVALID_SOURCE_PLAN", directive.issue.path, directive.issue.message);
  }
  if (composed.value.planId !== directive.value.planId) {
    return failure("PLAN_ID_MISMATCH", "$.planId", "composed experience planId does not match source ExperiencePlan");
  }
  if (composed.value.mode !== directive.value.mode) {
    return failure("MODE_MISMATCH", "$.mode", "composed experience mode does not match Planner composition mode");
  }

  const expectedByRole = {
    primary: directive.value.primary,
    supporting: directive.value.supporting,
    deferred: directive.value.deferred,
  } as const;

  for (const role of ["primary", "supporting", "deferred"] as const) {
    const actual = capabilitiesForRole(composed.value.regions, role);
    if (!sameCapabilities(actual, expectedByRole[role])) {
      return failure(
        "CAPABILITY_MISMATCH",
        "$.regions",
        `composed ${role} capabilities do not match source ExperiencePlan priority`,
      );
    }
  }

  return composed;
}
