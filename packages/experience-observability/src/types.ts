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
  "experience.shown",
  "experience.view.changed",
  "experience.binding.resolved",
  "experience.action.started",
  "experience.action.proposed",
  "experience.policy.evaluated",
  "experience.approval.requested",
  "experience.approval.granted",
  "experience.action.executed",
  "experience.action.completed",
  "experience.action.failed",
  "experience.action.denied",
  "experience.action.retry",
  "experience.action.recovery",
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
