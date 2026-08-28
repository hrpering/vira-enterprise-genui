function canonicalJsonError(path: string, reason: string): TypeError {
  return new TypeError(`${path} is not canonical JSON: ${reason}`);
}

function assertCanonicalJsonValue(value: unknown, valuePath: string, ancestors: Set<object>): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw canonicalJsonError(valuePath, "numbers must be finite");
    if (Object.is(value, -0)) throw canonicalJsonError(valuePath, "negative zero does not round-trip exactly");
    return;
  }

  if (typeof value !== "object") {
    throw canonicalJsonError(valuePath, `${typeof value} values are not supported`);
  }

  if (ancestors.has(value)) throw canonicalJsonError(valuePath, "circular references are not supported");
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const enumerableKeys = Object.keys(value);
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw canonicalJsonError(`${valuePath}[${index}]`, "sparse array slots are not supported");
        assertCanonicalJsonValue(value[index], `${valuePath}[${index}]`, ancestors);
      }
      if (enumerableKeys.some((key) => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) {
        throw canonicalJsonError(valuePath, "arrays must not have custom enumerable properties");
      }
      if (Object.getOwnPropertySymbols(value).length > 0) {
        throw canonicalJsonError(valuePath, "symbol properties are not supported");
      }
      return;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw canonicalJsonError(valuePath, "only plain objects are supported");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw canonicalJsonError(valuePath, "symbol properties are not supported");
    }

    const enumerableKeys = Object.keys(value);
    if (Object.getOwnPropertyNames(value).length !== enumerableKeys.length) {
      throw canonicalJsonError(valuePath, "non-enumerable properties are not supported");
    }
    for (const key of enumerableKeys) {
      assertCanonicalJsonValue((value as Record<string, unknown>)[key], `${valuePath}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

export function jsonRoundTrip<T>(value: T): T {
  assertCanonicalJsonValue(value, "$", new Set());
  return JSON.parse(JSON.stringify(value)) as T;
}
