import test from "node:test";
import assert from "node:assert/strict";
import { createViraActionLedger } from "../../packages/action-ledger/src/index.js";

const t = (second: number) => `2026-09-03T18:5${second}:00.000Z`;
function ledger() {
  const result = createViraActionLedger({ instanceId: "instance-17", experienceId: "acme.experience.refund", experienceVersion: "1.4.2", platform: "ios", hostId: "acme.host.ios", hostVersion: "7.1.0", initialStateRevision: 39 });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("ledger fixture must be valid");
  return result.value;
}
const intent = { version: "1", instanceId: "instance-17", expectedStateRevision: 39, idempotencyKey: "idem-17", action: { version: "1", id: "action-17", type: "refund.submit", source: "user", payload: { secret: "must-not-enter-ledger", amount: 50 } } } as const;
const verdict = { version: "1", effect: "challenge", reasonCode: "manager-required", obligations: [], provider: "acme.policy" } as const;
const challenge = { version: "1", challengeId: "challenge-17", instanceId: "instance-17", actionId: "action-17", actionType: "refund.submit", expectedStateRevision: 39, idempotencyKey: "idem-17", provider: "acme.policy", reasonCode: "manager-required", obligations: [] } as const;
const decision = { version: "1", challengeId: "challenge-17", decision: "approved", approver: { version: "1", kind: "user", id: "manager-42", issuer: "https://id.example.com", claims: { token: "must-not-enter-ledger" } } } as const;
const receipt = { version: "1", instanceId: "instance-17", actionId: "action-17", actionType: "refund.submit", effect: "write", idempotencyKey: "idem-17", expectedStateRevision: 39, observedStateRevision: 40, outcome: "success", data: { backendSecret: "must-not-enter-ledger" } } as const;

test("MASTER-17 records a deterministic action chain without replay execution authority", () => {
  const value = ledger();
  assert.equal(value.recordExperienceShown(t(0), 39).ok, true);
  assert.equal(value.recordActionProposed(t(1), intent as never).ok, true);
  assert.equal(value.recordPolicyEvaluated(t(2), "action-17", verdict as never).ok, true);
  assert.equal(value.recordApprovalRequested(t(3), challenge as never).ok, true);
  assert.equal(value.recordApprovalGranted(t(4), challenge as never, decision as never).ok, true);
  assert.equal(value.recordActionExecuted(t(5), receipt as never).ok, true);
  const replay = value.replay();
  assert.equal(replay.sideEffectExecution, "forbidden");
  assert.equal(Object.hasOwn(replay, "execute"), false);
  assert.deepEqual(replay.entries.map((entry) => entry.kind), ["experience.shown", "action.proposed", "policy.evaluated", "approval.requested", "approval.granted", "action.executed"]);
  assert.deepEqual(replay.entries.map((entry) => entry.sequence), [0, 1, 2, 3, 4, 5]);
  assert.equal(replay.entries.at(-1)?.stateRevision, 40);
  assert.equal(replay.entries.at(-1)?.actionEffect, "write");
  const serialized = JSON.stringify(replay);
  for (const forbidden of ["must-not-enter-ledger", "backendSecret", "claims", "payload"]) assert.equal(serialized.includes(forbidden), false);
});

test("later action stages fail closed until an exact proposal exists", () => {
  const value = ledger();
  const policy = value.recordPolicyEvaluated(t(1), "missing", verdict as never);
  assert.equal(policy.ok, false);
  if (!policy.ok) assert.equal(policy.issue.code, "ACTION_NOT_PROPOSED");
});

test("failed proposal validation does not reserve action identity", () => {
  const value = ledger();
  const rejected = value.recordActionProposed("not-a-time", intent as never);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.issue.code, "INVALID_TIMESTAMP");
  const later = value.recordPolicyEvaluated(t(2), "action-17", verdict as never);
  assert.equal(later.ok, false);
  if (!later.ok) assert.equal(later.issue.code, "ACTION_NOT_PROPOSED");
  assert.equal(value.entries().length, 0);
});

test("challenge policy cannot execute before exact approval continuation", () => {
  const value = ledger();
  assert.equal(value.recordActionProposed(t(1), intent as never).ok, true);
  assert.equal(value.recordPolicyEvaluated(t(2), "action-17", verdict as never).ok, true);
  const earlyExecution = value.recordActionExecuted(t(3), receipt as never);
  assert.equal(earlyExecution.ok, false);
  if (!earlyExecution.ok) assert.equal(earlyExecution.issue.code, "STAGE_ORDER_INVALID");
  assert.equal(value.recordApprovalRequested(t(4), challenge as never).ok, true);
  const pendingExecution = value.recordActionExecuted(t(5), receipt as never);
  assert.equal(pendingExecution.ok, false);
  if (!pendingExecution.ok) assert.equal(pendingExecution.issue.code, "STAGE_ORDER_INVALID");
});

