import { isSemanticNamespace, parseJsonValue, type JsonObject, type JsonValue } from "@vira-enterprise-genui/protocol";
import {
  VIRA_POLICY_SIMULATION_MAX_FIXTURES,
  VIRA_POLICY_SIMULATION_MAX_ID_LENGTH,
  VIRA_POLICY_SIMULATION_VERSION,
  type ViraPolicySimulationCaseResult,
  type ViraPolicySimulationDecision,
  type ViraPolicySimulationDiffKind,
  type ViraPolicySimulationEffect,
  type ViraPolicySimulationEvaluator,
  type ViraPolicySimulationFixture,
  type ViraPolicySimulationInput,
  type ViraPolicySimulationIssue,
  type ViraPolicySimulationIssueCode,
  type ViraPolicySimulationReport,
  type ViraPolicySimulationResult,
  type ViraPolicySimulationReview,
  type ViraPolicySimulationReviewInput,
  type ViraPolicySimulationReviewResult,
} from "./types.js";

const EFFECTS = new Set<ViraPolicySimulationEffect>(["allow", "deny", "challenge", "transform"]);

function issue(code: ViraPolicySimulationIssueCode, path: string, message: string): ViraPolicySimulationIssue {
  return Object.freeze({ code, path, message });
}

function boundedId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= VIRA_POLICY_SIMULATION_MAX_ID_LENGTH;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function freezeJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeJson(item);
    return Object.freeze(value) as T;
  }
  for (const child of Object.values(value)) freezeJson(child);
  return Object.freeze(value) as T;
}

function normalizeFixture(input: unknown, path: string): ViraPolicySimulationFixture | undefined {
  const parsed = parseJsonValue(input, path);
  if (!parsed.ok || !isObject(parsed.value)) return undefined;
  const keys = Object.keys(parsed.value);
  if (keys.length !== 2 || !Object.hasOwn(parsed.value, "id") || !Object.hasOwn(parsed.value, "input")) return undefined;
  if (!boundedId(parsed.value.id) || !isObject(parsed.value.input)) return undefined;
  return Object.freeze({ id: parsed.value.id, input: freezeJson(parsed.value.input) });
}

function validEvaluator(value: unknown): value is ViraPolicySimulationEvaluator {
  return value !== null
    && typeof value === "object"
    && (value as ViraPolicySimulationEvaluator).version === VIRA_POLICY_SIMULATION_VERSION
    && typeof (value as ViraPolicySimulationEvaluator).id === "string"
    && isSemanticNamespace((value as ViraPolicySimulationEvaluator).id)
    && boundedId((value as ViraPolicySimulationEvaluator).policyRef)
    && typeof (value as ViraPolicySimulationEvaluator).evaluate === "function";
}

function normalizeDecision(input: unknown): ViraPolicySimulationDecision | undefined {
  const parsed = parseJsonValue(input, "$.decision");
  if (!parsed.ok || !isObject(parsed.value)) return undefined;
  const keys = Object.keys(parsed.value);
  if (keys.length !== 3 || !Object.hasOwn(parsed.value, "version") || !Object.hasOwn(parsed.value, "effect") || !Object.hasOwn(parsed.value, "reasonCode")) return undefined;
  if (parsed.value.version !== VIRA_POLICY_SIMULATION_VERSION || typeof parsed.value.effect !== "string" || !EFFECTS.has(parsed.value.effect as ViraPolicySimulationEffect)) return undefined;
  if (!boundedId(parsed.value.reasonCode)) return undefined;
  return Object.freeze({
    version: VIRA_POLICY_SIMULATION_VERSION,
    effect: parsed.value.effect as ViraPolicySimulationEffect,
    reasonCode: parsed.value.reasonCode,
  });
}

function diffKind(current: ViraPolicySimulationEffect, candidate: ViraPolicySimulationEffect): ViraPolicySimulationDiffKind {
  if (current === candidate) return "unchanged";
  if (candidate === "deny" && current !== "deny") return "new-deny";
  if (candidate === "allow" && current !== "allow") return "new-allow";
  return "changed-effect";
}

function emptyCounts(): Record<ViraPolicySimulationEffect, number> {
  return { allow: 0, deny: 0, challenge: 0, transform: 0 };
}

function expectedReportId(fixtureSetId: string, currentPolicyRef: string, candidatePolicyRef: string): string {
  return `simulation:${fixtureSetId}:${currentPolicyRef}:${candidatePolicyRef}`;
}

