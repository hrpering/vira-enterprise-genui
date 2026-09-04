export const TELEMETRY_EVENT_VERSION = "1" as const;
export const TELEMETRY_EVENT_NAME_MAX_LENGTH = 128 as const;
export const TELEMETRY_DURATION_MAX_MS = 604_800_000 as const;

export const TELEMETRY_SOURCES = Object.freeze([
  "runtime-core",
  "planner",
  "composer",
  "adapter-sdk",
  "runtime-web",
  "web-component",
  "react",
  "security",
  "tool-bridge",
  "host",
  "action-ledger",
] as const);

export const TELEMETRY_KINDS = Object.freeze([
  "lifecycle",
  "action",
  "error",
  "performance",
  "security",
  "integration",
] as const);

export const TELEMETRY_OUTCOMES = Object.freeze([
  "neutral",
  "success",
  "failure",
] as const);

export type TelemetrySource = (typeof TELEMETRY_SOURCES)[number];
export type TelemetryKind = (typeof TELEMETRY_KINDS)[number];
export type TelemetryOutcome = (typeof TELEMETRY_OUTCOMES)[number];

export interface TelemetryEvent {
  readonly version: typeof TELEMETRY_EVENT_VERSION;
  readonly name: string;
  readonly source: TelemetrySource;
  readonly kind: TelemetryKind;
  readonly outcome: TelemetryOutcome;
  readonly occurredAt: string;
  readonly durationMs?: number;
}

export type TelemetryEventValidationCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_NAME"
  | "INVALID_SOURCE"
  | "INVALID_KIND"
  | "INVALID_OUTCOME"
  | "INVALID_OCCURRED_AT"
  | "INVALID_DURATION";

export interface TelemetryEventValidationIssue {
  readonly code: TelemetryEventValidationCode;
  readonly path: string;
  readonly message: string;
}

export type TelemetryEventResult =
  | { readonly ok: true; readonly value: TelemetryEvent }
  | { readonly ok: false; readonly issue: TelemetryEventValidationIssue };