test("deny policy is terminal and projects a denied telemetry observation", () => {
  const value = ledger();
  assert.equal(value.recordActionProposed(t(1), intent as never).ok, true);
  assert.equal(value.recordPolicyEvaluated(t(2), "action-17", { ...verdict, effect: "deny", reasonCode: "blocked" } as never).ok, true);
  const execution = value.recordActionExecuted(t(3), receipt as never);
  assert.equal(execution.ok, false);
  if (!execution.ok) assert.equal(execution.issue.code, "STAGE_ORDER_INVALID");
  const telemetry = value.telemetry();
  assert.equal(telemetry.ok, true);
  if (!telemetry.ok) return;
  assert.deepEqual(telemetry.value.map((event) => event.name), ["experience.action.proposed", "experience.policy.evaluated", "experience.action.denied"]);
});

test("approval requests require an actual challenge disposition", () => {
  const value = ledger();
  assert.equal(value.recordActionProposed(t(1), intent as never).ok, true);
  assert.equal(value.recordPolicyEvaluated(t(2), "action-17", { ...verdict, effect: "allow" } as never).ok, true);
  const approval = value.recordApprovalRequested(t(3), challenge as never);
  assert.equal(approval.ok, false);
  if (!approval.ok) assert.equal(approval.issue.code, "STAGE_ORDER_INVALID");
});

test("cross-instance approval and receipt identities are rejected", () => {
  const value = ledger();
  assert.equal(value.recordActionProposed(t(1), intent as never).ok, true);
  assert.equal(value.recordPolicyEvaluated(t(2), "action-17", verdict as never).ok, true);
  const badChallenge = value.recordApprovalRequested(t(3), { ...challenge, instanceId: "other-instance" } as never);
  assert.equal(badChallenge.ok, false);
  if (!badChallenge.ok) assert.equal(badChallenge.issue.code, "INVALID_APPROVAL");
  const forgedGrant = value.recordApprovalGranted(t(4), challenge as never, decision as never);
  assert.equal(forgedGrant.ok, false);
  if (!forgedGrant.ok) assert.equal(forgedGrant.issue.code, "STAGE_ORDER_INVALID");
});

test("state revisions are globally monotonic from the replay session revision", () => {
  const value = ledger();
  const beforeInitial = value.recordExperienceShown(t(0), 38);
  assert.equal(beforeInitial.ok, false);
  if (!beforeInitial.ok) assert.equal(beforeInitial.issue.code, "INVALID_REVISION");
  assert.equal(value.recordExperienceShown(t(1), 39).ok, true);
  assert.equal(value.recordViewChanged(t(2), 40, "detail").ok, true);
  const regression = value.recordViewChanged(t(3), 39, "back");
  assert.equal(regression.ok, false);
  if (!regression.ok) assert.equal(regression.issue.code, "INVALID_REVISION");
});

test("retry and recovery require a recorded failure and recovery is single-shot", () => {
  const value = ledger();
  assert.equal(value.recordActionProposed(t(1), intent as never).ok, true);
  assert.equal(value.recordPolicyEvaluated(t(2), "action-17", { ...verdict, effect: "allow" } as never).ok, true);
  assert.equal(value.recordActionFailed(t(3), "action-17", 39, "backend timeout").ok, true);
  assert.equal(value.recordRetry(t(4), "action-17", 39, "retry requested").ok, true);
  assert.equal(value.recordRecovery(t(5), "action-17", 40, "recovered").ok, true);
  const duplicateRecovery = value.recordRecovery("2026-09-03T18:56:00.000Z", "action-17", 40, "again");
  assert.equal(duplicateRecovery.ok, false);
  if (!duplicateRecovery.ok) assert.equal(duplicateRecovery.issue.code, "STAGE_ORDER_INVALID");
  const projected = value.telemetry();
  assert.equal(projected.ok, true);
  if (!projected.ok) return;
  assert.deepEqual(projected.value.map((event) => event.name), ["experience.action.proposed", "experience.policy.evaluated", "experience.action.failed", "experience.action.retry", "experience.action.recovery"]);
});
