import { parseExperiencePlan } from "@vira-enterprise-genui/protocol";
import { deepFreezeData } from "../internal/deep-freeze.js";
import { isRuntimeExperienceId } from "./experience-id.js";
import {
  RUNTIME_EXPERIENCE_ID_MAX_LENGTH,
  RUNTIME_INITIAL_LIFECYCLE,
  RUNTIME_INITIAL_REVISION,
} from "./types.js";
import type { RuntimeState, RuntimeStateCreateResult } from "./types.js";

export function createRuntimeState(experienceId: unknown, planInput: unknown): RuntimeStateCreateResult {
  if (!isRuntimeExperienceId(experienceId)) {
    return {
      ok: false,
      issue: {
        code: "INVALID_EXPERIENCE_ID",
        path: "$.experienceId",
        message: `experienceId must use safe identifier characters and be at most ${RUNTIME_EXPERIENCE_ID_MAX_LENGTH} characters`,
      },
    };
  }

  const plan = parseExperiencePlan(planInput);
  if (!plan.ok) {
    return {
      ok: false,
      issue: {
        code: "INVALID_PLAN",
        path: plan.issue.path === "$" ? "$.plan" : `$.plan${plan.issue.path.slice(1)}`,
        message: plan.issue.message,
      },
    };
  }

  const frozenPlan = deepFreezeData(plan.value);
  const state: RuntimeState = {
    experienceId,
    revision: RUNTIME_INITIAL_REVISION,
    lifecycle: RUNTIME_INITIAL_LIFECYCLE,
    plan: frozenPlan,
  };

  return { ok: true, value: Object.freeze(state) };
}
