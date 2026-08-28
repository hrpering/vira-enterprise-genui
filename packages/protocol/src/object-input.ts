export interface DataObjectInputIssue {
  readonly path: string;
  readonly reason: string;
}

export type DataObjectInputResult =
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly issue: DataObjectInputIssue };

function failure(path: string, reason: string): DataObjectInputResult {
  return { ok: false, issue: { path, reason } };
}

export function readDataObjectInput(value: unknown, valuePath = "$" ): DataObjectInputResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return failure(valuePath, "expected a plain object");
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return failure(valuePath, "expected a plain object");
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    return failure(valuePath, "symbol fields are not supported");
  }

  const enumerableFields = Object.keys(value);
  if (Object.getOwnPropertyNames(value).length !== enumerableFields.length) {
    return failure(valuePath, "non-enumerable fields are not supported");
  }

  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const field of enumerableFields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !("value" in descriptor)) {
      return failure(`${valuePath}.${field}`, "accessor fields are not supported");
    }
    output[field] = descriptor.value;
  }

  return { ok: true, value: output };
}
