import { describe, expect, it } from "vitest";
import { evaluateViraActionRetrySafety } from "../../packages/action-verification/src/retry-safety.js";

describe("PROD-13 Action retry safety", () => {
  it("authorizes retry before any provider dispatch", () => {
    expect(evaluateViraActionRetrySafety({
      retrySafety: "safe-before-effect",
      dispatchEvidence: "not-dispatched",
      priorVerification: "none",
      latestTruth: "unavailable",
    })).toEqual({ decision: "retry-safe", reason: "NO_PROVIDER_DISPATCH" });
  });

  it("requires the stronger known-no-effect strategy after a provider rejection", () => {
    expect(evaluateViraActionRetrySafety({
      retrySafety: "safe-before-effect",
      dispatchEvidence: "known-rejected",
      priorVerification: "none",
      latestTruth: "postcondition-not-satisfied",
    })).toEqual({ decision: "manual-required", reason: "ACTION_STRATEGY_DISALLOWS_RETRY" });

    expect(evaluateViraActionRetrySafety({
      retrySafety: "safe-after-known-no-effect",
      dispatchEvidence: "known-rejected",
      priorVerification: "none",
      latestTruth: "postcondition-not-satisfied",
    })).toEqual({ decision: "retry-safe", reason: "KNOWN_NO_EFFECT" });
  });

  it("never turns uncertain dispatch or verification into retry-safe", () => {
    expect(evaluateViraActionRetrySafety({
      retrySafety: "safe-after-known-no-effect",
      dispatchEvidence: "uncertain",
      priorVerification: "uncertain",
      latestTruth: "unavailable",
    })).toEqual({ decision: "manual-required", reason: "UNCERTAIN_EFFECT" });
  });

  it("does not retry a provider-accepted write without independent proof", () => {
    expect(evaluateViraActionRetrySafety({
      retrySafety: "never-after-uncertain-effect",
      dispatchEvidence: "accepted",
      priorVerification: "none",
      latestTruth: "unavailable",
    })).toEqual({ decision: "manual-required", reason: "PROVIDER_ACCEPTED_WITHOUT_PROOF" });
  });

  it("returns already-satisfied when the latest independent truth proves the postcondition", () => {
    expect(evaluateViraActionRetrySafety({
      retrySafety: "never-after-uncertain-effect",
      dispatchEvidence: "uncertain",
      priorVerification: "uncertain",
      latestTruth: "postcondition-satisfied",
    })).toEqual({ decision: "already-satisfied", reason: "POSTCONDITION_ALREADY_SATISFIED" });
  });

  it("requires a new/manual decision after frozen precondition drift", () => {
    expect(evaluateViraActionRetrySafety({
      retrySafety: "safe-after-known-no-effect",
      dispatchEvidence: "not-dispatched",
      priorVerification: "precondition-mismatch",
      latestTruth: "postcondition-not-satisfied",
    })).toEqual({ decision: "manual-required", reason: "FROZEN_PRECONDITION_DRIFTED" });
  });

  it("does not auto-retry partial or mismatch truth", () => {
    for (const priorVerification of ["partial", "mismatch", "manual"] as const) {
      expect(evaluateViraActionRetrySafety({
        retrySafety: "safe-after-known-no-effect",
        dispatchEvidence: "known-rejected",
        priorVerification,
        latestTruth: "postcondition-not-satisfied",
      })).toEqual({ decision: "manual-required", reason: "PRIOR_PARTIAL_OR_MISMATCH" });
    }
  });

  it("does not treat stale old verified truth as permission to repeat the effect", () => {
    expect(evaluateViraActionRetrySafety({
      retrySafety: "safe-after-known-no-effect",
      dispatchEvidence: "accepted",
      priorVerification: "verified",
      latestTruth: "postcondition-not-satisfied",
    })).toEqual({ decision: "manual-required", reason: "PRIOR_EFFECT_VERIFIED_BUT_LATEST_TRUTH_DRIFTED" });
  });
});
