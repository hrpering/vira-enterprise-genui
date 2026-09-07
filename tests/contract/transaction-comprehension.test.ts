import { describe, expect, it } from "vitest";
import {
  VIRA_TRANSACTION_APPROVAL_INBOX_KIND,
  createViraTransactionApprovalInboxItem,
  createViraTransactionComprehension,
} from "../../packages/action-transaction/src/index.js";
import { frozenPlan } from "./prod11-transaction-fixture.js";

describe("PROD-11 transaction comprehension", () => {
  it("projects review-only meaning from the exact frozen TransactionPlan", () => {
    const frozen = frozenPlan();
    const result = createViraTransactionComprehension(frozen);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toMatchObject({
      version: "1",
      transactionId: frozen.plan.transactionId,
      planDigest: frozen.planDigest,
      planRevision: frozen.planRevision,
      scope: frozen.plan.scope,
      applicationRef: frozen.plan.applicationRef,
      operations: [{
        operationId: "publish.document",
        actionRef: { id: "demo.document.publish", versionRef: "1.0.0" },
        providerId: "demo",
        resourceType: "document",
        resourceId: "doc-42",
        actionIntent: { resource: { id: "doc-42" }, amount: 1200 },
        risk: "medium",
        reversibility: "reversible",
      }],
      commercialPreflight: { entitled: true, estimatedCostNanos: 1200 },
    });
    expect(result.value.operations[0]?.observedBefore.etag).toBe("etag-42");
    expect(result.value.operations[0]?.expectedPostconditions).toEqual([
      { kind: "visibility-equals", value: "internal" },
    ]);
  });

  it("keeps Transaction Approval as a distinct authority-safe inbox state", () => {
    const frozen = frozenPlan();
    const item = createViraTransactionApprovalInboxItem(frozen, "approval-inbox.demo.001");
    expect(item).toMatchObject({
      ok: true,
      value: {
        version: "1",
        kind: VIRA_TRANSACTION_APPROVAL_INBOX_KIND,
        inboxItemId: "approval-inbox.demo.001",
        status: "awaiting-approval",
        transactionId: frozen.plan.transactionId,
        planDigest: frozen.planDigest,
        planRevision: frozen.planRevision,
      },
    });
    if (!item.ok) return;
    expect(item.value.review.planDigest).toBe(frozen.planDigest);
    expect(Object.isFrozen(item.value)).toBe(true);
    expect(Object.isFrozen(item.value.review)).toBe(true);
    expect(Object.isFrozen(item.value.review.operations)).toBe(true);

    const encoded = JSON.stringify(item.value);
    expect(encoded).not.toContain("human-handoff");
    expect(encoded).not.toContain("providers.demo");
    expect(encoded).not.toContain("runner.private");
    expect(encoded).not.toContain("demo.connection");
    expect(encoded).not.toContain("tx-demo:publish.document");
    expect(item.value).not.toHaveProperty("grant");
    expect(item.value).not.toHaveProperty("secretRef");
    expect(item.value).not.toHaveProperty("taskId");
  });

  it("does not retarget an old Approval Inbox item when plan meaning changes", () => {
    const oldItem = createViraTransactionApprovalInboxItem(frozenPlan(), "approval-inbox.demo.old");
    const changedItem = createViraTransactionApprovalInboxItem(
      frozenPlan({ planDigest: "e".repeat(64), planRevision: 8, amount: 9_900 }),
      "approval-inbox.demo.changed",
    );
    if (!oldItem.ok || !changedItem.ok) throw new Error("expected canonical approval inbox items");

    expect(changedItem.value.planDigest).not.toBe(oldItem.value.planDigest);
    expect(changedItem.value.planRevision).not.toBe(oldItem.value.planRevision);
    expect(changedItem.value.review.operations[0]?.actionIntent).toMatchObject({ amount: 9_900 });
    expect(oldItem.value.review.operations[0]?.actionIntent).toMatchObject({ amount: 1200 });
  });

  it("fails closed on invalid Approval Inbox identity", () => {
    expect(createViraTransactionApprovalInboxItem(frozenPlan(), " bad id ")).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$.inboxItemId" },
    });
  });

  it("does not project SecretRef, runner, connection or idempotency authority into review state", () => {
    const result = createViraTransactionComprehension(frozenPlan());
    if (!result.ok) throw new Error(result.issue.message);
    const encoded = JSON.stringify(result.value);
    expect(encoded).not.toContain("providers.demo");
    expect(encoded).not.toContain("runner.private");
    expect(encoded).not.toContain("demo.connection");
    expect(encoded).not.toContain("tx-demo:publish.document");
  });

  it("returns a deeply frozen projection detached from mutable JSON meaning", () => {
    const frozen = frozenPlan();
    const result = createViraTransactionComprehension(frozen);
    if (!result.ok) throw new Error(result.issue.message);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.operations)).toBe(true);
    expect(Object.isFrozen(result.value.operations[0])).toBe(true);
    expect(Object.isFrozen(result.value.operations[0]?.actionIntent)).toBe(true);
    expect(Object.isFrozen(result.value.policyObligations as object)).toBe(true);
    expect(Object.isFrozen(result.value.commercialPreflight as object)).toBe(true);
  });
});
