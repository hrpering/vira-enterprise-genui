import { createTelemetryEvent } from "@vira-enterprise-genui/telemetry";
import type {
  ExperienceObservationDefinition,
  ExperienceObservationName,
  ExperienceObservationResult,
  ExperienceObservationValidationCode,
} from "./types.js";
import { EXPERIENCE_OBSERVATION_NAMES } from "./types.js";

const INPUT_FIELDS = new Set(["name", "source", "occurredAt"]);
const OBSERVATION_NAME_SET = new Set<ExperienceObservationName>(EXPERIENCE_OBSERVATION_NAMES);

const DEFINITIONS: Readonly<Record<ExperienceObservationName, ExperienceObservationDefinition>> = Object.freeze({
  "experience.requested": Object.freeze({
    name: "experience.requested",
    kind: "lifecycle",
    outcome: "neutral",
  }),
  "experience.planned": Object.freeze({
    name: "experience.planned",
    kind: "lifecycle",
    outcome: "success",
  }),
  "experience.render.started": Object.freeze({
    name: "experience.render.started",
    kind: "lifecycle",
    outcome: "neutral",
  }),
  "experience.render.completed": Object.freeze({
    name: "experience.render.completed",
    kind: "lifecycle",
    outcome: "success",
  }),
  "experience.render.failed": Object.freeze({
    name: "experience.render.failed",
    kind: "error",
    outcome: "failure",
  }),
  "experience.action.started": Object.freeze({
    name: "experience.action.started",
    kind: "action",
    outcome: "neutral",
  }),
  "experience.action.completed": Object.freeze({
    name: "experience.action.completed",
    kind: "action",
    outcome: "success",
  }),
  "experience.action.denied": Object.freeze({
    name: "experience.action.denied",
    kind: "security",
    outcome: "failure",
  }),
  "experience.view.changed": Object.freeze({
    name: "experience.view.changed",
    kind: "lifecycle",
    outcome: "neutral",
  }),
  "experience.binding.resolved": Object.freeze({
    name: "experience.binding.resolved",
    kind: "integration",
    outcome: "success",
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

export function createExperienceObservation(input: unknown): ExperienceObservationResult {
  try {
    if (!plainObject(input)) {
      return failure("INVALID_INPUT", "$", "experience observation must be a plain object");
    }
    if (Object.getOwnPropertySymbols(input).length > 0) {
      return failure("INVALID_INPUT", "$", "experience observation must not contain symbol properties");
    }

    const propertyNames = Object.getOwnPropertyNames(input).sort();
    if (propertyNames.some((field) => !INPUT_FIELDS.has(field))) {
      return failure("UNKNOWN_FIELD", "$", "experience observation contains an unsupported field");
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
    const source = ownData(input, "source")?.value;
    const occurredAt = ownData(input, "occurredAt")?.value;
    return createTelemetryEvent({
      version: "1",
      name: definition.name,
      source,
      kind: definition.kind,
      outcome: definition.outcome,
      occurredAt,
    });
  } catch {
    return failure("INVALID_INPUT", "$", "experience observation could not be inspected safely");
  }
}
