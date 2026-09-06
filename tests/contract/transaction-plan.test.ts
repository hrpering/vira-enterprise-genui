import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createViraTransactionRecord,
  freezeViraTransactionPlan,
  type ViraTransactionOperationEvidence,
} from "../../packages/action-transaction/src/index.js";

const NOW = 1_900_000_000_000;
const TRUST_UNTIL = NOW + 600_000;
const applicationDigest = "a".repeat(64);
const resolutionDigest = "b".repeat(64);
const beforeDigest = "c".repeat(64);
const scope = {
  version: "1" as const,
  organizationId: "org-demo",
  projectId: "project-demo",
  environment: "staging" as const,
};
const actor = {
  version: "1" as const,
  kind: "user" as const,
  id: "user:alice",
  organizationId: "org-demo",
};
const secretRef = {
  version: "1" as const,
  organizationId: "org-demo",
  projectId: "project-demo",
  environment: "staging" as const,
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
    providerId: "demo",
    providerIdentityRef: "provider.demo",
    connectionId: "demo.connection",
    connectorId: "demo.connector",
    providerOperationId: "document.publish",
    adapterRef: "adapter.demo",
    runnerRef: "runner.private",
    secretRef,
    trustEvidenceRef: "trust.demo.e001",
    trustValidUntilEpochMs: TRUST_UNTIL,
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

function plan(overrides: Record<string, unknown> = {}): any {
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

function evidenceFor(candidate: any): ViraTransactionOperationEvidence[] {
  return candidate.operations.map((entry: any, index: number) => {
    const actionId = `transaction-action-${index}`;
    const instanceId = "instance-transaction-plan";
    return {
      operationId: entry.operationId,
      supply: {
        version: "1",
        bindingRef: entry.actionBindingRef,
        actionRef: entry.actionRef,
        scope: candidate.scope,
        providerId: entry.providerId,
        providerIdentityRef: entry.providerIdentityRef,
        connectionId: entry.connectionId,
        connectorId: entry.connectorId,
        operationId: entry.providerOperationId,
        adapterRef: entry.adapterRef,
        runnerRef: entry.runnerRef,
        secretRef: entry.secretRef,
        trustEvidenceRef: entry.trustEvidenceRef,
        trustValidUntilEpochMs: entry.trustValidUntilEpochMs,
        behavior: {
          idempotencyStrategy: entry.idempotencyStrategy,
          retrySafety: entry.retrySafety,
          verificationStrategy: entry.verificationStrategy,
          freshnessStrategy: entry.freshnessStrategy,
          freshnessMaxAgeMs: entry.freshnessMaxAgeMs,
        },
      },
      preflight: {
        intent: {
          version: "1",
          instanceId,
          expectedStateRevision: candidate.workContext.revision,
          idempotencyKey: entry.idempotencyKey,
          action: {
            id: actionId,
            type: entry.actionRef.id,
            source: "user",
            payload: entry.actionIntent,
          },
        },
        definition: {
          actionType: entry.actionRef.id,
          effect: "write",
          idempotency: "action-id",
        },
        permission: "confirm",
        currentRevision: candidate.workContext.revision,
        challenge: {
          version: "1",
          instanceId,
          actionId,
          actionType: entry.actionRef.id,
          effect: "write",
          expectedStateRevision: candidate.workContext.revision,
          idempotencyKey: entry.idempotencyKey,
        },
      },
    } as ViraTransactionOperationEvidence;
  });
}

function freeze(candidate: any, planRevision = 1, operationEvidence = evidenceFor(candidate)) {
  return freezeViraTransactionPlan(candidate, { planRevision, digest, operationEvidence });
}

describe("PROD-10 immutable TransactionPlan", () => {
  it("freezes a deterministic exact plan only with exact supply and Stage A evidence", async () => {
    const candidate = plan();
    const frozen = await freeze(candidate);
    expect(frozen).toMatchObject({ ok: true, value: { planRevision: 1 } });
    if (!frozen.ok) throw new Error(frozen.issue.message);
    expect(frozen.value.planDigest).toBe(digest(frozen.value.canonicalPlan));
    expect(frozen.value.plan.operations[0]).toMatchObject({
      providerId: "demo",
      connectorId: "demo.connector",
      providerOperationId: "document.publish",
      trustEvidenceRef: "trust.demo.e001",
      trustValidUntilEpochMs: TRUST_UNTIL,
    });
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
    const firstCandidate = plan();
    const first = await freeze(firstCandidate);
    const reordered = clone(plan());
    reordered.operations[0].actionIntent = {
      payload: { visibility: "internal", title: "Launch" },
      resource: { type: "document", id: "doc-42" },
    };
    const second = await freeze(reordered);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.canonicalPlan).toBe(first.value.canonicalPlan);
    expect(second.value.planDigest).toBe(first.value.planDigest);

    const changed = clone(plan());
    changed.policy = {
      evaluationRefs: ["policy.eval.demo.42"],
      obligations: { confirmation: "required", reason: "external-write", ticket: "SEC-42" },
    };
    const third = await freeze(changed, 2);
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.value.planDigest).not.toBe(first.value.planDigest);
  });

  it("prevents policy/commercial transform after freeze", async () => {
    const frozen = await freeze(plan());
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) return;
    expect(Reflect.set(frozen.value.plan.policy.obligations as object, "ticket", "SEC-99")).toBe(false);
    expect(Reflect.set(frozen.value.plan.commercial.preflight as object, "estimatedCostNanos", 1)).toBe(false);
    expect(frozen.value.planDigest).toBe(digest(frozen.value.canonicalPlan));
  });

  it("rejects a direct freeze bypass without operation evidence", async () => {
    const candidate = plan();
    await expect(freezeViraTransactionPlan(candidate, {
      planRevision: 1,
      digest,
      operationEvidence: [],
    })).resolves.toMatchObject({ ok: false, issue: { code: "MISSING_OPERATION_EVIDENCE" } });
  });

  it("rejects supply substitution and Stage A preflight substitution", async () => {
    const candidate = plan();
    const wrongSupply = evidenceFor(candidate);
    wrongSupply[0] = {
      ...wrongSupply[0]!,
      supply: { ...wrongSupply[0]!.supply, adapterRef: "adapter.attacker" },
    };
    await expect(freeze(candidate, 1, wrongSupply))
      .resolves.toMatchObject({ ok: false, issue: { code: "SUPPLY_MISMATCH" } });

    const wrongPreflight = evidenceFor(candidate);
    wrongPreflight[0] = {
      ...wrongPreflight[0]!,
      preflight: {
        ...wrongPreflight[0]!.preflight,
        intent: {
          ...wrongPreflight[0]!.preflight.intent,
          action: {
            ...wrongPreflight[0]!.preflight.intent.action,
            type: "demo.document.delete",
          },
        },
      },
    };
    await expect(freeze(candidate, 1, wrongPreflight))
      .resolves.toMatchObject({ ok: false, issue: { code: "PREFLIGHT_MISMATCH" } });
  });

  it("rejects a plan that outlives the provider trust window used to freeze it", async () => {
    const candidate = plan();
    candidate.operations[0].trustValidUntilEpochMs = NOW + 120_000;
    await expect(freeze(candidate))
      .resolves.toMatchObject({ ok: false, issue: { code: "TRUST_WINDOW_TOO_SHORT" } });
  });

  it("rejects floating Action and commercial references", async () => {
    const floatingAction = clone(plan());
    floatingAction.operations[0].actionRef.versionRef = "latest";
    await expect(freeze(floatingAction))
      .resolves.toMatchObject({ ok: false, issue: { code: "INVALID_REFERENCE" } });

    const floatingPrice = clone(plan());
    floatingPrice.commercial.pricingRefs[0].versionRef = "latest";
    await expect(freeze(floatingPrice))
      .resolves.toMatchObject({ ok: false, issue: { code: "INVALID_REFERENCE" } });
  });

  it("rejects duplicate, dangling, self and cyclic operation dependencies", async () => {
    const duplicate = plan({ operations: [operation(), operation()] });
    await expect(freeze(duplicate)).resolves.toMatchObject({ ok: false, issue: { code: "DUPLICATE_OPERATION" } });

    const dangling = plan({ operations: [operation("publish.document", ["missing.operation"])] });
    await expect(freeze(dangling)).resolves.toMatchObject({ ok: false, issue: { code: "UNKNOWN_DEPENDENCY" } });

    const self = plan({ operations: [operation("publish.document", ["publish.document"])] });
    await expect(freeze(self)).resolves.toMatchObject({ ok: false, issue: { code: "SELF_DEPENDENCY" } });

    const cyclic = plan({
      operations: [
        operation("prepare.document", ["publish.document"]),
        operation("publish.document", ["prepare.document"]),
      ],
    });
    await expect(freeze(cyclic)).resolves.toMatchObject({ ok: false, issue: { code: "DEPENDENCY_CYCLE" } });
  });

  it("rejects cross-tenant delegation and operation SecretRef drift", async () => {
    const wrongDelegation = clone(plan());
    wrongDelegation.delegation.scope.projectId = "project-other";
    await expect(freeze(wrongDelegation))
      .resolves.toMatchObject({ ok: false, issue: { code: "INVALID_DELEGATION" } });

    const wrongSecret = clone(plan());
    wrongSecret.operations[0].secretRef.projectId = "project-other";
    await expect(freeze(wrongSecret))
      .resolves.toMatchObject({ ok: false, issue: { code: "INVALID_OPERATION" } });
  });

  it("fails closed when digest provider fails or returns a non-SHA256 digest", async () => {
    const candidate = plan();
    const operationEvidence = evidenceFor(candidate);
    await expect(freezeViraTransactionPlan(candidate, {
      planRevision: 1,
      operationEvidence,
      digest: () => { throw new Error("offline"); },
    })).resolves.toMatchObject({ ok: false, issue: { code: "DIGEST_PROVIDER_FAILED" } });
    await expect(freezeViraTransactionPlan(candidate, {
      planRevision: 1,
      operationEvidence,
      digest: () => "bad",
    })).resolves.toMatchObject({ ok: false, issue: { code: "INVALID_PLAN_DIGEST" } });
  });
});
