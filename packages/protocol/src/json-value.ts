export const JSON_VALUE_MAX_DEPTH = 64 as const;

export type JsonPrimitive = null | boolean | number | string;
export type JsonArray = readonly JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

export interface JsonValueIssue {
  readonly path: string;
  readonly reason: string;
}

export type JsonValueParseResult =
  | { readonly ok: true; readonly value: JsonValue }
  | { readonly ok: false; readonly issue: JsonValueIssue };

function issue(path: string, reason: string): JsonValueParseResult {
  return { ok: false, issue: { path, reason } };
}

function dataDescriptor(object: object, key: PropertyKey): PropertyDescriptor | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !("value" in descriptor)) return undefined;
  return descriptor;
}

function parseInternal(
  value: unknown,
  valuePath: string,
  ancestors: Set<object>,
  depth: number,
): JsonValueParseResult {
  if (depth > JSON_VALUE_MAX_DEPTH) {
    return issue(valuePath, `maximum nesting depth ${JSON_VALUE_MAX_DEPTH} exceeded`);
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return { ok: true, value };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return issue(valuePath, "numbers must be finite");
    if (Object.is(value, -0)) return issue(valuePath, "negative zero does not round-trip canonically");
    return { ok: true, value };
  }

  if (typeof value !== "object") return issue(valuePath, `${typeof value} values are not JSON values`);
  if (ancestors.has(value)) return issue(valuePath, "circular references are not JSON values");
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length > 0) return issue(valuePath, "symbol properties are not supported");
      const keys = Object.keys(value);
      if (keys.some((key) => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) {
        return issue(valuePath, "arrays must not have custom enumerable properties");
      }

      const output: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = dataDescriptor(value, String(index));
        if (!descriptor) {
          return issue(`${valuePath}[${index}]`, "sparse slots and accessor properties are not supported");
        }
        const parsed = parseInternal(descriptor.value, `${valuePath}[${index}]`, ancestors, depth + 1);
        if (!parsed.ok) return parsed;
        output.push(parsed.value);
      }
      return { ok: true, value: output };
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return issue(valuePath, "only plain objects are supported");
    if (Object.getOwnPropertySymbols(value).length > 0) return issue(valuePath, "symbol properties are not supported");

    const keys = Object.keys(value);
    if (Object.getOwnPropertyNames(value).length !== keys.length) {
      return issue(valuePath, "non-enumerable properties are not supported");
    }

    const entries: Array<[string, JsonValue]> = [];
    for (const key of keys) {
      const descriptor = dataDescriptor(value, key);
      if (!descriptor) return issue(`${valuePath}.${key}`, "accessor properties are not supported");
      const parsed = parseInternal(descriptor.value, `${valuePath}.${key}`, ancestors, depth + 1);
      if (!parsed.ok) return parsed;
      entries.push([key, parsed.value]);
    }
    return { ok: true, value: Object.fromEntries(entries) as JsonObject };
  } finally {
    ancestors.delete(value);
  }
}

export function parseJsonValue(value: unknown, valuePath = "$" ): JsonValueParseResult {
  return parseInternal(value, valuePath, new Set(), 0);
}
