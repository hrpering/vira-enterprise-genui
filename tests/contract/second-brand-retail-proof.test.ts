import { describe, expect, it } from "vitest";
import { createViraActionBoundary, type ViraActionIntent } from "../../packages/action-boundary/src/index.js";
import { evaluateViraCrossPlatformConformance } from "../../packages/cross-platform-conformance/src/index.js";
import { parseViraExperiencePackComposition } from "../../packages/experience-pack-compositions/src/index.js";
import { createViraGovernancePipeline } from "../../packages/governance/src/index.js";

const instanceId = "instance-retail-return";
const actionIntent: ViraActionIntent = {
  version: "1",
  instanceId,
  expectedStateRevision: 7,
  idempotencyKey: "retail-return-action-1",
  action: {
    id: "return-action-1",
    type: "retail.return.request",
    source: "user",
    payload: {
      orderId: "order-9",
      itemId: "item-2",
      reason: "damaged",
    },
  },
};

const localization = {
  version: "1" as const,
  locale: "en-US",
  direction: "ltr" as const,
  currency: "USD",
  timeZone: "UTC",
  numberingSystem: "latn",
  dateStyle: "medium" as const,
  timeStyle: "short" as const,
  numberStyle: "currency" as const,
};

function snapshot(platform: "web" | "ios" | "android") {
  return {
    version: "1" as const,
    platform,
    experienceId: "retail.return.experience",
    experienceVersion: "1.0.0",
    viewId: "submitted",
    componentSemantics: ["retail.return-summary", "retail.return-status"],
    state: { orderId: "order-9", returnId: "rma-1", status: "submitted" },
    bindings: [{ source: "domain.order", target: "return.summary" }],
    actions: [{ type: "retail.return.request", outcome: "success" }],
    navigation: ["submitted"],
    policyCalls: [{ provider: "policy.retail", effect: "allow" as const, reasonCode: "return-eligible" }],
    accessibility: [{ nodeId: "status", role: "status", label: "Return submitted", value: "rma-1" }],
    localization,
    actionIntent,
    stateRevision: 8,
    outcome: "success" as const,
  };
}

describe("MASTER-24 second-brand proof", () => {
  it("runs a retail return domain through the same composition, governance, action and conformance authorities", async () => {
    const composition = parseViraExperiencePackComposition({
      version: "1",
      id: "retail.return.flow",
      domain: "retail.return",
      document: {
        version: "1",
        id: "retail.return.experience",
        recipeId: "retail.return.recipe",
        entryView: "request",
        views: [
          {
            id: "request",
            nodes: [
              { id: "title", component: "core.text", order: 0, props: { text: "Return an item" } },
              { id: "submit", component: "core.button", order: 1, props: { label: "Request return" } },
            ],
          },
          {
            id: "submitted",
            nodes: [{ id: "status", component: "core.text", order: 0, props: { text: "Return submitted" } }],
          },
        ],
        bindings: [],
        interactions: [
          {
            viewId: "request",
            nodeId: "submit",
            event: "press",
            actionEvent: "retail.return.request",
            routes: [
              { outcome: "success", viewId: "submitted" },
              { outcome: "error", viewId: "request" },
            ],
          },
        ],
      },
      policyTemplates: [{ id: "retail.return.policy", provider: "policy.retail", policyRef: "policies/returns/v1" }],
    });
    expect(composition.ok).toBe(true);
    if (!composition.ok) return;
    expect(composition.value.document.id).toBe("retail.return.experience");

    const governance = createViraGovernancePipeline({
      providers: [{
        version: "1",
        id: "policy.retail",
        evaluate: () => ({
          version: "1",
          effect: "allow",
          reasonCode: "return-eligible",
          obligations: [],
          provider: "policy.retail",
        }),
      }],
      allowedObligations: [],
    });
    expect(governance.ok).toBe(true);
    if (!governance.ok) return;

    for (const platform of ["web", "ios", "android"] as const) {
      const decision = await governance.value.evaluate({
        coreSafety: { version: "1", effect: "allow", reasonCode: "core-safe" },
        context: {
          version: "1",
          instanceId,
          experienceId: composition.value.document.id,
          experienceVersion: "1.0.0",
          platform,
          actionIntent,
        },
      });
      expect(decision.ok).toBe(true);
      if (decision.ok) {
        expect(decision.value.context.actionIntent).toEqual(actionIntent);
        expect(decision.value.verdicts).toHaveLength(1);
        expect(decision.value.verdicts[0]?.effect).toBe("allow");
      }
    }

    let revision = 7;
    const boundary = createViraActionBoundary({
      instanceId,
      catalog: [{ actionType: "retail.return.request", effect: "write", idempotency: "action-id" }],
      permissionPolicy: {
        version: "1",
        rules: [{ subject: "action", id: "retail.return.request", effect: "allow" }],
      },
      revisionProvider: () => revision,
    });
    expect(boundary.ok).toBe(true);
    if (!boundary.ok) return;

    let executions = 0;
    const execution = await boundary.value.execute(actionIntent, () => {
      executions += 1;
      revision = 8;
      return { outcome: "success", stateRevision: 8, data: { returnId: "rma-1" } };
    });
    expect(execution.ok).toBe(true);
    if (execution.ok) {
      expect(execution.value.receipt.actionType).toBe("retail.return.request");
      expect(execution.value.receipt.observedStateRevision).toBe(8);
      expect(execution.value.receipt.data).toEqual({ returnId: "rma-1" });
    }

    const duplicateAtCurrentRevision: ViraActionIntent = {
      ...actionIntent,
      expectedStateRevision: 8,
    };
    const duplicate = await boundary.value.execute(duplicateAtCurrentRevision, () => {
      executions += 1;
      return { outcome: "success", stateRevision: 9 };
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.issue.code).toBe("DUPLICATE_ACTION");
    expect(executions).toBe(1);

    const conformance = evaluateViraCrossPlatformConformance({
      fixtureId: "retail-return-second-brand",
      snapshots: [snapshot("web"), snapshot("ios"), snapshot("android")],
    });
    expect(conformance.ok).toBe(true);
    if (conformance.ok) {
      expect(conformance.value.conformant).toBe(true);
      expect(conformance.value.mismatches).toEqual([]);
    }
  });
});
