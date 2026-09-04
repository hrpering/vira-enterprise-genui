import type { JsonObject } from "@vira-enterprise-genui/protocol";

export const VIRA_POLICY_SIMULATION_VERSION = "1" as const;
export const VIRA_POLICY_SIMULATION_MAX_FIXTURES = 1_000 as const;
export const VIRA_POLICY_SIMULATION_MAX_ID_LENGTH = 256 as const;

export type ViraPolicySimulationEffect = "allow" | "deny" | "challenge" | "transform";
export type ViraPolicySimulationDiffKind =
  | "unchanged"
  | "new-deny"
  | "new-allow"
  | "changed-effect";

export interface ViraPolicySimulationFixture {
  readonly id: string;
  readonly input: JsonObject;
}

export interface ViraPolicySimulationDecision {
  readonly version: typeof VIRA_POLICY_SIMULATION_VERSION;
  readonly effect: ViraPolicySimulationEffect;
  readonly reasonCode: string;
}

export interface ViraPolicySimulationEvaluator {
  readonly version: typeof VIRA_POLICY_SIMULATION_VERSION;
  readonly id: string;
  readonly policyRef: string;
  readonly evaluate: (fixture: ViraPolicySimulationFixture) => Promise<unknown> | unknown;
}

export interface ViraPolicySimulationCaseResult {
  readonly fixtureId: string;
  readonly current: ViraPolicySimulationDecision;
  readonly candidate: ViraPolicySimulationDecision;
  readonly kind: ViraPolicySimulationDiffKind;
}

export interface ViraPolicySimulationSummary {
  readonly fixtures: number;
  readonly unchanged: number;
  readonly newDenies: number;
  readonly newAllows: number;
  readonly changedEffects: number;
  readonly current: Readonly<Record<ViraPolicySimulationEffect, number>>;
  readonly candidate: Readonly<Record<ViraPolicySimulationEffect, number>>;
}

export interface ViraPolicySimulationReport {
  readonly version: typeof VIRA_POLICY_SIMULATION_VERSION;
  readonly reportId: string;
  readonly currentEvaluatorId: string;
  readonly candidateEvaluatorId: string;
  readonly currentPolicyRef: string;
  readonly candidatePolicyRef: string;
  readonly fixtureSetId: string;
  readonly cases: readonly ViraPolicySimulationCaseResult[];
  readonly summary: ViraPolicySimulationSummary;
  readonly newDenyFixtureIds: readonly string[];
}

export interface ViraPolicySimulationInput {
  readonly fixtureSetId: string;
  readonly fixtures: readonly ViraPolicySimulationFixture[];
  readonly current: ViraPolicySimulationEvaluator;
  readonly candidate: ViraPolicySimulationEvaluator;
}

export type ViraPolicySimulationIssueCode =
  | "INVALID_INPUT"
  | "INVALID_FIXTURES"
  | "INVALID_EVALUATOR"
  | "EVALUATOR_FAILED"
  | "INVALID_DECISION"
  | "INVALID_REVIEW";

export interface ViraPolicySimulationIssue {
  readonly code: ViraPolicySimulationIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraPolicySimulationResult =
  | { readonly ok: true; readonly value: ViraPolicySimulationReport }
  | { readonly ok: false; readonly issue: ViraPolicySimulationIssue };

export interface ViraPolicySimulationReviewInput {
  readonly reviewerId: string;
  readonly decision: "approved" | "rejected";
  readonly acknowledgedNewDenyFixtureIds: readonly string[];
  readonly note?: string;
}

export interface ViraPolicySimulationReview {
  readonly version: typeof VIRA_POLICY_SIMULATION_VERSION;
  readonly reportId: string;
  readonly currentPolicyRef: string;
  readonly candidatePolicyRef: string;
  readonly reviewerId: string;
  readonly decision: "approved" | "rejected";
  readonly acknowledgedNewDenyFixtureIds: readonly string[];
  readonly publishEligible: boolean;
  readonly note?: string;
}

export type ViraPolicySimulationReviewResult =
  | { readonly ok: true; readonly value: ViraPolicySimulationReview }
  | { readonly ok: false; readonly issue: ViraPolicySimulationIssue };
