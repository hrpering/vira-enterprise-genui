import { test } from "vitest";
import assert from "node:assert/strict";
import { createViraActionLedger } from "../../packages/action-ledger/src/index.js";

const created = () => createViraActionLedger({
  instanceId: "instance-suspend",
  experienceId: "acme.experience.refund",
  experienceVersion: "1.0.0",
  platform: "web",
  hostId: "acme.host.web",
  hostVersion: "1.0.0",
  initialStateRevision: 1,
});

const intent = {
  version: "1",
  instanceId: "instance-suspend",
  expectedStateRevision: 1,
  idempotencyKey: "idem-suspend",
  action: { version: "1", id: "action-suspend", type: "refund.submit", source: "user", payload: {} },
} as const;

test("challenge suspends subsequent policy evaluation until approval continuation", () => {
  const result = created();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const ledger = result.value;
  assert.equal(ledger.recordActionProposed("2026-09-03T18:00:00.000Z", intent as never).ok, true);
  assert.equal(ledger.recordPolicyEvaluated("2026-09-03T18:01:00.000Z", "action-suspend", {
    version: "1", effect: "challenge", reasonCode: "approval-required", obligations: [], provider: "acme.policy",
  } as never).ok, true);
  const bypass = ledger.recordPolicyEvaluated("2026-09-03T18:02:00.000Z", "action-suspend", {
    version: "1", effect: "allow", reasonCode: "attempted-bypass", obligations: [], provider: "acme.second-policy",
  } as never);
  assert.equal(bypass.ok, false);
  if (!bypass.ok) assert.equal(bypass.issue.code, "STAGE_ORDER_INVALID");
  assert.equal(ledger.entries().length, 2);
});
