import { parseCapability } from "@vira-enterprise-genui/protocol";
import type { Capability } from "@vira-enterprise-genui/protocol";
import { createRuntimeAction } from "../actions/index.js";
import type { RuntimeAction } from "../actions/index.js";
import type {
  RuntimePermissionDecision,
  RuntimePermissionEvaluationResult,
  RuntimePermissionPolicy,
  RuntimePermissionSubject,
} from "./types.js";

function decision(
  policy: RuntimePermissionPolicy,
  subject: RuntimePermissionSubject,
  id: string,
): RuntimePermissionDecision {
  const rule = policy.rules.find((candidate) => candidate.subject === subject && candidate.id === id);
  return Object.freeze({
    effect: rule?.effect ?? "deny",
    reason: rule ? "matched-rule" : "default-deny",
    subject,
    id,
  });
}

export function evaluateRuntimeActionPermission(
  policy: RuntimePermissionPolicy,
  actionInput: RuntimeAction,
): RuntimePermissionEvaluationResult {
  const action = createRuntimeAction(actionInput);
  if (!action.ok) {
    return {
      ok: false,
      issue: {
        code: "INVALID_ACTION",
        path: action.issue.path,
        message: action.issue.message,
      },
    };
  }
  return { ok: true, value: decision(policy, "action", action.value.type) };
}

export function evaluateRuntimeCapabilityPermission(
  policy: RuntimePermissionPolicy,
  capabilityInput: Capability,
): RuntimePermissionEvaluationResult {
  const capability = parseCapability(capabilityInput);
  if (!capability.ok) {
    return {
      ok: false,
      issue: {
        code: "INVALID_CAPABILITY",
        path: capability.issue.path,
        message: capability.issue.message,
      },
    };
  }
  return { ok: true, value: decision(policy, "capability", capability.value.id) };
}
