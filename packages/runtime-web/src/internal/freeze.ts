export function freezeRuntimeWebData<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;

  if (Array.isArray(value)) {
    for (const item of value) freezeRuntimeWebData(item);
    return Object.freeze(value);
  }

  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) freezeRuntimeWebData(object[key]);
  return Object.freeze(value);
}
