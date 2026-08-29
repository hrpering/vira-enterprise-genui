import {
  TELEMETRY_DURATION_MAX_MS,
  TELEMETRY_EVENT_NAME_MAX_LENGTH,
  TELEMETRY_EVENT_VERSION,
  TELEMETRY_KINDS,
  TELEMETRY_OUTCOMES,
  TELEMETRY_SOURCES,
} from "./types.js";
import type {
  TelemetryEvent,
  TelemetryEventResult,
  TelemetryEventValidationCode,
  TelemetryKind,
  TelemetryOutcome,
  TelemetrySource,
} from "./types.js";

const inputFields = new Set([
  "version",
  "name",
  "source",
  "kind",
  "outcome",
  "occurredAt",
  "durationMs",
]);
const eventNamePattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const canonicalUtcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function failure(
  code: TelemetryEventValidationCode,
  path: string,
  message: string,
): TelemetryEventResult {
  return { ok: false, issue: { code, path, message } };
}

function ownData(object: object, key: PropertyKey): PropertyDescriptor | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !("value" in descriptor)) return undefined;
  return descriptor;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSource(value: unknown): value is TelemetrySource {
  return typeof value === "string" && TELEMETRY_SOURCES.includes(value as TelemetrySource);
}

function isKind(value: unknown): value is TelemetryKind {
  return typeof value === "string" && TELEMETRY_KINDS.includes(value as TelemetryKind);
}

function isOutcome(value: unknown): value is TelemetryOutcome {
  return typeof value === "string" && TELEMETRY_OUTCOMES.includes(value as TelemetryOutcome);
}

function isCanonicalOccurredAt(value: unknown): value is string {
  if (typeof value !== "string" || !canonicalUtcTimestampPattern.test(value)) return false;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return false;
  return new Date(milliseconds).toISOString() === value;
}

export function createTelemetryEvent(input: unknown): TelemetryEventResult {
  if (!plainObject(input)) return failure("INVALID_INPUT", "$", "telemetry event must be a plain object");
  if (Object.getOwnPropertySymbols(input).length > 0) {
    return failure("INVALID_INPUT", "$", "telemetry event must not contain symbol properties");
  }

  const unknownField = Object.getOwnPropertyNames(input)
    .sort()
    .find((field) => !inputFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, "telemetry event contains an unsupported field");

  const version = ownData(input, "version");
  if (!version || version.value !== TELEMETRY_EVENT_VERSION) {
    return failure("INVALID_VERSION", "$.version", `telemetry event version must be ${TELEMETRY_EVENT_VERSION}`);
  }

  const name = ownData(input, "name");
  if (
    !name
    || typeof name.value !== "string"
    || name.value.length === 0
    || name.value.length > TELEMETRY_EVENT_NAME_MAX_LENGTH
    || !eventNamePattern.test(name.value)
  ) {
    return failure("INVALID_NAME", "$.name", "telemetry event name must be a bounded lowercase machine identifier");
  }

  const source = ownData(input, "source");
  if (!source || !isSource(source.value)) {
    return failure("INVALID_SOURCE", "$.source", "telemetry event source is unsupported");
  }

  const kind = ownData(input, "kind");
  if (!kind || !isKind(kind.value)) {
    return failure("INVALID_KIND", "$.kind", "telemetry event kind is unsupported");
  }

  const outcome = ownData(input, "outcome");
  if (!outcome || !isOutcome(outcome.value)) {
    return failure("INVALID_OUTCOME", "$.outcome", "telemetry event outcome is unsupported");
  }

  const occurredAt = ownData(input, "occurredAt");
  if (!occurredAt || !isCanonicalOccurredAt(occurredAt.value)) {
    return failure("INVALID_OCCURRED_AT", "$.occurredAt", "occurredAt must be a canonical UTC ISO timestamp with millisecond precision");
  }

  const rawDuration = Object.getOwnPropertyDescriptor(input, "durationMs");
  if (rawDuration && !("value" in rawDuration)) {
    return failure("INVALID_DURATION", "$.durationMs", "durationMs must be an own data property when provided");
  }
  const duration = ownData(input, "durationMs");
  if (duration) {
    if (
      typeof duration.value !== "number"
      || !Number.isFinite(duration.value)
      || duration.value < 0
      || duration.value > TELEMETRY_DURATION_MAX_MS
    ) {
      return failure("INVALID_DURATION", "$.durationMs", `durationMs must be finite and between 0 and ${TELEMETRY_DURATION_MAX_MS}`);
    }
  }

  const base = {
    version: TELEMETRY_EVENT_VERSION,
    name: name.value,
    source: source.value,
    kind: kind.value,
    outcome: outcome.value,
    occurredAt: occurredAt.value,
  } as const;

  const event: TelemetryEvent = duration
    ? { ...base, durationMs: duration.value as number }
    : base;

  return { ok: true, value: Object.freeze(event) };
}
