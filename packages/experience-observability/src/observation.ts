import { createTelemetryEvent } from "@vira-enterprise-genui/telemetry";
import type {
  ExperienceObservationDefinition,
  ExperienceObservationName,
  ExperienceObservationResult,
  ExperienceObservationValidationCode,
} from "./types.js";
import { EXPERIENCE_OBSERVATION_NAMES } from "./types.js";

const ARRAY_IS_ARRAY = Array.isArray;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;

const DEFINITIONS: Readonly<Record<ExperienceObservationName, ExperienceObservationDefinition>> = OBJECT_FREEZE({
  "experience.requested": OBJECT_FREEZE({
    name: "experience.requested",
    kind: "lifecycle",
    outcome: "neutral",
  }),
  "experience.planned": OBJECT_FREEZE({
    name: "experience.planned",
    kind: "lifecycle",
    outcome: "success",
  }),
  "experience.render.started": OBJECT_FREEZE({
    name: "experience.render.started",
    kind: "lifecycle",
    outcome: "neutral",
  }),
  "experience.render.completed": OBJECT_FREEZE({
    name: "experience.render.completed",
    kind: "lifecycle",
    outcome: "success",
  }),
  "experience.render.failed": OBJECT_FREEZE({
    name: "experience.render.failed",
    kind: "error",
    outcome: "failure",
  }),
  "experience.action.started": OBJECT_FREEZE({
    name: "experience.action.started",
    kind: "action",
    outcome: "neutral",
  }),
  "experience.action.completed": OBJECT_FREEZE({
    name: "experience.action.completed",
    kind: "action",
    outcome: "success",
  }),
  "experience.action.denied": OBJECT_FREEZE({
    name: "experience.action.denied",
    kind: "security",
    outcome: "failure",
  }),
  "experience.view.changed": OBJECT_FREEZE({
    name: "experience.view.changed",
    kind: "lifecycle",
    outcome: "neutral",
  }),
  "experience.binding.resolved": OBJECT_FREEZE({
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
  if (value === null || typeof value !== "object" || ARRAY_IS_ARRAY(value)) return false;
  const prototype = OBJECT_GET_PROTOTYPE_OF(value);
  return prototype === OBJECT_PROTOTYPE || prototype === null;
}

function ownData(object: object, key: PropertyKey): PropertyDescriptor | undefined {
  const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(object, key);
  return descriptor && OBJECT_HAS_OWN(descriptor, "value") ? descriptor : undefined;
}

function inputField(value: PropertyKey): value is "name" | "source" | "occurredAt" {
  return value === "name" || value === "source" || value === "occurredAt";
}

function observationName(value: unknown): value is ExperienceObservationName {
  if (typeof value !== "string") return false;
  for (let index = 0; index < EXPERIENCE_OBSERVATION_NAMES.length; index += 1) {
    if (EXPERIENCE_OBSERVATION_NAMES[index] === value) return true;
  }
  return false;
}

export function createExperienceObservation(input: unknown): ExperienceObservationResult {
  try {
    if (!plainObject(input)) {
      return failure("INVALID_INPUT", "$", "experience observation must be a plain object");
    }

    const keys = REFLECT_OWN_KEYS(input);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== "string") {
        return failure("INVALID_INPUT", "$", "experience observation must not contain symbol properties");
      }
      if (!inputField(key)) {
        return failure("UNKNOWN_FIELD", "$", "experience observation contains an unsupported field");
      }
      if (!ownData(input, key)) {
        return failure("INVALID_INPUT", `$.${key}`, "experience observation fields must be own data properties");
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
