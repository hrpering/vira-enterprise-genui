import { RUNTIME_EXPERIENCE_ID_MAX_LENGTH } from "./types.js";

const experienceIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export function isRuntimeExperienceId(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= RUNTIME_EXPERIENCE_ID_MAX_LENGTH
    && experienceIdPattern.test(value);
}
