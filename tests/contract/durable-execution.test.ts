import { describe, expect, it } from "vitest";
import {
  createViraHumanApprovalEvidence,
  createViraTransactionComprehension,
  issueViraTransactionExecutionGrant,
} from "../../packages/action-transaction/src/index.js";
import {
  claimViraDurableExecution,
  consumeViraDurableExecutionStageB,
  createViraDurableExecutionRecord,
  renewViraDurableExecutionLease,
  type ViraDurableExecutionStageBStore,
} from "../../packages/durable-execution/src/index.js";
import {
  NOW,
  deterministicSignature,
  frozenPlan,
  signer,
  user,
  verifier,
} from "./prod11-transaction-fixture.js";

async function context() {
  const frozen = frozenPlan();
  const review = createViraTransactionComprehension(frozen);
  if (!review.ok) throw new Error(review.issue.message);
  const approval = createViraHumanApprovalEvidence({
    approvalId: "approval.prod12.001",
    frozen,
    review: review.value,
    issuer: user,
    decision: "approved",
    issuedAtEpochMs: NOW,
    expiresAtEpochMs: NOW + 120_000,
  });
  if (!approval.ok) throw new Error(approval.issue.message);
  const grant = await issueViraTransactionExecutionGrant({
    frozen,
    approval: approval.value,
    operationId: "publish.document",
    grantId: "grant.prod12.001",
    nonce: "nonce.prod12.001",
    issuedAtEpochMs: NOW + 1,
    expiresAtEpochMs: NOW + 60_000,
    signer: signer(),
  });
  if (!grant.ok) throw new Error(grant.issue.message);
  const queued = createViraDurableExecutionRecord({
    executionId: "execution.prod12.001",
    frozen,
    grant: grant.value,
    operationId: "publish.document",
    createdAtEpochMs: NOW + 1,
  });
  if (!queued.ok) throw new Error(queued.issue.message);
  const claimed = claimViraDurableExecution({
    record: queued.value,
    workerId: "worker.prod12.a",
    nowEpochMs: NOW + 2,
    leaseMs: 30_000,
  });
  if (!claimed.ok) throw new Error(claimed.issue.message);
  return { frozen, grant: grant.value, queued: queued.value, claimed: claimed.value };
}

function memoryAuthorityStore(): ViraDurableExecutionStageBStore & {
  readonly calls: Array<Record<string, unknown>>;
  readonly nonces: Set<string>;
  readonly idempotencyKeys: Set<string>;
} {
  const calls: Array<Record<string, unknown>> = [];
  const nonces = new Set<string>();
  const idempotencyKeys = new Set<string>();
  return {
    calls,
    nonces,
    idempotencyKeys,
    consumeGrantAndReserveEffect(input) {
      calls.push({ ...input });
      const nonceKey = `${input.scope.organizationId}/${input.scope.projectId}/${input.scope.environment}/${input.nonce}`;
      const idempotencyKey = `${input.scope.organizationId}/${input.scope.projectId}/${input.scope.environment}/${input.idempotencyKey}`;
      if (nonces.has(nonceKey)) return { ok: false, code: "NONCE_REPLAY" };
      if (idempotencyKeys.has(idempotencyKey)) return { ok: false, code: "IDEMPOTENCY_CONFLICT" };
      nonces.add(nonceKey);
      idempotencyKeys.add(idempotencyKey);
      return {
        ok: true,
        value: {
          revision: input.expectedRevision + 1,
          reservationId: `reservation:${input.executionId}:${input.leaseEpoch}`,
        },
      };
    },
  };
}

