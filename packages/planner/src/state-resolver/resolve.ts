import {
  isSemanticSegment,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { readPlannerDataObject } from "../internal/data-object-input.js";
import { freezeJsonData } from "../internal/freeze-json.js";
import {
  STATE_RESOLVER_MAX_CANDIDATES,
  STATE_RESOLVER_MAX_REQUIREMENTS,
} from "./types.js";
import type {
  StateResolutionConflict,
  StateResolverResult,
  StateResolverValidationCode,
} from "./types.js";

const inputFields = new Set(["state", "required", "candidates"]);

function failure(code: StateResolverValidationCode, path: string, message: string): StateResolverResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(left: JsonValue, right: JsonValue): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      const leftValue = left[index];
      const rightValue = right[index];
      if (leftValue === undefined || rightValue === undefined || !jsonEqual(leftValue, rightValue)) return false;
    }
    return true;
  }

  if (typeof left !== "object" || typeof right !== "object") return false;
  const leftObject = left as JsonObject;
  const rightObject = right as JsonObject;
  const leftKeys = Object.keys(leftObject).sort();
  const rightKeys = Object.keys(rightObject).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (key === undefined || key !== rightKeys[index]) return false;
    const leftValue = leftObject[key];
    const rightValue = rightObject[key];
    if (leftValue === undefined || rightValue === undefined || !jsonEqual(leftValue, rightValue)) return false;
  }
  return true;
}

export function resolveState(input: unknown): StateResolverResult {
  const rawInput = readPlannerDataObject(input);
  if (!rawInput.ok) return failure("INVALID_TYPE", rawInput.issue.path, rawInput.issue.reason);

  const unknownField = Object.keys(rawInput.value).sort().find((field) => !inputFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown state resolver field: ${unknownField}`);

  const rawRequired = rawInput.value.required;
  if (!Array.isArray(rawRequired)) return failure("INVALID_REQUIRED", "$.required", "required must be an array of semantic field names");
  if (rawRequired.length > STATE_RESOLVER_MAX_REQUIREMENTS) {
    return failure(
      "REQUIREMENT_LIMIT_EXCEEDED",
      "$.required",
      `state resolver accepts at most ${STATE_RESOLVER_MAX_REQUIREMENTS} required fields`,
    );
  }

  if (Object.hasOwn(rawInput.value, "candidates")) {
    const rawCandidates = readPlannerDataObject(rawInput.value.candidates, "$.candidates");
    if (!rawCandidates.ok) return failure("INVALID_CANDIDATES", rawCandidates.issue.path, rawCandidates.issue.reason);
    if (Object.keys(rawCandidates.value).length > STATE_RESOLVER_MAX_CANDIDATES) {
      return failure(
        "CANDIDATE_LIMIT_EXCEEDED",
        "$.candidates",
        `state resolver accepts at most ${STATE_RESOLVER_MAX_CANDIDATES} candidate fields`,
      );
    }
  }

  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "state resolver input must be a canonical JSON object");
  const fields = parsed.value;

  if (!isJsonObject(fields.state)) return failure("INVALID_STATE", "$.state", "state must be a canonical JSON object");
  if (!Array.isArray(fields.required)) return failure("INVALID_REQUIRED", "$.required", "required must be an array of semantic field names");

  const required: string[] = [];
  const requiredSet = new Set<string>();
  for (let index = 0; index < fields.required.length; index += 1) {
    const field = fields.required[index];
    if (typeof field !== "string" || !isSemanticSegment(field)) {
      return failure("INVALID_REQUIRED", `$.required[${index}]`, "required field must be a lower-case semantic segment");
    }
    if (requiredSet.has(field)) {
      return failure("DUPLICATE_REQUIREMENT", `$.required[${index}]`, `duplicate required field: ${field}`);
    }
    requiredSet.add(field);
    required.push(field);
  }

  const candidatesValue = Object.hasOwn(fields, "candidates") ? fields.candidates : {};
  if (!isJsonObject(candidatesValue)) {
    return failure("INVALID_CANDIDATES", "$.candidates", "candidates must be a canonical JSON object");
  }

  for (const field of Object.keys(candidatesValue).sort()) {
    if (!isSemanticSegment(field)) {
      return failure("INVALID_CANDIDATES", `$.candidates.${field}`, "candidate field must be a lower-case semantic segment");
    }
    if (!requiredSet.has(field)) {
      return failure("UNREQUESTED_CANDIDATE", `$.candidates.${field}`, `candidate field was not declared as required: ${field}`);
    }
  }

  const resolvedState: Record<string, JsonValue> = { ...fields.state };
  const known: string[] = [];
  const missing: string[] = [];
  const conflicts: StateResolutionConflict[] = [];

  for (const field of required) {
    const hasCurrent = Object.hasOwn(fields.state, field);
    const hasCandidate = Object.hasOwn(candidatesValue, field);

    if (!hasCurrent && !hasCandidate) {
      missing.push(field);
      continue;
    }

    if (hasCurrent && hasCandidate) {
      const current = fields.state[field];
      const candidate = candidatesValue[field];
      if (current === undefined || candidate === undefined) {
        return failure("INVALID_TYPE", `$.${field}`, "canonical JSON fields must have defined values");
      }
      if (!jsonEqual(current, candidate)) {
        conflicts.push({ field, current, candidate });
        continue;
      }
      known.push(field);
      continue;
    }

    if (hasCandidate) {
      const candidate = candidatesValue[field];
      if (candidate === undefined) return failure("INVALID_TYPE", `$.candidates.${field}`, "candidate must have a defined value");
      resolvedState[field] = candidate;
    }
    known.push(field);
  }

  const frozenState = freezeJsonData(resolvedState as JsonObject);
  for (const conflict of conflicts) {
    freezeJsonData(conflict.current);
    freezeJsonData(conflict.candidate);
    Object.freeze(conflict);
  }

  return {
    ok: true,
    value: Object.freeze({
      state: frozenState,
      known: Object.freeze(known),
      missing: Object.freeze(missing),
      conflicts: Object.freeze(conflicts),
    }),
  };
}
