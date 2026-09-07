import { describe, expect, it } from "vitest";
import { claimViraDurableExecution, type ViraDurableExecutionRecord } from "../../packages/durable-execution/src/index.js";
import {
  markViraDurableExecutionDispatchStarted,
  recoverViraDurableExecutionAfterLeaseExpiry,
} from "../../packages/durable-execution/src/restart.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

function executing(): ViraDurableExecutionRecord {
  return Object.freeze({
    version: "1",
    executionId: "execution.prod12.fencing",
    scope,
    transactionId: "transaction.demo.publish",
    planDigest: "a".repeat(64),
    planRevision: 7,
    operationId: "publish.document",
    grantId: "grant.prod12.fencing",
    grantNonce: "nonce.prod12.fencing",
    idempotencyKey: "tx-demo:publish.document",
    revision: 2,
    status: "executing",
    leaseEpoch: 1,
    lease: Object.freeze({ workerId: "worker.a", epoch: 1, expiresAtEpochMs: NOW + 10_000 }),
    dispatchState: "not-started",
    createdAtEpochMs: NOW,
    updatedAtEpochMs: NOW + 1,
  });
}

describe("PROD-12 worker fencing and restart recovery", () => {
  it("recovers an expired pre-dispatch lease and increments epoch on takeover", () => {
    const recovered = recoverViraDurableExecutionAfterLeaseExpiry({
      record: executing(),
      expectedRevision: 2,
      nowEpochMs: NOW + 10_000,
    });
    expect(recovered).toMatchObject({
      ok: true,
      value: { status: "recovery", revision: 3, leaseEpoch: 1, lease: null, dispatchState: "not-started" },
    });
    if (!recovered.ok) throw new Error(recovered.issue.message);

    const takeover = claimViraDurableExecution({
      record: recovered.value,
      workerId: "worker.b",
      nowEpochMs: NOW + 10_001,
      leaseMs: 10_000,
    });
    expect(takeover).toMatchObject({
      ok: true,
      value: { status: "executing", revision: 4, leaseEpoch: 2, lease: { workerId: "worker.b", epoch: 2 } },
    });
  });

  it("turns expired post-dispatch ownership into uncertainty instead of retry authority", () => {
    const started = markViraDurableExecutionDispatchStarted({
      record: executing(),
      workerId: "worker.a",
      leaseEpoch: 1,
      expectedRevision: 2,
      nowEpochMs: NOW + 2,
    });
    expect(started).toMatchObject({ ok: true, value: { dispatchState: "started", revision: 3 } });
    if (!started.ok) throw new Error(started.issue.message);

    const uncertain = recoverViraDurableExecutionAfterLeaseExpiry({
      record: started.value,
      expectedRevision: 3,
      nowEpochMs: NOW + 10_000,
    });
    expect(uncertain).toMatchObject({
      ok: true,
      value: { status: "uncertain", revision: 4, lease: null, dispatchState: "started" },
    });
    if (!uncertain.ok) throw new Error(uncertain.issue.message);

    expect(claimViraDurableExecution({
      record: uncertain.value,
      workerId: "worker.b",
      nowEpochMs: NOW + 10_001,
      leaseMs: 10_000,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_STATE" } });
  });

  it("does not let a stale worker mark dispatch after a takeover-capable revision change", () => {
    expect(markViraDurableExecutionDispatchStarted({
      record: executing(),
      workerId: "worker.stale",
      leaseEpoch: 1,
      expectedRevision: 2,
      nowEpochMs: NOW + 2,
    })).toMatchObject({ ok: false, issue: { code: "STALE_LEASE" } });

    expect(markViraDurableExecutionDispatchStarted({
      record: executing(),
      workerId: "worker.a",
      leaseEpoch: 1,
      expectedRevision: 1,
      nowEpochMs: NOW + 2,
    })).toMatchObject({ ok: false, issue: { code: "STALE_REVISION" } });
  });

  it("refuses recovery while the current lease is still live", () => {
    expect(recoverViraDurableExecutionAfterLeaseExpiry({
      record: executing(),
      expectedRevision: 2,
      nowEpochMs: NOW + 9_999,
    })).toMatchObject({ ok: false, issue: { code: "STALE_LEASE" } });
  });
});