function validReport(report: ViraPolicySimulationReport): boolean {
  if (
    report === null
    || typeof report !== "object"
    || report.version !== VIRA_POLICY_SIMULATION_VERSION
    || !boundedId(report.fixtureSetId)
    || !boundedId(report.currentPolicyRef)
    || !boundedId(report.candidatePolicyRef)
    || report.currentPolicyRef === report.candidatePolicyRef
    || !isSemanticNamespace(report.currentEvaluatorId)
    || !isSemanticNamespace(report.candidateEvaluatorId)
    || report.reportId !== expectedReportId(report.fixtureSetId, report.currentPolicyRef, report.candidatePolicyRef)
    || !Array.isArray(report.cases)
    || report.cases.length < 1
    || report.cases.length > VIRA_POLICY_SIMULATION_MAX_FIXTURES
    || !Array.isArray(report.newDenyFixtureIds)
  ) return false;

  const fixtureIds = new Set<string>();
  const currentCounts = emptyCounts();
  const candidateCounts = emptyCounts();
  const expectedNewDenies: string[] = [];
  let unchanged = 0;
  let newDenies = 0;
  let newAllows = 0;
  let changedEffects = 0;

  for (const entry of report.cases) {
    if (!boundedId(entry.fixtureId) || fixtureIds.has(entry.fixtureId)) return false;
    fixtureIds.add(entry.fixtureId);
    const current = normalizeDecision(entry.current);
    const candidate = normalizeDecision(entry.candidate);
    if (!current || !candidate) return false;
    const kind = diffKind(current.effect, candidate.effect);
    if (entry.kind !== kind) return false;
    currentCounts[current.effect] += 1;
    candidateCounts[candidate.effect] += 1;
    if (kind === "unchanged") unchanged += 1;
    else if (kind === "new-deny") { newDenies += 1; expectedNewDenies.push(entry.fixtureId); }
    else if (kind === "new-allow") newAllows += 1;
    else changedEffects += 1;
  }

  if (
    report.summary.fixtures !== report.cases.length
    || report.summary.unchanged !== unchanged
    || report.summary.newDenies !== newDenies
    || report.summary.newAllows !== newAllows
    || report.summary.changedEffects !== changedEffects
  ) return false;
  for (const effect of EFFECTS) {
    if (report.summary.current[effect] !== currentCounts[effect] || report.summary.candidate[effect] !== candidateCounts[effect]) return false;
  }
  return expectedNewDenies.length === report.newDenyFixtureIds.length
    && expectedNewDenies.every((id, index) => report.newDenyFixtureIds[index] === id);
}

