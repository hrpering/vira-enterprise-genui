export function deepFreezeData<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;

  if (Array.isArray(value)) {
    for (const item of value) deepFreezeData(item);
    return Object.freeze(value);
  }

  for (const key of Object.keys(value)) {
    deepFreezeData((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}
