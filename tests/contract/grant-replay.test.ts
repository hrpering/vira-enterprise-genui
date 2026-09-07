import { describe, expect, it } from "vitest";
import {
  VIRA_TRANSACTION_EXECUTION_AUDIENCE,
  createViraHumanApprovalEvidence,
  createViraTransactionComprehension,
  issueViraTransactionExecutionGrant,
  verifyViraTransactionExecutionGrant,
  type ViraTransactionGrantReplayGuard,
} from "../../packages/action-transaction/src/index.js";
import {
  NOW,
  deterministicSignature,
  frozenPlan,
  replayGuard,
  signer,
  user,
  verifier,
} from "./prod11-transaction-fixture.js";

function approved() {
  const frozen = frozenPlan();
  const review = createViraTransactionComprehension(frozen);
  if (!review.ok) throw new Error(review.issue.message);
  const approval = createViraHumanApprovalEvidence({
    approvalId: "approval.demo.001",
    frozen,
    review: review.value,
    issuer: user,
    decision: "approved",
    issuedAtEpochMs: NOW,
    expiresAtEpochMs: NOW + 120_000,
  });
  if (!approval.ok) throw new Error(approval.issue.message);
  return { frozen, approval: approval.value };
}

async function grant() {
  const context = approved();
  const issued = await issueViraTransactionExecutionGrant({
    frozen: context.frozen,
    approval: context.approval,
    operationId: "publish.document",
    grantId: "grant.demo.001",
    nonce: "nonce.demo.001",
    issuedAtEpochMs: NOW + 1,
    expiresAtEpochMs: NOW + 60_000,
    signer: signer(),
  });
  if (!issued.ok) throw new Error(issued.issue.message);
  return { ...context, grant: issued.value };
}