export async function simulateViraPolicyChange(input: ViraPolicySimulationInput): Promise<ViraPolicySimulationResult> {
  if (input === null || typeof input !== "object" || !boundedId(input.fixtureSetId)) {
    return { ok: false, issue: issue("INVALID_INPUT", "$", "policy simulation input or fixtureSetId is invalid") };
  }
  if (!Array.isArray(input.fixtures) || input.fixtures.length < 1 || input.fixtures.length > VIRA_POLICY_SIMULATION_MAX_FIXTURES) {
    return { ok: false, issue: issue("INVALID_FIXTURES", "$.fixtures", "fixture set must contain 1..1000 canonical fixtures") };
  }
  if (!validEvaluator(input.current) || !validEvaluator(input.candidate)) {
    return { ok: false, issue: issue("INVALID_EVALUATOR", "$", "current and candidate evaluators must be valid and exact") };
  }
  if (input.current.policyRef === input.candidate.policyRef) {
    return { ok: false, issue: issue("INVALID_EVALUATOR", "$.candidate.policyRef", "candidate policyRef must differ from current policyRef") };
  }

  const fixtures: ViraPolicySimulationFixture[] = [];
  const fixtureIds = new Set<string>();
  for (let index = 0; index < input.fixtures.length; index += 1) {
    const fixture = normalizeFixture(input.fixtures[index], `$.fixtures[${index}]`);
    if (!fixture || fixtureIds.has(fixture.id)) {
      return { ok: false, issue: issue("INVALID_FIXTURES", `$.fixtures[${index}]`, "fixture is malformed or duplicated") };
    }
    fixtureIds.add(fixture.id);
    fixtures.push(fixture);
  }

  const cases: ViraPolicySimulationCaseResult[] = [];
  const currentCounts = emptyCounts();
  const candidateCounts = emptyCounts();
  const newDenyFixtureIds: string[] = [];
  let unchanged = 0;
  let newDenies = 0;
  let newAllows = 0;
  let changedEffects = 0;

  for (let index = 0; index < fixtures.length; index += 1) {
    const fixture = fixtures[index]!;
    let currentRaw: unknown;
    let candidateRaw: unknown;
    try {
      currentRaw = await input.current.evaluate(fixture);
      candidateRaw = await input.candidate.evaluate(fixture);
    } catch {
      return { ok: false, issue: issue("EVALUATOR_FAILED", `$.fixtures[${index}]`, "policy evaluator failed closed during simulation") };
    }
    const current = normalizeDecision(currentRaw);
    const candidate = normalizeDecision(candidateRaw);
    if (!current || !candidate) {
      return { ok: false, issue: issue("INVALID_DECISION", `$.fixtures[${index}]`, "policy evaluator returned an invalid normalized decision") };
    }
    currentCounts[current.effect] += 1;
    candidateCounts[candidate.effect] += 1;
    const kind = diffKind(current.effect, candidate.effect);
    if (kind === "unchanged") unchanged += 1;
    else if (kind === "new-deny") { newDenies += 1; newDenyFixtureIds.push(fixture.id); }
    else if (kind === "new-allow") newAllows += 1;
    else changedEffects += 1;
    cases.push(Object.freeze({ fixtureId: fixture.id, current, candidate, kind }));
  }

  const report: ViraPolicySimulationReport = Object.freeze({
    version: VIRA_POLICY_SIMULATION_VERSION,
    reportId: expectedReportId(input.fixtureSetId, input.current.policyRef, input.candidate.policyRef),
    currentEvaluatorId: input.current.id,
    candidateEvaluatorId: input.candidate.id,
    currentPolicyRef: input.current.policyRef,
    candidatePolicyRef: input.candidate.policyRef,
    fixtureSetId: input.fixtureSetId,
    cases: Object.freeze(cases),
    summary: Object.freeze({
      fixtures: fixtures.length,
      unchanged,
      newDenies,
      newAllows,
      changedEffects,
      current: Object.freeze(currentCounts),
      candidate: Object.freeze(candidateCounts),
    }),
    newDenyFixtureIds: Object.freeze(newDenyFixtureIds),
  });
  return { ok: true, value: report };
}

export function reviewViraPolicySimulation(
  report: ViraPolicySimulationReport,
  input: ViraPolicySimulationReviewInput,
): ViraPolicySimulationReviewResult {
  if (!validReport(report)) {
    return { ok: false, issue: issue("INVALID_REVIEW", "$.report", "simulation report is internally inconsistent") };
  }
  if (input === null || typeof input !== "object" || !boundedId(input.reviewerId) || (input.decision !== "approved" && input.decision !== "rejected") || !Array.isArray(input.acknowledgedNewDenyFixtureIds)) {
    return { ok: false, issue: issue("INVALID_REVIEW", "$.review", "simulation review input is invalid") };
  }
  const expected = new Set(report.newDenyFixtureIds);
  const acknowledged = new Set(input.acknowledgedNewDenyFixtureIds);
  if (acknowledged.size !== input.acknowledgedNewDenyFixtureIds.length || [...acknowledged].some((id) => !expected.has(id))) {
    return { ok: false, issue: issue("INVALID_REVIEW", "$.review.acknowledgedNewDenyFixtureIds", "review contains duplicate or unknown new-deny acknowledgements") };
  }
  const allNewDeniesAcknowledged = expected.size === acknowledged.size;
  const note = input.note;
  if (note !== undefined && (typeof note !== "string" || note.length > 4_096)) {
    return { ok: false, issue: issue("INVALID_REVIEW", "$.review.note", "review note is invalid") };
  }
  if (input.decision === "approved" && !allNewDeniesAcknowledged) {
    return { ok: false, issue: issue("INVALID_REVIEW", "$.review.acknowledgedNewDenyFixtureIds", "all new denies must be explicitly acknowledged before approval") };
  }
  const review: ViraPolicySimulationReview = Object.freeze({
    version: VIRA_POLICY_SIMULATION_VERSION,
    reportId: report.reportId,
    currentPolicyRef: report.currentPolicyRef,
    candidatePolicyRef: report.candidatePolicyRef,
    reviewerId: input.reviewerId,
    decision: input.decision,
    acknowledgedNewDenyFixtureIds: Object.freeze([...input.acknowledgedNewDenyFixtureIds]),
    publishEligible: input.decision === "approved" && allNewDeniesAcknowledged,
    ...(note === undefined ? {} : { note }),
  });
  return { ok: true, value: review };
}
