import { parseExperiencePlan } from "@vira-enterprise-genui/protocol";
import type { Capability } from "@vira-enterprise-genui/protocol";
import { freezePlannerData } from "../internal/freeze-json.js";
import type { CompositionDirective, CompositionPlannerResult } from "./types.js";

export function planComposition(planInput: unknown): CompositionPlannerResult {
  const plan = parseExperiencePlan(planInput);
  if (!plan.ok) {
    return {
      ok: false,
      issue: {
        code: "INVALID_PLAN",
        path: plan.issue.path,
        message: plan.issue.message,
      },
    };
  }

  const required = plan.value.capabilities.required;
  const available = plan.value.capabilities.available;
  let mode: CompositionDirective["mode"];
  let primary: Capability[];
  let supporting: Capability[];

  if (required.length > 0) {
    mode = "resolve";
    primary = [...required];
    supporting = [...available];
  } else if (available.length > 0) {
    mode = "interact";
    primary = available.slice(0, 1);
    supporting = available.slice(1);
  } else {
    mode = "settled";
    primary = [];
    supporting = [];
  }

  const directive: CompositionDirective = {
    planId: plan.value.id,
    mode,
    primary,
    supporting,
    deferred: [...plan.value.capabilities.future],
  };
  return { ok: true, value: freezePlannerData(directive) };
}
