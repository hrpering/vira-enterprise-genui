import test from "node:test";
import assert from "node:assert/strict";
import { createViraActionLedger } from "../../packages/action-ledger/src/index.js";

const t = (second: number) => `2026-09-03T18:5${second}:00.000Z`;
function ledger() {
  const result = createViraActionLedger({
    instanceId: "instance-17",
    experienceId: "acme.experience.refund",
    experienceVersion: "1.4.2",
    platform: "ios",
    hostId: "acme.host.ios",
    hostVersion: "7.1.0",
    initialStateRevision: 39,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("ledger fixture must be valid");
  return result.value;
}
const intent = {
  version: "1",
  instanceId: "instance-17",
  expectedStateRevision: 39,
  idempotencyKey: "idem-17",
  action: { version: "1", id: "action-17", type: "refund.submit", source: "user", payload: { secret: "must-not-enter-ledger", amount: 50 } },
} as const;
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
  const serialized = JSON.stringify(replay);
  for (const forbidden of ["must-not-enter-ledger", "backendSecret", "claims", "payload"]) assert.equal(serialized.includes(forbidden), false);
});

test("later action stages fail closed until an exact proposal exists", () => {
  const value = ledger();
  const policy = value.recordPolicyEvaluated(t(1), "missing", verdict as never);
  assert.equal(policy.ok, false);
  if (!policy.ok) assert.equal(policy.issue.code, "ACTION_NOT_PROPOSED");
});

test("cross-instance approval and receipt identities are rejected", () => {
  const value = ledger();
  assert.equal(value.recordActionProposed(t(1), intent as never).ok, true);
  const badChallenge = value.recordApprovalRequested(t(2), { ...challenge, instanceId: "other-instance" } as never);
  assert.equal(badChallenge.ok, false);
  if (!badChallenge.ok) assert.equal(badChallenge.issue.code, "INVALID_APPROVAL");
  const badReceipt = value.recordActionExecuted(t(3), { ...receipt, idempotencyKey: "other-key" } as never);
  assert.equal(badReceipt.ok, false);
  if (!badReceipt.ok) assert.equal(badReceipt.issue.code, "INVALID_RECEIPT");
});

test("ledger projects its ordered timeline through existing telemetry authority", () => {
  const value = ledger();
  assert.equal(value.recordActionProposed(t(1), intent as never).ok, true);
  assert.equal(value.recordRetry(t(2), "action-17", 39, "retry requested").ok, true);
  assert.equal(value.recordRecovery(t(3), "action-17", 40, "recovered").ok, true);
  const projected = value.telemetry();
  assert.equal(projected.ok, true);
  if (!projected.ok) return;
  assert.deepEqual(projected.value.map((event) => event.name), ["experience.action.proposed", "experience.action.retry", "experience.action.recovery"]);
  assert.deepEqual(projected.value.map((event) => event.source), ["action-ledger", "action-ledger", "action-ledger"]);
});
