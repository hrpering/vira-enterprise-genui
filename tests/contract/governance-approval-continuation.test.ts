import { describe, expect, it } from "vitest";
import {
  createViraGovernancePipeline,
  type ViraApprovalDecision,
  type ViraGovernanceContext,
} from "../../packages/genui/src/index.js";

const ctx: ViraGovernanceContext = {
  version: "1",
  instanceId: "instance-approval",
  experienceId: "refund.experience",
  experienceVersion: "1.0.0",
  platform: "web",
  actionIntent: {
    version: "1",
    instanceId: "instance-approval",
    expectedStateRevision: 9,
    idempotencyKey: "idem:refund-9",
    action: {
      id: "refund-9",
      type: "commerce.refund.submit",
      source: "user",
      payload: { amount: 4000 },
    },
  },
};

function pipeline() {
  return createViraGovernancePipeline({
    providers: [{
      version: "1",
      id: "opa.provider",
      evaluate: () => ({
        version: "1",
        effect: "challenge",
        reasonCode: "manager-required",
        obligations: [{ id: "approval.manager" }],
        provider: "opa.provider",
      }),
    }],
    allowedObligations: ["approval.manager"],
  });
}

describe("MASTER-09 approval continuation", () => {
  it("returns an exact portable challenge and accepts that challenge later", async () => {
    const created = pipeline();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const first = await created.value.evaluate({
      coreSafety: { version: "1", effect: "allow", reasonCode: "core-pass" },
      context: ctx,
    });
    expect(first.ok).toBe(false);
    if (first.ok || !first.challenge) return;
    expect(first.challenge.expectedStateRevision).toBe(9);
    expect(first.challenge.idempotencyKey).toBe("idem:refund-9");

    const approval: ViraApprovalDecision = {
      version: "1",
      challengeId: first.challenge.challengeId,
      decision: "approved",
      approver: { version: "1", kind: "user", id: "manager-1", issuer: "vira.identity" },
      evidenceRef: "evidence:manager-1",
    };
    const resumed = await created.value.evaluate({
      coreSafety: { version: "1", effect: "allow", reasonCode: "core-pass" },
      context: ctx,
      approvals: [approval],
    });
    expect(resumed.ok).toBe(true);
    if (resumed.ok) expect(resumed.value.approvals[0]?.challengeId).toBe(first.challenge.challengeId);
  });

  it("rejects a stale approval after revision identity changes", async () => {
    const created = pipeline();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const first = await created.value.evaluate({
      coreSafety: { version: "1", effect: "allow", reasonCode: "core-pass" },
      context: ctx,
    });
    if (first.ok || !first.challenge) return;

    const changed: ViraGovernanceContext = {
      ...ctx,
      actionIntent: { ...ctx.actionIntent, expectedStateRevision: 10 },
    };
    const result = await created.value.evaluate({
      coreSafety: { version: "1", effect: "allow", reasonCode: "core-pass" },
      context: changed,
      approvals: [{
        version: "1",
        challengeId: first.challenge.challengeId,
        decision: "approved",
        approver: { version: "1", kind: "user", id: "manager-1", issuer: "vira.identity" },
      }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("APPROVAL_REPLAY");
  });

  it("rejects duplicate decisions for the same challenge", async () => {
    const created = pipeline();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const first = await created.value.evaluate({
      coreSafety: { version: "1", effect: "allow", reasonCode: "core-pass" },
      context: ctx,
    });
    if (first.ok || !first.challenge) return;
    const decision: ViraApprovalDecision = {
      version: "1",
      challengeId: first.challenge.challengeId,
      decision: "approved",
      approver: { version: "1", kind: "user", id: "manager-1", issuer: "vira.identity" },
    };
    const result = await created.value.evaluate({
      coreSafety: { version: "1", effect: "allow", reasonCode: "core-pass" },
      context: ctx,
      approvals: [decision, decision],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("APPROVAL_REPLAY");
  });
});