describe("PROD-11 signed execution grant replay contract", () => {
  it("issues one operation-scoped KMS-style signed grant from an exact approved plan", async () => {
    const context = await grant();
    expect(context.grant).toMatchObject({
      version: "1",
      keyId: "kms-key-1",
      payload: {
        transactionId: context.frozen.plan.transactionId,
        planDigest: context.frozen.planDigest,
        planRevision: context.frozen.planRevision,
        operationId: "publish.document",
        approvalId: context.approval.approvalId,
        audience: VIRA_TRANSACTION_EXECUTION_AUDIENCE,
        nonce: "nonce.demo.001",
      },
    });
    expect(JSON.stringify(context.grant)).not.toContain("providers.demo");
    expect(Object.isFrozen(context.grant)).toBe(true);
    expect(Object.isFrozen(context.grant.payload)).toBe(true);
  });

  it("does not mint execution authority from rejected human approval evidence", async () => {
    const frozen = frozenPlan();
    const review = createViraTransactionComprehension(frozen);
    if (!review.ok) throw new Error(review.issue.message);
    const rejected = createViraHumanApprovalEvidence({
      approvalId: "approval.demo.rejected",
      frozen,
      review: review.value,
      issuer: user,
      decision: "rejected",
      issuedAtEpochMs: NOW,
      expiresAtEpochMs: NOW + 120_000,
    });
    if (!rejected.ok) throw new Error(rejected.issue.message);

    expect(await issueViraTransactionExecutionGrant({
      frozen,
      approval: rejected.value,
      operationId: "publish.document",
      grantId: "grant.demo.rejected",
      nonce: "nonce.demo.rejected",
      issuedAtEpochMs: NOW + 1,
      expiresAtEpochMs: NOW + 60_000,
      signer: signer(),
    })).toMatchObject({ ok: false, issue: { code: "APPROVAL_REJECTED" } });
  });

  it("accepts the exact signed grant once and rejects repeated nonce use", async () => {
    const context = await grant();
    const guard = replayGuard();
    const input = {
      frozen: context.frozen,
      grant: context.grant,
      operationId: "publish.document",
      audience: VIRA_TRANSACTION_EXECUTION_AUDIENCE,
      nowEpochMs: NOW + 2,
      verifier: verifier(),
      replayGuard: guard,
    };
    expect(await verifyViraTransactionExecutionGrant(input)).toMatchObject({ ok: true });
    expect(await verifyViraTransactionExecutionGrant(input)).toMatchObject({
      ok: false,
      issue: { code: "REPLAY_REJECTED" },
    });
  });

  it("rejects wrong audience, operation substitution and expiry before replay acceptance", async () => {
    const context = await grant();
    const guard = replayGuard();
    expect(await verifyViraTransactionExecutionGrant({
      frozen: context.frozen,
      grant: context.grant,
      operationId: "publish.document",
      audience: "vira.other-audience",
      nowEpochMs: NOW + 2,
      verifier: verifier(),
      replayGuard: guard,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_AUDIENCE" } });

    expect(await verifyViraTransactionExecutionGrant({
      frozen: context.frozen,
      grant: context.grant,
      operationId: "delete.document",
      audience: VIRA_TRANSACTION_EXECUTION_AUDIENCE,
      nowEpochMs: NOW + 2,
      verifier: verifier(),
      replayGuard: guard,
    })).toMatchObject({ ok: false, issue: { code: "GRANT_MISMATCH" } });

    expect(await verifyViraTransactionExecutionGrant({
      frozen: context.frozen,
      grant: context.grant,
      operationId: "publish.document",
      audience: VIRA_TRANSACTION_EXECUTION_AUDIENCE,
      nowEpochMs: context.grant.payload.expiresAtEpochMs,
      verifier: verifier(),
      replayGuard: guard,
    })).toMatchObject({ ok: false, issue: { code: "GRANT_EXPIRED" } });
    expect(guard.seen.size).toBe(0);
  });

  it("verifies signature and key identity before touching replay state", async () => {
    const context = await grant();
    let replayCalls = 0;
    const guard: ViraTransactionGrantReplayGuard = {
      accept() {
        replayCalls += 1;
        return true;
      },
    };
    const forgedSignature = {
      ...context.grant,
      signature: deterministicSignature("forged-message"),
    };
    expect(await verifyViraTransactionExecutionGrant({
      frozen: context.frozen,
      grant: forgedSignature,
      operationId: "publish.document",
      audience: VIRA_TRANSACTION_EXECUTION_AUDIENCE,
      nowEpochMs: NOW + 2,
      verifier: verifier(),
      replayGuard: guard,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_SIGNATURE" } });

    const wrongKey = {
      ...context.grant,
      keyId: "kms-key-2",
    };
    expect(await verifyViraTransactionExecutionGrant({
      frozen: context.frozen,
      grant: wrongKey,
      operationId: "publish.document",
      audience: VIRA_TRANSACTION_EXECUTION_AUDIENCE,
      nowEpochMs: NOW + 2,
      verifier: verifier("kms-key-1"),
      replayGuard: guard,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_SIGNATURE" } });
    expect(replayCalls).toBe(0);
  });

  it("fails closed when signer, verifier or replay guard fails", async () => {
    const context = approved();
    expect(await issueViraTransactionExecutionGrant({
      frozen: context.frozen,
      approval: context.approval,
      operationId: "publish.document",
      grantId: "grant.demo.signer-failure",
      nonce: "nonce.demo.signer-failure",
      issuedAtEpochMs: NOW + 1,
      expiresAtEpochMs: NOW + 60_000,
      signer: { sign() { throw new Error("kms unavailable"); } },
    })).toMatchObject({ ok: false, issue: { code: "SIGNER_FAILED" } });

    const signed = await grant();
    expect(await verifyViraTransactionExecutionGrant({
      frozen: signed.frozen,
      grant: signed.grant,
      operationId: "publish.document",
      audience: VIRA_TRANSACTION_EXECUTION_AUDIENCE,
      nowEpochMs: NOW + 2,
      verifier: { verify() { throw new Error("kms verify unavailable"); } },
      replayGuard: replayGuard(),
    })).toMatchObject({ ok: false, issue: { code: "VERIFIER_FAILED" } });

    expect(await verifyViraTransactionExecutionGrant({
      frozen: signed.frozen,
      grant: signed.grant,
      operationId: "publish.document",
      audience: VIRA_TRANSACTION_EXECUTION_AUDIENCE,
      nowEpochMs: NOW + 2,
      verifier: verifier(),
      replayGuard: { accept() { throw new Error("replay policy unavailable"); } },
    })).toMatchObject({ ok: false, issue: { code: "REPLAY_GUARD_FAILED" } });
  });

  it("snapshots grant issuance input before awaiting signer", async () => {
    const context = approved();
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const mutableInput = {
      frozen: context.frozen,
      approval: context.approval,
      operationId: "publish.document",
      grantId: "grant.demo.snapshot",
      nonce: "nonce.demo.snapshot",
      issuedAtEpochMs: NOW + 1,
      expiresAtEpochMs: NOW + 60_000,
      signer: {
        async sign({ message }: { message: string }) {
          enter();
          await gate;
          return { keyId: "kms-key-1", signature: deterministicSignature(message) };
        },
      },
    };

    const pending = issueViraTransactionExecutionGrant(mutableInput);
    await entered;
    mutableInput.operationId = "delete.document";
    mutableInput.grantId = "grant.attacker";
    mutableInput.nonce = "nonce.attacker";
    mutableInput.expiresAtEpochMs = NOW + 2;
    release();

    expect(await pending).toMatchObject({
      ok: true,
      value: {
        payload: {
          operationId: "publish.document",
          grantId: "grant.demo.snapshot",
          nonce: "nonce.demo.snapshot",
          expiresAtEpochMs: NOW + 60_000,
        },
      },
    });
  });

  it("snapshots signed grant state before awaiting verifier", async () => {
    const context = await grant();
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const mutableGrant = structuredClone(context.grant) as {
      version: "1";
      keyId: string;
      signature: string;
      payload: typeof context.grant.payload & { nonce: string; operationId: string };
    };
    const guard = replayGuard();
    const pending = verifyViraTransactionExecutionGrant({
      frozen: context.frozen,
      grant: mutableGrant,
      operationId: "publish.document",
      audience: VIRA_TRANSACTION_EXECUTION_AUDIENCE,
      nowEpochMs: NOW + 2,
      verifier: {
        async verify({ message, keyId, signature }) {
          enter();
          await gate;
          return signature === deterministicSignature(message, keyId);
        },
      },
      replayGuard: guard,
    });
    await entered;
    mutableGrant.payload.nonce = "nonce.attacker";
    mutableGrant.payload.operationId = "delete.document";
    mutableGrant.signature = deterministicSignature("attacker");
    release();

    const result = await pending;
    expect(result).toMatchObject({ ok: true, value: { payload: { nonce: "nonce.demo.001", operationId: "publish.document" } } });
    expect(guard.seen.size).toBe(1);
  });
});
