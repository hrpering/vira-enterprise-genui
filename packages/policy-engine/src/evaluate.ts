import {
  evaluateCapabilityAllowlist,
  evaluateComponentAllowlist,
  evaluateNetworkRequest,
} from "@vira-enterprise-genui/security";
import type {
  PolicyCheckKind,
  PolicyCheckResult,
  PolicyCheckValidationCode,
  PolicyDecision,
} from "./types.js";

const ARRAY_IS_ARRAY = Array.isArray;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

function failure(
  code: PolicyCheckValidationCode,
  path: string,
  message: string,
): PolicyCheckResult {
  return { ok: false, issue: { code, path, message } };
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || ARRAY_IS_ARRAY(value)) return false;
  const prototype = OBJECT_GET_PROTOTYPE_OF(value);
  return prototype === OBJECT_PROTOTYPE || prototype === null;
}

function ownData(object: object, key: PropertyKey): PropertyDescriptor | undefined {
  const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(object, key);
  return descriptor && OBJECT_HAS_OWN(descriptor, "value") ? descriptor : undefined;
}

function inputField(value: PropertyKey): value is "kind" | "policy" | "target" {
  return value === "kind" || value === "policy" || value === "target";
}

function policyCheckKind(value: unknown): value is PolicyCheckKind {
  return value === "capability" || value === "component" || value === "network";
}

function success(kind: PolicyCheckKind, decision: PolicyDecision): PolicyCheckResult {
  return {
    ok: true,
    value: OBJECT_FREEZE({ kind, decision }),
  };
}

function invalidDelegatedResult(
  issueCode: string,
): PolicyCheckResult {
  if (issueCode === "INVALID_POLICY") {
    return failure("INVALID_POLICY", "$.policy", "policy check policy is invalid");
  }
  return failure("INVALID_TARGET", "$.target", "policy check target is invalid");
}

export function evaluatePolicyCheck(input: unknown): PolicyCheckResult {
  try {
    if (!plainObject(input)) {
      return failure("INVALID_INPUT", "$", "policy check must be a plain object");
    }

    const keys = REFLECT_OWN_KEYS(input);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== "string") {
        return failure("INVALID_INPUT", "$", "policy check must not contain symbol properties");
      }
      if (!inputField(key)) {
        return failure("UNKNOWN_FIELD", "$", "policy check contains an unsupported field");
      }
      if (!ownData(input, key)) {
        return failure("INVALID_INPUT", `$.${key}`, "policy check fields must be own data properties");
      }
    }

    const kind = ownData(input, "kind")?.value;
    if (!policyCheckKind(kind)) {
      return failure("INVALID_KIND", "$.kind", "policy check kind is unsupported");
    }

    const policy = ownData(input, "policy")?.value;
    const target = ownData(input, "target")?.value;

    if (kind === "capability") {
      const result = evaluateCapabilityAllowlist(policy, target);
      if (!result.ok) return invalidDelegatedResult(result.issue.code);
      return success(kind, result.value.decision);
    }

    if (kind === "component") {
      const result = evaluateComponentAllowlist(policy, target);
      if (!result.ok) return invalidDelegatedResult(result.issue.code);
      return success(kind, result.value.decision);
    }

    const result = evaluateNetworkRequest(policy, target);
    if (!result.ok) return invalidDelegatedResult(result.issue.code);
    return success(kind, result.value.decision);
  } catch {
    return failure("INVALID_INPUT", "$", "policy check could not be inspected safely");
  }
}