describe("PROD-12 durable protected execution", () => {
  it("creates a frozen queued record and claims it with a monotonic lease epoch", async () => {
    const ctx = await context();
    expect(ctx.queued).toMatchObject({
      version: "1",
      status: "queued",
      revision: 1,
      leaseEpoch: 0,
      lease: null,
      transactionId: ctx.frozen.plan.transactionId,
      planDigest: ctx.frozen.planDigest,
      planRevision: ctx.frozen.planRevision,
      operationId: "publish.document",
      grantId: "grant.prod12.001",
      grantNonce: "nonce.prod12.001",
    });
    expect(Object.isFrozen(ctx.queued)).toBe(true);
    expect(ctx.claimed).toMatchObject({
      status: "executing",
      revision: 2,
      leaseEpoch: 1,
      lease: { workerId: "worker.prod12.a", epoch: 1, expiresAtEpochMs: NOW + 2 + 30_000 },
    });
  });

  it("consumes verified grant nonce and effect reservation through one Stage B store call", async () => {
    const ctx = await context();
    const store = memoryAuthorityStore();
    const result = await consumeViraDurableExecutionStageB({
      record: ctx.claimed,
      frozen: ctx.frozen,
      grant: ctx.grant,
      operationId: "publish.document",
      workerId: "worker.prod12.a",
      leaseEpoch: 1,
      expectedRevision: 2,
      nowEpochMs: NOW + 3,
      verifier: verifier(),
      store,
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        executionId: "execution.prod12.001",
        operationId: "publish.document",
        grantId: "grant.prod12.001",
        grantNonce: "nonce.prod12.001",
        idempotencyKey: "tx-demo:publish.document",
        workerId: "worker.prod12.a",
        leaseEpoch: 1,
        reservationRevision: 3,
      },
    });
    expect(store.calls).toHaveLength(1);
    expect(store.nonces.size).toBe(1);
    expect(store.idempotencyKeys.size).toBe(1);
    if (!result.ok) throw new Error(result.issue.message);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(JSON.stringify(result.value)).not.toContain("credential");
  });

  it("rejects replayed nonce/effect authority instead of issuing a second permit", async () => {
    const ctx = await context();
    const store = memoryAuthorityStore();
    const input = {
      record: ctx.claimed,
      frozen: ctx.frozen,
      grant: ctx.grant,
      operationId: "publish.document",
      workerId: "worker.prod12.a",
      leaseEpoch: 1,
      expectedRevision: 2,
      nowEpochMs: NOW + 3,
      verifier: verifier(),
      store,
    };
    expect(await consumeViraDurableExecutionStageB(input)).toMatchObject({ ok: true });
    expect(await consumeViraDurableExecutionStageB(input)).toMatchObject({
      ok: false,
      issue: { code: "AUTHORITY_REJECTED" },
    });
    expect(store.calls).toHaveLength(2);
  });

  it("verifies signature before durable nonce/effect reservation", async () => {
    const ctx = await context();
    const store = memoryAuthorityStore();
    const forged = {
      ...ctx.grant,
      signature: deterministicSignature("attacker-message"),
    };
    expect(await consumeViraDurableExecutionStageB({
      record: ctx.claimed,
      frozen: ctx.frozen,
      grant: forged,
      operationId: "publish.document",
      workerId: "worker.prod12.a",
      leaseEpoch: 1,
      expectedRevision: 2,
      nowEpochMs: NOW + 3,
      verifier: verifier(),
      store,
    })).toMatchObject({ ok: false, issue: { code: "GRANT_REJECTED" } });
    expect(store.calls).toHaveLength(0);
  });

  it("fences stale workers and stale revisions before touching authority state", async () => {
    const ctx = await context();
    const store = memoryAuthorityStore();
    expect(await consumeViraDurableExecutionStageB({
      record: ctx.claimed,
      frozen: ctx.frozen,
      grant: ctx.grant,
      operationId: "publish.document",
      workerId: "worker.prod12.stale",
      leaseEpoch: 1,
      expectedRevision: 2,
      nowEpochMs: NOW + 3,
      verifier: verifier(),
      store,
    })).toMatchObject({ ok: false, issue: { code: "STALE_LEASE" } });
    expect(await consumeViraDurableExecutionStageB({
      record: ctx.claimed,
      frozen: ctx.frozen,
      grant: ctx.grant,
      operationId: "publish.document",
      workerId: "worker.prod12.a",
      leaseEpoch: 1,
      expectedRevision: 1,
      nowEpochMs: NOW + 3,
      verifier: verifier(),
      store,
    })).toMatchObject({ ok: false, issue: { code: "STALE_REVISION" } });
    expect(store.calls).toHaveLength(0);
  });

  it("renews only the current live fenced lease", async () => {
    const ctx = await context();
    expect(renewViraDurableExecutionLease({
      record: ctx.claimed,
      workerId: "worker.prod12.a",
      leaseEpoch: 1,
      expectedRevision: 2,
      nowEpochMs: NOW + 4,
      leaseMs: 20_000,
    })).toMatchObject({ ok: true, value: { revision: 3, lease: { epoch: 1 } } });

    expect(renewViraDurableExecutionLease({
      record: ctx.claimed,
      workerId: "worker.prod12.b",
      leaseEpoch: 1,
      expectedRevision: 2,
      nowEpochMs: NOW + 4,
      leaseMs: 20_000,
    })).toMatchObject({ ok: false, issue: { code: "STALE_LEASE" } });
  });

  it("fails closed when the atomic authority store fails", async () => {
    const ctx = await context();
    expect(await consumeViraDurableExecutionStageB({
      record: ctx.claimed,
      frozen: ctx.frozen,
      grant: ctx.grant,
      operationId: "publish.document",
      workerId: "worker.prod12.a",
      leaseEpoch: 1,
      expectedRevision: 2,
      nowEpochMs: NOW + 3,
      verifier: verifier(),
      store: {
        consumeGrantAndReserveEffect() {
          throw new Error("postgres unavailable");
        },
      },
    })).toMatchObject({ ok: false, issue: { code: "AUTHORITY_STORE_FAILED" } });
  });
});
