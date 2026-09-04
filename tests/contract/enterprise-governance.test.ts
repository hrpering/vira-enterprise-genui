import { describe, expect, it } from "vitest";
import { createViraEnterpriseContext } from "../../packages/enterprise-context/src/index.js";
import { createViraEnterpriseGovernancePipeline } from "../../packages/enterprise-governance/src/index.js";

function governanceContext() {
  return {
    version: "1" as const,
    instanceId: "instance-1",
    experienceId: "checkout.experience",
    experienceVersion: "1",
    platform: "web" as const,
    actionIntent: {
      version: "1" as const,
      instanceId: "instance-1",
      expectedStateRevision: 1,
      idempotencyKey: "idem:1",
      action: { id: "action-1", type: "commerce.order.submit", source: "user" as const, payload: {} },
    },
  };
}

describe("MASTER-12 enterprise governance bridge", () => {
  it("injects exact organization/project/environment and principals into provider context", async () => {
    const enterprise = createViraEnterpriseContext({ organizationId: "acme", projectId: "checkout", environments: ["production"] });
    expect(enterprise.ok).toBe(true);
    if (!enterprise.ok) return;
    const scope = enterprise.value.scope("production");
    const principal = enterprise.value.principal({ version: "1", kind: "agent", id: "agent-1", organizationId: "acme" });
    expect(scope.ok && principal.ok).toBe(true);
    if (!scope.ok || !principal.ok) return;

    let observed = false;
    const pipeline = createViraEnterpriseGovernancePipeline({
      scope: scope.value,
      principals: [principal.value],
      providers: [{
        version: "1",
        id: "governance.enterprise",
        evaluate: (context) => {
          observed = true;
          expect(context.enterpriseScope).toEqual(scope.value);
          expect(context.enterprisePrincipals).toEqual([principal.value]);
          return { version: "1", effect: "allow", reasonCode: "allowed", obligations: [], provider: "governance.enterprise" };
        },
      }],
      allowedObligations: [],
    });
    expect(pipeline.ok).toBe(true);
    if (!pipeline.ok) return;
    const result = await pipeline.value.evaluate({ coreSafety: { version: "1", effect: "allow", reasonCode: "core-ok" }, context: governanceContext() });
    expect(result.ok).toBe(true);
    expect(observed).toBe(true);
  });

  it("rejects cross-organization enterprise principals before any provider can run", () => {
    let called = false;
    const pipeline = createViraEnterpriseGovernancePipeline({
      scope: { version: "1", organizationId: "acme", projectId: "checkout", environment: "production" },
      principals: [{ version: "1", kind: "service", id: "svc-1", organizationId: "other" }],
      providers: [{ version: "1", id: "governance.enterprise", evaluate: () => { called = true; return {}; } }],
      allowedObligations: [],
    });
    expect(pipeline.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("gives enterprise approval providers the same exact scope and principals", async () => {
    const scope = { version: "1" as const, organizationId: "acme", projectId: "checkout", environment: "production" as const };
    const principals = [{ version: "1" as const, kind: "user" as const, id: "manager-1", organizationId: "acme" }];
    let approvalObserved = false;
    const pipeline = createViraEnterpriseGovernancePipeline({
      scope,
      principals,
      providers: [{ version: "1", id: "governance.challenge", evaluate: () => ({ version: "1", effect: "challenge", reasonCode: "manager-required", obligations: [], provider: "governance.challenge" }) }],
      approvalProvider: {
        version: "1",
        id: "approval.enterprise",
        decide: (context) => {
          approvalObserved = true;
          expect(context.enterpriseScope).toEqual(scope);
          expect(context.enterprisePrincipals).toEqual(principals);
          return {
            version: "1",
            challengeId: context.challenge.challengeId,
            decision: "approved",
            approver: { version: "1", kind: "user", id: "manager-1", issuer: "vira.enterprise" },
          };
        },
      },
      allowedObligations: [],
    });
    expect(pipeline.ok).toBe(true);
    if (!pipeline.ok) return;
    const result = await pipeline.value.evaluate({ coreSafety: { version: "1", effect: "allow", reasonCode: "core-ok" }, context: governanceContext() });
    expect(result.ok).toBe(true);
    expect(approvalObserved).toBe(true);
  });
});
