import {
  COMPONENT_ALLOWLIST_KEY_MAX_LENGTH,
  COMPONENT_ALLOWLIST_MAX_ENTRIES,
  COMPONENT_ALLOWLIST_POLICY_VERSION,
} from "./types.js";
import type {
  ComponentAllowlistEvaluationResult,
  ComponentAllowlistPolicyResult,
  ComponentAllowlistPolicyValidationCode,
} from "./types.js";

const policyFields = new Set(["version", "allowed"]);
const arrayIndexPattern = /^(0|[1-9]\d*)$/;

function policyFailure(
  code: ComponentAllowlistPolicyValidationCode,
  path: string,
  message: string,
): ComponentAllowlistPolicyResult {
  return { ok: false, issue: { code, path, message } };
}

function ownDataProperty(object: object, key: PropertyKey): PropertyDescriptor | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !("value" in descriptor)) return undefined;
  return descriptor;
}

function validComponentKey(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= COMPONENT_ALLOWLIST_KEY_MAX_LENGTH;
}

function unexpectedArrayProperty(array: readonly unknown[]): string | symbol | undefined {
  const symbol = Object.getOwnPropertySymbols(array)[0];
  if (symbol) return symbol;
  return Object.getOwnPropertyNames(array).find((key) => {
    if (key === "length") return false;
    if (!arrayIndexPattern.test(key)) return true;
    return Number(key) >= array.length;
  });
}

export function createComponentAllowlistPolicy(input: unknown): ComponentAllowlistPolicyResult {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return policyFailure("INVALID_INPUT", "$", "component allowlist policy must be an object");
    }

    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      return policyFailure("INVALID_INPUT", "$", "component allowlist policy must be a plain object");
    }
    if (Object.getOwnPropertySymbols(input).length > 0) {
      return policyFailure("INVALID_INPUT", "$", "component allowlist policy must not contain symbol properties");
    }

    const ownNames = Object.getOwnPropertyNames(input);
    const unknown = ownNames.sort().find((field) => !policyFields.has(field));
    if (unknown) return policyFailure("UNKNOWN_FIELD", `$.${unknown}`, "component allowlist policy contains an unknown field");

    const version = ownDataProperty(input, "version");
    if (!version || version.value !== COMPONENT_ALLOWLIST_POLICY_VERSION) {
      return policyFailure("INVALID_VERSION", "$.version", `component allowlist policy version must be ${COMPONENT_ALLOWLIST_POLICY_VERSION}`);
    }

    const allowed = ownDataProperty(input, "allowed");
    if (!allowed || !Array.isArray(allowed.value)) {
      return policyFailure("INVALID_ALLOWED", "$.allowed", "allowed must be a dense array of exact component keys");
    }
    if (allowed.value.length > COMPONENT_ALLOWLIST_MAX_ENTRIES) {
      return policyFailure(
        "ENTRY_LIMIT_EXCEEDED",
        "$.allowed",
        `component allowlist may contain at most ${COMPONENT_ALLOWLIST_MAX_ENTRIES} entries`,
      );
    }
    const unexpected = unexpectedArrayProperty(allowed.value);
    if (unexpected !== undefined) {
      const path = typeof unexpected === "string" ? `$.allowed.${unexpected}` : "$.allowed";
      return policyFailure("INVALID_ALLOWED", path, "allowed must not contain custom or symbol properties");
    }

    const normalized: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < allowed.value.length; index += 1) {
      const descriptor = ownDataProperty(allowed.value, String(index));
      if (!descriptor) {
        return policyFailure("INVALID_ALLOWED", `$.allowed[${index}]`, "allowed entries must be dense own data properties");
      }
      const key = descriptor.value;
      if (!validComponentKey(key)) {
        return policyFailure(
          "INVALID_KEY",
          `$.allowed[${index}]`,
          `component key must be a non-empty string of at most ${COMPONENT_ALLOWLIST_KEY_MAX_LENGTH} characters`,
        );
      }
      if (seen.has(key)) {
        return policyFailure("DUPLICATE_KEY", `$.allowed[${index}]`, "component allowlist contains a duplicate exact key");
      }
      seen.add(key);
      normalized.push(key);
    }

    return {
      ok: true,
      value: Object.freeze({
        version: COMPONENT_ALLOWLIST_POLICY_VERSION,
        allowed: Object.freeze(normalized),
      }),
    };
  } catch {
    return policyFailure("INVALID_INPUT", "$", "component allowlist policy could not be inspected safely");
  }
}

export function evaluateComponentAllowlist(
  policyInput: unknown,
  componentKeyInput: unknown,
): ComponentAllowlistEvaluationResult {
  const policy = createComponentAllowlistPolicy(policyInput);
  if (!policy.ok) {
    return {
      ok: false,
      issue: {
        code: "INVALID_POLICY",
        path: policy.issue.path === "$" ? "$.policy" : `$.policy${policy.issue.path.slice(1)}`,
        message: "component allowlist policy is invalid",
      },
    };
  }

  if (!validComponentKey(componentKeyInput)) {
    return {
      ok: false,
      issue: {
        code: "INVALID_COMPONENT_KEY",
        path: "$.componentKey",
        message: "component key must be a bounded non-empty string supplied by the validated component owner",
      },
    };
  }

  return {
    ok: true,
    value: Object.freeze({
      componentKey: componentKeyInput,
      decision: policy.value.allowed.includes(componentKeyInput) ? "allow" : "deny",
    }),
  };
}
