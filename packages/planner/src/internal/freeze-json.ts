import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";

export function freezeJsonData<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;

  if (Array.isArray(value)) {
    for (const item of value) freezeJsonData(item);
    return Object.freeze(value) as T;
  }

  const object = value as JsonObject;
  for (const key of Object.keys(object)) {
    const child = object[key];
    if (child !== undefined) freezeJsonData(child);
  }
  return Object.freeze(value) as T;
}
