import {
  EXPERIENCE_PLAN_PROTOCOL_VERSION,
  parseExperiencePlan,
  parseIntent,
} from "@vira-enterprise-genui/protocol";
import { resolveCapabilities } from "../capability-resolver/index.js";
import { freezePlannerData } from "../internal/freeze-json.js";
import { readPlannerDataObject } from "../internal/data-object-input.js";
import { resolveState } from "../state-resolver/index.js";
import type {
  ExperiencePlannerResult,
  ExperiencePlannerValidationCode,
} from "./types.js";

const inputFields = new Set([
  "id",
  "intent",
  "state",
  "requiredState",
  "candidateState",
  "capabilityRequirements",
  "availableCapabilities",
  "futureCapabilities",
]);

function failure(code: ExperiencePlannerValidationCode, path: string, message: string): ExperiencePlannerResult {
  return { ok: false, issue: { code, path, message } };
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

function remapStatePath(path: string): string {
  if (path === "$.required" || path.startsWith("$.required[")) return path.replace("$.required", "$.requiredState");
  if (path === "$.candidates" || path.startsWith("$.candidates.")) return path.replace("$.candidates", "$.candidateState");
  return path;
}

function remapCapabilityPath(path: string): string {
  if (path === "$.requirements" || path.startsWith("$.requirements[")) {
    return path.replace("$.requirements", "$.capabilityRequirements");
  }
  if (path === "$.available" || path.startsWith("$.available[")) {
    return path.replace("$.available", "$.availableCapabilities");
  }
  if (path === "$.future" || path.startsWith("$.future[")) {
    return path.replace("$.future", "$.futureCapabilities");
  }
  if (path.startsWith("$.missing") || path.startsWith("$.conflicts")) return "$.state";
  return path;
}

export function planExperience(input: unknown): ExperiencePlannerResult {
  const raw = readPlannerDataObject(input);
  if (!raw.ok) return failure("INVALID_TYPE", raw.issue.path, raw.issue.reason);

  const unknownField = Object.keys(raw.value).sort().find((field) => !inputFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown experience planner field: ${unknownField}`);

  const intent = parseIntent(raw.value.intent);
  if (!intent.ok) return failure("INVALID_INTENT", nestedPath("$.intent", intent.issue.path), intent.issue.message);

  const stateInput: Record<string, unknown> = {
    state: raw.value.state,
    required: raw.value.requiredState,
  };
  if (Object.hasOwn(raw.value, "candidateState")) stateInput.candidates = raw.value.candidateState;

  const state = resolveState(stateInput);
  if (!state.ok) {
    return failure("STATE_RESOLUTION_FAILED", remapStatePath(state.issue.path), state.issue.message);
  }

  const capabilityInput: Record<string, unknown> = {
    missing: state.value.missing,
    conflicts: state.value.conflicts.map((conflict) => conflict.field),
    requirements: raw.value.capabilityRequirements,
  };
  if (Object.hasOwn(raw.value, "availableCapabilities")) capabilityInput.available = raw.value.availableCapabilities;
  if (Object.hasOwn(raw.value, "futureCapabilities")) capabilityInput.future = raw.value.futureCapabilities;

  const capabilities = resolveCapabilities(capabilityInput);
  if (!capabilities.ok) {
    return failure("CAPABILITY_RESOLUTION_FAILED", remapCapabilityPath(capabilities.issue.path), capabilities.issue.message);
  }

  const plan = parseExperiencePlan({
    version: EXPERIENCE_PLAN_PROTOCOL_VERSION,
    id: raw.value.id,
    intent: intent.value,
    state: state.value.state,
    capabilities: capabilities.value,
  });
  if (!plan.ok) return failure("INVALID_PLAN", plan.issue.path, plan.issue.message);

  return { ok: true, value: freezePlannerData(plan.value) };
}
