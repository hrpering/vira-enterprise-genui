export { createTelemetryEvent } from "./events/event.js";
export {
  TELEMETRY_DURATION_MAX_MS,
  TELEMETRY_EVENT_NAME_MAX_LENGTH,
  TELEMETRY_EVENT_VERSION,
  TELEMETRY_KINDS,
  TELEMETRY_OUTCOMES,
  TELEMETRY_SOURCES,
} from "./events/types.js";
export type {
  TelemetryEvent,
  TelemetryEventResult,
  TelemetryEventValidationCode,
  TelemetryEventValidationIssue,
  TelemetryKind,
  TelemetryOutcome,
  TelemetrySource,
} from "./events/types.js";
