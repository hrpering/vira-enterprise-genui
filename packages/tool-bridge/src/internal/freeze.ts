export function freezeToolBridgeData<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) {
      for (const item of value) freezeToolBridgeData(item);
    } else {
      for (const item of Object.values(value as Record<string, unknown>)) freezeToolBridgeData(item);
    }
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}
