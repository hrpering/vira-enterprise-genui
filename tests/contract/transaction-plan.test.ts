import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createViraTransactionRecord,
  freezeViraTransactionPlan,
} from "../../packages/action-transaction/src/index.js";

const NOW = 1_900_000_000_000;
const applicationDigest = "a".repeat(64);
const resolutionDigest = "b".repeat(64);
const beforeDigest = "c".repeat(64);
const scope = {
  version: "1",
  organizationId: "org-demo",
  projectId: "project-demo",
  environment: "staging",
};
const actor = {
  version: "1",
  kind: "user",
  id: "user:alice",
  organizationId: "org-demo",
};
const secretRef = {
  version: "1",
  organizationId: "org-demo",
  projectId: "project-demo",
  environment: "staging",
  provider: "vault",
  key: "providers.demo",
  versionRef: "7",
};

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function operation(id = "publish.document", dependsOn: string[] = []) {
  return {
    operationId: id,
    actionRef: { id: "demo.document.publish", versionRef: "1.0.0" },
    actionIntent: {
      resource: { id: "doc-42", type: "document" },
      payload: { title: "Launch", visibility: "internal" },
    },
    actionBindingRef: { id: "demo.binding.document-publish", versionRef: "1.0.0" },
    providerIdentityRef: "provider.demo",
    connectionId: "demo.connection",
    adapterRef: "adapter.demo",
    runnerRef: "runner.private",
    secretRef,
    resourceType: "document",
    resourceId: "doc-42",
    observedBefore: { ref: "artifact.before.doc-42", digest: beforeDigest, etag: "etag-42" },
    preconditions: [{ kind: "etag-equals", value: "etag-42" }],
    expectedPostconditions: [{ kind: "visibility-equals", value: "internal" }],
    risk: "medium",
    reversibility: "reversible",
    dependsOn,
    idempotencyKey: `tx-demo:${id}`,
    idempotencyStrategy: "provider-native",
    retrySafety: "safe-after-known-no-effect",
    verificationStrategy: "immediate-readback",
    freshnessStrategy: "etag",
    freshnessMaxAgeMs: null,
  };
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    planSchemaVersion: "1",
    canonicalizationVersion: "1",
    transactionId: "transaction.demo.publish",
    applicationRef: { id: "demo.application", version: "1.0.0" },
    applicationDigest,
    deploymentId: "deployment:demo:staging:42",
    resolutionDigest,
    actor,
    agent: null,
    workload: null,
    delegation: {
      principal: actor,
      scope,
      audience: "vira.action-transaction",
      grantIds: [],
    },
    scope,
    workContext: { id: "work.demo.42", revision: 3 },
    operations: [operation()],
    policy: {
      evaluationRefs: ["policy.eval.demo.42"],
      obligations: { confirmation: "required", reason: "external-write" },
    },
    approvalRequirements: [{ kind: "human", minimum: 1 }],
    commercial: {
      entitlementRefs: [{ id: "demo.entitlement.standard", versionRef: "1.0.0" }],
      meteringRefs: [{ id: "demo.meter.write", versionRef: "1.0.0" }],
      pricingRefs: [{ id: "demo.price.write", versionRef: "1.0.0" }],
      settlementRefs: [{ id: "demo.settlement.default", versionRef: "1.0.0" }],
      preflight: { entitled: true, estimatedCostNanos: 1200 },
    },
    createdAtEpochMs: NOW,
    expiresAtEpochMs: NOW + 300_000,
    ...overrides,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("PROD-10 immutable TransactionPlan", () => {
  it("freezes a deterministic exact plan and creates a mutable-state record outside the digest", async () => {
    const frozen = await freezeViraTransactionPlan(plan(), { planRevision: 1, digest });
    expect(frozen).toMatchObject({ ok: true, value: { planRevision: 1 } });
    if (!frozen.ok) throw new Error(frozen.issue.message);
    expect(frozen.value.planDigest).toBe(digest(frozen.value.canonicalPlan));
    expect(Object.isFrozen(frozen.value.plan)).toBe(true);
    expect(Object.isFrozen(frozen.value.plan.policy)).toBe(true);
    expect(Object.isFrozen(frozen.value.plan.operations[0]?.actionIntent)).toBe(true);

    const recordA = createViraTransactionRecord(frozen.value, NOW + 1);
    const recordB = createViraTransactionRecord(frozen.value, NOW + 2);
    expect(recordA).toMatchObject({
      ok: true,
      value: {
        transactionId: "transaction.demo.publish",
        planDigest: frozen.value.planDigest,
        planRevision: 1,
        revision: 1,
        status: "planned",
        approvals: [],
        attempts: [],
        verificationResults: [],
      },
    });
    expect(recordB).toMatchObject({ ok: true, value: { planDigest: frozen.value.planDigest } });
    if (!recordA.ok || !recordB.ok) throw new Error("record creation failed");
    expect(recordA.value.createdAtEpochMs).not.toBe(recordB.value.createdAtEpochMs);
  });

  it("canonicalizes object-key order but changes digest when immutable meaning changes", async () => {
    const first = await freezeViraTransactionPlan(plan(), { planRevision: 1, digest });
    const reordered = clone(plan());
    const firstOperation = reordered.operations[0] as Record<string, unknown>;
    firstOperation.actionIntent = {
      payload: { visibility: "internal", title: "Launch" },
      resource: { type: "document", id: "doc-42" },
    };
    const second = await freezeViraTransactionPlan(reordered, { planRevision: 1, digest });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.canonicalPlan).toBe(first.value.canonicalPlan);
    expect(second.value.planDigest).toBe(first.value.planDigest);

    const changed = clone(plan());
    changed.policy = {
      evaluationRefs: ["policy.eval.demo.42"],
      obligations: { confirmation: "required", reason: "external-write", ticket: "SEC-42" },
    };
    const third = await freezeViraTransactionPlan(changed, { planRevision: 2, digest });
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.value.planDigest).not.toBe(first.value.planDigest);
  });

  it("rejects floating Action and commercial references", async () => {
    const floatingAction = clone(plan());
    floatingAction.operations[0].actionRef.versionRef = "latest";
    await expect(freezeViraTransactionPlan(floatingAction, { planRevision: 1, digest }))
      .resolves.toMatchObject({ ok: false, issue: { code: "INVALID_REFERENCE" } });

    const floatingPrice = clone(plan());
    floatingPrice.commercial.pricingRefs[0].versionRef = "latest";
    await expect(freezeViraTransactionPlan(floatingPrice, { planRevision: 1, digest }))
      .resolves.toMatchObject({ ok: false, issue: { code: "INVALID_REFERENCE" } });
  });

  it("rejects duplicate, dangling, self and cyclic operation dependencies", async () => {
    await expect(freezeViraTransactionPlan(plan({ operations: [operation(), operation()] }), { planRevision: 1, digest }))
      .resolves.toMatchObject({ ok: false, issue: { code: "DUPLICATE_OPERATION" } });
    await expect(freezeViraTransactionPlan(plan({ operations: [operation("publish.document", ["missing.operation"])] }), { planRevision: 1, digest }))
      .resolves.toMatchObject({ ok: false, issue: { code: "UNKNOWN_DEPENDENCY" } });
    await expect(freezeViraTransactionPlan(plan({ operations: [operation("publish.document", ["publish.document"])] }), { planRevision: 1, digest }))
      .resolves.toMatchObject({ ok: false, issue: { code: "SELF_DEPENDENCY" } });
    await expect(freezeViraTransactionPlan(plan({
      operations: [
        operation("prepare.document", ["publish.document"]),
        operation("publish.document", ["prepare.document"]),
      ],
    }), { planRevision: 1, digest })).resolves.toMatchObject({ ok: false, issue: { code: "DEPENDENCY_CYCLE" } });
  });

  it("rejects cross-tenant delegation and operation SecretRef drift", async () => {
    const wrongDelegation = clone(plan());
    wrongDelegation.delegation.scope.projectId = "project-other";
    await expect(freezeViraTransactionPlan(wrongDelegation, { planRevision: 1, digest }))
      .resolves.toMatchObject({ ok: false, issue: { code: "INVALID_DELEGATION" } });

    const wrongSecret = clone(plan());
    wrongSecret.operations[0].secretRef.projectId = "project-other";
    await expect(freezeViraTransactionPlan(wrongSecret, { planRevision: 1, digest }))
      .resolves.toMatchObject({ ok: false, issue: { code: "INVALID_OPERATION" } });
  });

  it("fails closed when digest provider fails or returns a non-SHA256 digest", async () => {
    await expect(freezeViraTransactionPlan(plan(), {
      planRevision: 1,
      digest: () => { throw new Error("offline"); },
    })).resolves.toMatchObject({ ok: false, issue: { code: "DIGEST_PROVIDER_FAILED" } });
    await expect(freezeViraTransactionPlan(plan(), { planRevision: 1, digest: () => "bad" }))
      .resolves.toMatchObject({ ok: false, issue: { code: "INVALID_PLAN_DIGEST" } });
  });
});
