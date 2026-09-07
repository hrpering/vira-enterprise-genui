import { describe, expect, it } from "vitest";
import {
  createViraHumanApprovalEvidence,
  createViraTransactionComprehension,
} from "../../packages/action-transaction/src/index.js";
import { NOW, frozenPlan, scope, user } from "./prod11-transaction-fixture.js";

function reviewFor(frozen = frozenPlan()) {
  const review = createViraTransactionComprehension(frozen);
  if (!review.ok) throw new Error(review.issue.message);
  return review.value;
}

describe("PROD-11 ApprovalEvidence binding", () => {
  it("binds a human approval to exact transactionId + planDigest + planRevision", () => {
    const frozen = frozenPlan();
    const review = reviewFor(frozen);
    const result = createViraHumanApprovalEvidence({
      approvalId: "approval.demo.001",
      frozen,
      review,
      issuer: user,
      decision: "approved",
      issuedAtEpochMs: NOW,
      expiresAtEpochMs: NOW + 120_000,
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        approvalId: "approval.demo.001",
        scope,
        transactionId: frozen.plan.transactionId,
        planDigest: frozen.planDigest,
        planRevision: frozen.planRevision,
        issuer: user,
        decision: "approved",
      },
    });
    if (result.ok) expect(Object.isFrozen(result.value)).toBe(true);
  });

  it("rejects stale UI when target/version meaning moved to a different frozen digest", () => {
    const oldFrozen = frozenPlan();
    const staleReview = reviewFor(oldFrozen);
    const changedFrozen = frozenPlan({
      planDigest: "e".repeat(64),
      actionVersion: "2.0.0",
      resourceId: "doc-99",
    });
    expect(createViraHumanApprovalEvidence({
      approvalId: "approval.demo.stale",
      frozen: changedFrozen,
      review: staleReview,
      issuer: user,
      decision: "approved",
      issuedAtEpochMs: NOW,
      expiresAtEpochMs: NOW + 120_000,
    })).toMatchObject({ ok: false, issue: { code: "STALE_REVIEW" } });
  });

  it("rejects stale UI when amount meaning changes under a new frozen digest", () => {
    const oldFrozen = frozenPlan();
    const staleReview = reviewFor(oldFrozen);
    const changedFrozen = frozenPlan({
      planDigest: "f".repeat(64),
      amount: 9_900,
    });
    expect(changedFrozen.plan.operations[0]?.actionIntent).toMatchObject({ amount: 9_900 });
    expect(createViraHumanApprovalEvidence({
      approvalId: "approval.demo.stale-amount",
      frozen: changedFrozen,
      review: staleReview,
      issuer: user,
      decision: "approved",
      issuedAtEpochMs: NOW,
      expiresAtEpochMs: NOW + 120_000,
    })).toMatchObject({ ok: false, issue: { code: "STALE_REVIEW" } });
  });

  it("rejects a stale review when only the plan revision advances", () => {
    const oldFrozen = frozenPlan();
    const staleReview = reviewFor(oldFrozen);
    const revisedFrozen = frozenPlan({ planRevision: oldFrozen.planRevision + 1 });
    expect(revisedFrozen.planDigest).toBe(oldFrozen.planDigest);
    expect(createViraHumanApprovalEvidence({
      approvalId: "approval.demo.stale-revision",
      frozen: revisedFrozen,
      review: staleReview,
      issuer: user,
      decision: "approved",
      issuedAtEpochMs: NOW,
      expiresAtEpochMs: NOW + 120_000,
    })).toMatchObject({ ok: false, issue: { code: "STALE_REVIEW" } });
  });

  it("rejects agent and service self-approval", () => {
    const frozen = frozenPlan();
    const review = reviewFor(frozen);
    for (const kind of ["agent", "service"] as const) {
      expect(createViraHumanApprovalEvidence({
        approvalId: `approval.demo.${kind}`,
        frozen,
        review,
        issuer: { ...user, kind, id: `${kind}:demo` },
        decision: "approved",
        issuedAtEpochMs: NOW,
        expiresAtEpochMs: NOW + 120_000,
      })).toMatchObject({ ok: false, issue: { code: "INVALID_APPROVER" } });
    }
  });

  it("rejects cross-organization approval and plan-outliving approval windows", () => {
    const frozen = frozenPlan();
    const review = reviewFor(frozen);
    expect(createViraHumanApprovalEvidence({
      approvalId: "approval.demo.cross-scope",
      frozen,
      review,
      issuer: { ...user, organizationId: "org-other" },
      decision: "approved",
      issuedAtEpochMs: NOW,
      expiresAtEpochMs: NOW + 120_000,
    })).toMatchObject({ ok: false, issue: { code: "CROSS_SCOPE" } });

    expect(createViraHumanApprovalEvidence({
      approvalId: "approval.demo.too-long",
      frozen,
      review,
      issuer: user,
      decision: "approved",
      issuedAtEpochMs: NOW,
      expiresAtEpochMs: frozen.plan.expiresAtEpochMs + 1,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_TIME_WINDOW" } });
  });
});
