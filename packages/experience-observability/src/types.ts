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
] as const);

export type ExperienceObservationName = (typeof EXPERIENCE_OBSERVATION_NAMES)[number];

export interface ExperienceObservationDefinition {
  readonly name: ExperienceObservationName;
  readonly kind: TelemetryKind;
  readonly outcome: TelemetryOutcome;
}

export interface ExperienceObservationInput {
  readonly name: ExperienceObservationName;
  readonly source: TelemetrySource;
  readonly occurredAt: string;
}

export type ExperienceObservationValidationCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_OBSERVATION_NAME";

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
