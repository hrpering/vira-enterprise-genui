import type {
  TelemetryEvent,
  TelemetryEventValidationIssue,
  TelemetryKind,
  TelemetryOutcome,
  TelemetrySource,
} from "@vira-enterprise-genui/telemetry";

export const EXPERIENCE_OBSERVATION_NAMES = Object.freeze([
  "experience.requested",
  "experience.planned",
  "experience.render.started",
  "experience.render.completed",
  "experience.render.failed",
  "experience.action.started",
  "experience.action.completed",
  "experience.action.denied",
  "experience.view.changed",
  "experience.binding.resolved",
  "experience.interactive",
] as const);

export type ExperienceObservationName = (typeof EXPERIENCE_OBSERVATION_NAMES)[number];
export type ExperienceObservationDurationPolicy = "forbidden" | "required";

export interface ExperienceObservationDefinition {
  readonly name: ExperienceObservationName;
  readonly kind: TelemetryKind;
  readonly outcome: TelemetryOutcome;
  readonly duration: ExperienceObservationDurationPolicy;
}

export interface ExperienceObservationInput {
  readonly name: ExperienceObservationName;
  readonly source: TelemetrySource;
  readonly occurredAt: string;
  readonly durationMs?: number;
}

export type ExperienceObservationValidationCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_OBSERVATION_NAME"
  | "DURATION_REQUIRED"
  | "DURATION_NOT_ALLOWED";

export interface ExperienceObservationValidationIssue {
  readonly code: ExperienceObservationValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ExperienceObservationIssue =
  | ExperienceObservationValidationIssue
  | TelemetryEventValidationIssue;

export type ExperienceObservationResult =
  | { readonly ok: true; readonly value: TelemetryEvent }
  | { readonly ok: false; readonly issue: ExperienceObservationIssue };
