import { parseExperiencePlan } from "@vira-enterprise-genui/protocol";
import { deepFreezeData } from "./freeze.js";
import {
  RUNTIME_EXPERIENCE_ID_MAX_LENGTH,
  RUNTIME_INITIAL_REVISION,
} from "./types.js";
import type { RuntimeState, RuntimeStateCreateResult } from "./types.js";

const experienceIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function createRuntimeState(experienceId: unknown, planInput: unknown): RuntimeStateCreateResult {
  if (
    typeof experienceId !== "string"
    || experienceId.length < 1
    || experienceId.length > RUNTIME_EXPERIENCE_ID_MAX_LENGTH
    || !experienceIdPattern.test(experienceId)
  ) {
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
    plan: frozenPlan,
  };

  return { ok: true, value: Object.freeze(state) };
}
