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
import { POLICY_CHECK_KINDS } from "./types.js";

const INPUT_FIELDS = new Set(["kind", "policy", "target"]);
const KIND_SET = new Set<PolicyCheckKind>(POLICY_CHECK_KINDS);

function failure(
  code: PolicyCheckValidationCode,
  path: string,
  message: string,
): PolicyCheckResult {
  return { ok: false, issue: { code, path, message } };
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownData(object: object, key: PropertyKey): PropertyDescriptor | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && "value" in descriptor ? descriptor : undefined;
}

function policyCheckKind(value: unknown): value is PolicyCheckKind {
  return typeof value === "string" && KIND_SET.has(value as PolicyCheckKind);
}

function success(kind: PolicyCheckKind, decision: PolicyDecision): PolicyCheckResult {
  return {
    ok: true,
    value: Object.freeze({ kind, decision }),
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
    if (Object.getOwnPropertySymbols(input).length > 0) {
      return failure("INVALID_INPUT", "$", "policy check must not contain symbol properties");
    }

    const propertyNames = Object.getOwnPropertyNames(input).sort();
    if (propertyNames.some((field) => !INPUT_FIELDS.has(field))) {
      return failure("UNKNOWN_FIELD", "$", "policy check contains an unsupported field");
    }

    for (const field of propertyNames) {
      if (!ownData(input, field)) {
        return failure("INVALID_INPUT", `$.${field}`, "policy check fields must be own data properties");
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
