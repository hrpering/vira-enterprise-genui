export const JSON_VALUE_MAX_DEPTH = 64 as const;
export const JSON_VALUE_MAX_NODES = 100_000 as const;
export const JSON_VALUE_MAX_ARRAY_LENGTH = 50_000 as const;
export const JSON_VALUE_MAX_OBJECT_KEYS = 50_000 as const;
export const JSON_VALUE_MAX_OBJECT_KEY_LENGTH = 4_096 as const;
export const JSON_VALUE_MAX_STRING_LENGTH = 1_048_576 as const;
export const JSON_VALUE_MAX_TOTAL_STRING_LENGTH = 4_194_304 as const;

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

interface JsonValueBudget {
  nodes: number;
  totalStringLength: number;
}

function issue(path: string, reason: string): JsonValueParseResult {
  return { ok: false, issue: { path, reason } };
}

function dataDescriptor(object: object, key: PropertyKey): PropertyDescriptor | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !("value" in descriptor)) return undefined;
  return descriptor;
}

function consumeStringBudget(length: number, path: string, budget: JsonValueBudget): JsonValueParseResult | undefined {
  budget.totalStringLength += length;
  if (budget.totalStringLength > JSON_VALUE_MAX_TOTAL_STRING_LENGTH) {
    return issue(path, `maximum aggregate string length ${JSON_VALUE_MAX_TOTAL_STRING_LENGTH} exceeded`);
  }
  return undefined;
}

function parseInternal(
  value: unknown,
  valuePath: string,
  ancestors: Set<object>,
  depth: number,
  budget: JsonValueBudget,
): JsonValueParseResult {
  if (depth > JSON_VALUE_MAX_DEPTH) {
    return issue(valuePath, `maximum nesting depth ${JSON_VALUE_MAX_DEPTH} exceeded`);
  }

  budget.nodes += 1;
  if (budget.nodes > JSON_VALUE_MAX_NODES) {
    return issue(valuePath, `maximum JSON node count ${JSON_VALUE_MAX_NODES} exceeded`);
  }

  if (value === null || typeof value === "boolean") {
    return { ok: true, value };
  }

  if (typeof value === "string") {
    if (value.length > JSON_VALUE_MAX_STRING_LENGTH) {
      return issue(valuePath, `maximum string length ${JSON_VALUE_MAX_STRING_LENGTH} exceeded`);
    }
    const budgetIssue = consumeStringBudget(value.length, valuePath, budget);
    if (budgetIssue) return budgetIssue;
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
      if (value.length > JSON_VALUE_MAX_ARRAY_LENGTH) {
        return issue(valuePath, `maximum array length ${JSON_VALUE_MAX_ARRAY_LENGTH} exceeded`);
      }
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
        const parsed = parseInternal(descriptor.value, `${valuePath}[${index}]`, ancestors, depth + 1, budget);
        if (!parsed.ok) return parsed;
        output.push(parsed.value);
      }
      return { ok: true, value: output };
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return issue(valuePath, "only plain objects are supported");
    if (Object.getOwnPropertySymbols(value).length > 0) return issue(valuePath, "symbol properties are not supported");

    const keys = Object.keys(value);
    if (keys.length > JSON_VALUE_MAX_OBJECT_KEYS) {
      return issue(valuePath, `maximum object key count ${JSON_VALUE_MAX_OBJECT_KEYS} exceeded`);
    }
    if (Object.getOwnPropertyNames(value).length !== keys.length) {
      return issue(valuePath, "non-enumerable properties are not supported");
    }

    const entries: Array<[string, JsonValue]> = [];
    for (const key of keys) {
      if (key.length > JSON_VALUE_MAX_OBJECT_KEY_LENGTH) {
        return issue(valuePath, `maximum object key length ${JSON_VALUE_MAX_OBJECT_KEY_LENGTH} exceeded`);
      }
      const budgetIssue = consumeStringBudget(key.length, valuePath, budget);
      if (budgetIssue) return budgetIssue;
      const descriptor = dataDescriptor(value, key);
      if (!descriptor) return issue(`${valuePath}.${key}`, "accessor properties are not supported");
      const parsed = parseInternal(descriptor.value, `${valuePath}.${key}`, ancestors, depth + 1, budget);
      if (!parsed.ok) return parsed;
      entries.push([key, parsed.value]);
    }
    return { ok: true, value: Object.fromEntries(entries) as JsonObject };
  } catch {
    return issue(valuePath, "value could not be inspected safely");
  } finally {
    ancestors.delete(value);
  }
}

export function parseJsonValue(value: unknown, valuePath = "$" ): JsonValueParseResult {
  return parseInternal(value, valuePath, new Set(), 0, { nodes: 0, totalStringLength: 0 });
}
