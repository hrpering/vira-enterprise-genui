import { createTelemetryEvent } from "@vira-enterprise-genui/telemetry";
import type {
  ExperienceObservationDefinition,
  ExperienceObservationName,
  ExperienceObservationResult,
  ExperienceObservationValidationCode,
} from "./types.js";
import { EXPERIENCE_OBSERVATION_NAMES } from "./types.js";

const INPUT_FIELDS = new Set(["name", "source", "occurredAt", "durationMs"]);
const OBSERVATION_NAME_SET = new Set<ExperienceObservationName>(EXPERIENCE_OBSERVATION_NAMES);

const DEFINITIONS: Readonly<Record<ExperienceObservationName, ExperienceObservationDefinition>> = Object.freeze({
  "experience.requested": Object.freeze({
    name: "experience.requested",
    kind: "lifecycle",
    outcome: "neutral",
    duration: "forbidden",
  }),
  "experience.planned": Object.freeze({
    name: "experience.planned",
    kind: "lifecycle",
    outcome: "success",
    duration: "forbidden",
  }),
  "experience.render.started": Object.freeze({
    name: "experience.render.started",
    kind: "lifecycle",
    outcome: "neutral",
    duration: "forbidden",
  }),
  "experience.render.completed": Object.freeze({
    name: "experience.render.completed",
    kind: "lifecycle",
    outcome: "success",
    duration: "forbidden",
  }),
  "experience.render.failed": Object.freeze({
    name: "experience.render.failed",
    kind: "error",
    outcome: "failure",
    duration: "forbidden",
  }),
  "experience.action.started": Object.freeze({
    name: "experience.action.started",
    kind: "action",
    outcome: "neutral",
    duration: "forbidden",
  }),
  "experience.action.completed": Object.freeze({
    name: "experience.action.completed",
    kind: "action",
    outcome: "success",
    duration: "forbidden",
  }),
  "experience.action.denied": Object.freeze({
    name: "experience.action.denied",
    kind: "security",
    outcome: "failure",
    duration: "forbidden",
  }),
  "experience.view.changed": Object.freeze({
    name: "experience.view.changed",
    kind: "lifecycle",
    outcome: "neutral",
    duration: "forbidden",
  }),
  "experience.binding.resolved": Object.freeze({
    name: "experience.binding.resolved",
    kind: "integration",
    outcome: "success",
    duration: "forbidden",
  }),
  "experience.interactive": Object.freeze({
    name: "experience.interactive",
    kind: "performance",
    outcome: "success",
    duration: "required",
  }),
});

function failure(
  code: ExperienceObservationValidationCode,
  path: string,
  message: string,
): ExperienceObservationResult {
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

function observationName(value: unknown): value is ExperienceObservationName {
  return typeof value === "string" && OBSERVATION_NAME_SET.has(value as ExperienceObservationName);
}

export function getExperienceObservationDefinition(
  name: ExperienceObservationName,
): ExperienceObservationDefinition {
  return DEFINITIONS[name];
}

export function createExperienceObservation(input: unknown): ExperienceObservationResult {
  try {
    if (!plainObject(input)) {
      return failure("INVALID_INPUT", "$", "experience observation must be a plain object");
    }
    if (Object.getOwnPropertySymbols(input).length > 0) {
      return failure("INVALID_INPUT", "$", "experience observation must not contain symbol properties");
    }

    const propertyNames = Object.getOwnPropertyNames(input).sort();
    const unknownField = propertyNames.find((field) => !INPUT_FIELDS.has(field));
    if (unknownField) {
      return failure("UNKNOWN_FIELD", `$.${unknownField}`, "experience observation contains an unsupported field");
    }
    for (const field of propertyNames) {
      if (!ownData(input, field)) {
        return failure("INVALID_INPUT", `$.${field}`, "experience observation fields must be own data properties");
      }
    }

    const name = ownData(input, "name")?.value;
    if (!observationName(name)) {
      return failure("INVALID_OBSERVATION_NAME", "$.name", "experience observation name is unsupported");
    }
    const definition = DEFINITIONS[name];
    const hasDuration = Object.hasOwn(input, "durationMs");
    if (definition.duration === "required" && !hasDuration) {
      return failure("DURATION_REQUIRED", "$.durationMs", `${name} requires durationMs`);
    }
    if (definition.duration === "forbidden" && hasDuration) {
      return failure("DURATION_NOT_ALLOWED", "$.durationMs", `${name} is a point-in-time observation and must not contain durationMs`);
    }

    const source = ownData(input, "source")?.value;
    const occurredAt = ownData(input, "occurredAt")?.value;
    const durationMs = ownData(input, "durationMs")?.value;
    const telemetryResult = createTelemetryEvent({
      version: "1",
      name: definition.name,
      source,
      kind: definition.kind,
      outcome: definition.outcome,
      occurredAt,
      ...(hasDuration ? { durationMs } : {}),
    });
    return telemetryResult;
  } catch {
    return failure("INVALID_INPUT", "$", "experience observation could not be inspected safely");
  }
}
