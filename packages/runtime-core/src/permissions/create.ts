import { isSemanticNamespace, parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { deepFreezeData } from "../internal/deep-freeze.js";
import {
  RUNTIME_PERMISSION_EFFECTS,
  RUNTIME_PERMISSION_MAX_RULES,
  RUNTIME_PERMISSION_POLICY_VERSION,
  RUNTIME_PERMISSION_SUBJECTS,
} from "./types.js";
import type {
  RuntimePermissionEffect,
  RuntimePermissionPolicy,
  RuntimePermissionPolicyCreateResult,
  RuntimePermissionPolicyValidationCode,
  RuntimePermissionRule,
  RuntimePermissionSubject,
} from "./types.js";

const policyFields = new Set(["version", "rules"]);
const ruleFields = new Set(["subject", "id", "effect"]);

function failure(
  code: RuntimePermissionPolicyValidationCode,
  path: string,
  message: string,
): RuntimePermissionPolicyCreateResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSubject(value: unknown): value is RuntimePermissionSubject {
  return typeof value === "string" && RUNTIME_PERMISSION_SUBJECTS.includes(value as RuntimePermissionSubject);
}

function isEffect(value: unknown): value is RuntimePermissionEffect {
  return typeof value === "string" && RUNTIME_PERMISSION_EFFECTS.includes(value as RuntimePermissionEffect);
}

export function createRuntimePermissionPolicy(input: unknown): RuntimePermissionPolicyCreateResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "permission policy must be a canonical JSON object");
  const fields = parsed.value;

  const unknownField = Object.keys(fields).sort().find((field) => !policyFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown permission policy field: ${unknownField}`);

  if (fields.version !== RUNTIME_PERMISSION_POLICY_VERSION) {
    return failure("INVALID_VERSION", "$.version", `permission policy version must be ${RUNTIME_PERMISSION_POLICY_VERSION}`);
  }
  if (!Array.isArray(fields.rules)) return failure("INVALID_RULES", "$.rules", "permission policy rules must be an array");
  if (fields.rules.length > RUNTIME_PERMISSION_MAX_RULES) {
    return failure(
      "RULE_LIMIT_EXCEEDED",
      "$.rules",
      `permission policy may contain at most ${RUNTIME_PERMISSION_MAX_RULES} rules`,
    );
  }

  const rules: RuntimePermissionRule[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < fields.rules.length; index += 1) {
    const rawRule = fields.rules[index];
    if (!isJsonObject(rawRule)) {
      return failure("INVALID_RULE", `$.rules[${index}]`, "permission rule must be a canonical JSON object");
    }

    const unknownRuleField = Object.keys(rawRule).sort().find((field) => !ruleFields.has(field));
    if (unknownRuleField) {
      return failure(
        "INVALID_RULE",
        `$.rules[${index}].${unknownRuleField}`,
        `unknown permission rule field: ${unknownRuleField}`,
      );
    }
    if (!isSubject(rawRule.subject)) {
      return failure("INVALID_RULE", `$.rules[${index}].subject`, "permission subject must be action or capability");
    }
    if (typeof rawRule.id !== "string" || !isSemanticNamespace(rawRule.id)) {
      return failure("INVALID_RULE", `$.rules[${index}].id`, "permission rule id must be a lower-case semantic namespace");
    }
    if (!isEffect(rawRule.effect)) {
      return failure("INVALID_RULE", `$.rules[${index}].effect`, "permission effect must be allow, deny, or confirm");
    }

    const key = `${rawRule.subject}:${rawRule.id}`;
    if (seen.has(key)) {
      return failure("DUPLICATE_RULE", `$.rules[${index}].id`, `duplicate permission rule for ${key}`);
    }
    seen.add(key);
    rules.push({ subject: rawRule.subject, id: rawRule.id, effect: rawRule.effect });
  }

  const policy: RuntimePermissionPolicy = {
    version: RUNTIME_PERMISSION_POLICY_VERSION,
    rules: deepFreezeData(rules),
  };
  return { ok: true, value: Object.freeze(policy) };
}
