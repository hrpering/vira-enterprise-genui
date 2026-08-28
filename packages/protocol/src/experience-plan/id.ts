import { EXPERIENCE_PLAN_ID_MAX_LENGTH } from "./types.js";

const experiencePlanIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function isExperiencePlanId(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= EXPERIENCE_PLAN_ID_MAX_LENGTH
    && experiencePlanIdPattern.test(value);
}
