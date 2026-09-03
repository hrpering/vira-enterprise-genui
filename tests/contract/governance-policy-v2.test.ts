import { describe, expect, it } from "vitest";
import {
  createViraGovernancePipeline,
  resolveViraAgentPrincipal,
  type ViraGovernanceContext,
  type ViraGovernanceProvider,
} from "../../packages/governance/src/index.js";

function context(): ViraGovernanceContext {
  return {
    version: "1",
    instanceId: "instance-governance",
    experienceId: "booking.experience",
    experienceVersion: "1.2.0",
    platform: "web",
    userPrincipal: { version: "1", kind: "user", id: "user-1", issuer: "vira.identity" },
    agentPrincipal: { version: "1", kind: "agent", id: "agent-1", issuer: "entra.agent" },
    actionIntent: {
      version: "1",
      instanceId: "instance-governance",
      expectedStateRevision: 7,
      idempotencyKey: "idem:refund-1",
      action: {
        id: "refund-1",
        type: "commerce.refund.submit",
        source: "user",
        payload: { amount: 4000, currency: "EUR" },
      },
    },
  };
}

function provider(
  id: string,
  evaluate: ViraGovernanceProvider["evaluate"],
): ViraGovernanceProvider {
  return { version: "1", id, evaluate };
}

describe("MASTER-09 Governance / Policy v2", () => {
  it("never lets external governance override a Vira Core Safety deny", async () => {
    let calls = 0;
    const created = createViraGovernancePipeline({
      providers: [provider("opa.provider", () => {
        calls += 1;
        return { version: "1", effect: "allow", reasonCode: "allow", obligations: [], provider: "opa.provider" };
      })],
      allowedObligations: [],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await created.value.evaluate({
      coreSafety: { version: "1", effect: "deny", reasonCode: "component-not-allowed" },
      context: context(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("CORE_SAFETY_DENIED");
    expect(calls).toBe(0);
  });

  it("fails closed when a governance provider throws", async () => {
    const created = createViraGovernancePipeline({
      providers: [provider("agt.provider", () => { throw new Error("unavailable"); })],
      allowedObligations: [],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = await created.value.evaluate({
      coreSafety: { version: "1", effect: "allow", reasonCode: "core-pass" },
      context: context(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("PROVIDER_FAILED");
  });

  it("allows transforms only on canonical payload while preserving action identity", async () => {
    const created = createViraGovernancePipeline({
      providers: [provider("cedar.provider", () => ({
        version: "1",
        effect: "transform",
        reasonCode: "cap-refund",
        obligations: [],
        provider: "cedar.provider",
        transformedPayload: { amount: 1000, currency: "EUR" },
      }))],
      allowedObligations: [],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = await created.value.evaluate({
      coreSafety: { version: "1", effect: "allow", reasonCode: "core-pass" },
      context: context(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.context.actionIntent.action.id).toBe("refund-1");
    expect(result.value.context.actionIntent.action.type).toBe("commerce.refund.submit");
    expect(result.value.context.actionIntent.expectedStateRevision).toBe(7);
    expect(result.value.context.actionIntent.idempotencyKey).toBe("idem:refund-1");
    expect(result.value.context.actionIntent.action.payload).toEqual({ amount: 1000, currency: "EUR" });
  });

  it("requires exact approval for challenge verdicts", async () => {
    const created = createViraGovernancePipeline({
      providers: [provider("agt.provider", () => ({
        version: "1",
        effect: "challenge",
        reasonCode: "manager-required",
        obligations: [{ id: "approval.manager" }],
        provider: "agt.provider",
      }))],
      allowedObligations: ["approval.manager"],
      approvalProvider: {
        version: "1",
        id: "vira.approval",
        decide(challenge) {
          return {
            version: "1",
            challengeId: challenge.challengeId,
            decision: "approved",
            approver: { version: "1", kind: "user", id: "manager-1", issuer: "vira.identity" },
            evidenceRef: "evidence:approval-1",
          };
        },
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = await created.value.evaluate({
      coreSafety: { version: "1", effect: "allow", reasonCode: "core-pass" },
      context: context(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.approvals).toHaveLength(1);
      expect(result.value.approvals[0]?.decision).toBe("approved");
    }
  });

  it("returns a portable challenge when no ApprovalProvider is installed", async () => {
    const created = createViraGovernancePipeline({
      providers: [provider("opa.provider", () => ({
        version: "1",
        effect: "challenge",
        reasonCode: "step-up",
        obligations: [],
        provider: "opa.provider",
      }))],
      allowedObligations: [],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = await created.value.evaluate({
      coreSafety: { version: "1", effect: "allow", reasonCode: "core-pass" },
      context: context(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issue.code).toBe("APPROVAL_REQUIRED");
      expect(result.challenge?.actionId).toBe("refund-1");
    }
  });

  it("rejects obligations outside the trusted catalog", async () => {
    const created = createViraGovernancePipeline({
      providers: [provider("custom.provider", () => ({
        version: "1",
        effect: "allow",
        reasonCode: "allow",
        obligations: [{ id: "unknown.obligation" }],
        provider: "custom.provider",
      }))],
      allowedObligations: ["approval.manager"],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = await created.value.evaluate({
      coreSafety: { version: "1", effect: "allow", reasonCode: "core-pass" },
      context: context(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("INVALID_VERDICT");
  });

  it("keeps agent identity resolution separate from governance decisions", async () => {
    const result = await resolveViraAgentPrincipal({
      version: "1",
      id: "entra.identity",
      resolve(request) {
        expect(request.credentialRef).toBe("ref:agent-token");
        return {
          version: "1",
          kind: "agent",
          id: "agent-42",
          issuer: "entra.agent",
          claims: { sponsor: "user-1" },
        };
      },
    }, {
      version: "1",
      instanceId: "instance-governance",
      credentialRef: "ref:agent-token",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe("agent-42");
  });
});
