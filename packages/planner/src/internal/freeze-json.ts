import type { JsonValue } from "@vira-enterprise-genui/protocol";

export function freezePlannerData<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;

  if (Array.isArray(value)) {
    for (const item of value) freezePlannerData(item);
    return Object.freeze(value);
  }

  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) freezePlannerData(object[key]);
  return Object.freeze(value);
}

export function freezeJsonData<T extends JsonValue>(value: T): T {
  return freezePlannerData(value);
}
