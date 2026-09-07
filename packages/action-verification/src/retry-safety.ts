import type { ViraActionRetrySafety } from "@vira-enterprise-genui/action-supply";

export const VIRA_ACTION_RETRY_DECISIONS = Object.freeze([
  "retry-safe",
  "manual-required",
  "already-satisfied",
] as const);
export const VIRA_ACTION_RETRY_DISPATCH_EVIDENCE = Object.freeze([
  "not-dispatched",
  "known-rejected",
  "accepted",
  "uncertain",
] as const);
export const VIRA_ACTION_RETRY_PRIOR_VERIFICATION = Object.freeze([
  "none",
  "precondition-mismatch",
  "verified",
  "partial",
  "mismatch",
  "uncertain",
  "manual",
] as const);
export const VIRA_ACTION_RETRY_LATEST_TRUTH = Object.freeze([
  "unavailable",
  "postcondition-satisfied",
  "postcondition-not-satisfied",
] as const);

export type ViraActionRetryDecision = (typeof VIRA_ACTION_RETRY_DECISIONS)[number];
export type ViraActionRetryDispatchEvidence = (typeof VIRA_ACTION_RETRY_DISPATCH_EVIDENCE)[number];
export type ViraActionRetryPriorVerification = (typeof VIRA_ACTION_RETRY_PRIOR_VERIFICATION)[number];
export type ViraActionRetryLatestTruth = (typeof VIRA_ACTION_RETRY_LATEST_TRUTH)[number];

export type ViraActionRetryDecisionReason =
  | "POSTCONDITION_ALREADY_SATISFIED"
  | "NO_PROVIDER_DISPATCH"
  | "KNOWN_NO_EFFECT"
  | "FROZEN_PRECONDITION_DRIFTED"
  | "PRIOR_EFFECT_VERIFIED_BUT_LATEST_TRUTH_DRIFTED"
  | "PRIOR_PARTIAL_OR_MISMATCH"
  | "UNCERTAIN_EFFECT"
  | "PROVIDER_ACCEPTED_WITHOUT_PROOF"
  | "ACTION_STRATEGY_DISALLOWS_RETRY";

export interface ViraActionRetrySafetyDecision {
  readonly decision: ViraActionRetryDecision;
  readonly reason: ViraActionRetryDecisionReason;
}

function validStrategy(value: ViraActionRetrySafety): boolean {
  return value === "safe-before-effect"
    || value === "safe-after-known-no-effect"
    || value === "never-after-uncertain-effect";
}

function validDispatch(value: ViraActionRetryDispatchEvidence): boolean {
  return VIRA_ACTION_RETRY_DISPATCH_EVIDENCE.includes(value);
}

function validPrior(value: ViraActionRetryPriorVerification): boolean {
  return VIRA_ACTION_RETRY_PRIOR_VERIFICATION.includes(value);
}

function validTruth(value: ViraActionRetryLatestTruth): boolean {
  return VIRA_ACTION_RETRY_LATEST_TRUTH.includes(value);
}

function result(
  decision: ViraActionRetryDecision,
  reason: ViraActionRetryDecisionReason,
): ViraActionRetrySafetyDecision {
  return Object.freeze({ decision, reason });
}

export function evaluateViraActionRetrySafety(input: {
  readonly retrySafety: ViraActionRetrySafety;
  readonly dispatchEvidence: ViraActionRetryDispatchEvidence;
  readonly priorVerification: ViraActionRetryPriorVerification;
  readonly latestTruth: ViraActionRetryLatestTruth;
}): ViraActionRetrySafetyDecision {
  if (
    input === null
    || typeof input !== "object"
    || !validStrategy(input.retrySafety)
    || !validDispatch(input.dispatchEvidence)
    || !validPrior(input.priorVerification)
    || !validTruth(input.latestTruth)
  ) throw new TypeError("action retry safety input is invalid");

  if (input.latestTruth === "postcondition-satisfied") {
    return result("already-satisfied", "POSTCONDITION_ALREADY_SATISFIED");
  }

  if (input.priorVerification === "precondition-mismatch") {
    return result("manual-required", "FROZEN_PRECONDITION_DRIFTED");
  }

  if (input.priorVerification === "verified") {
    return result("manual-required", "PRIOR_EFFECT_VERIFIED_BUT_LATEST_TRUTH_DRIFTED");
  }

  if (input.priorVerification === "partial" || input.priorVerification === "mismatch" || input.priorVerification === "manual") {
    return result("manual-required", "PRIOR_PARTIAL_OR_MISMATCH");
  }

  if (input.priorVerification === "uncertain" || input.dispatchEvidence === "uncertain") {
    return result("manual-required", "UNCERTAIN_EFFECT");
  }

  if (input.dispatchEvidence === "accepted") {
    return result("manual-required", "PROVIDER_ACCEPTED_WITHOUT_PROOF");
  }

  if (input.dispatchEvidence === "not-dispatched") {
    return result("retry-safe", "NO_PROVIDER_DISPATCH");
  }

  if (input.dispatchEvidence === "known-rejected") {
    if (input.retrySafety === "safe-before-effect") {
      return result("manual-required", "ACTION_STRATEGY_DISALLOWS_RETRY");
    }
    return result("retry-safe", "KNOWN_NO_EFFECT");
  }

  return result("manual-required", "ACTION_STRATEGY_DISALLOWS_RETRY");
}
