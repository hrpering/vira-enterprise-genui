import { describe, expect, it } from "vitest";
import type { ViraDurableExecutionRecord } from "../../packages/durable-execution/src/index.js";
import { recordViraDurableExecutionPrivateOutcome } from "../../packages/durable-execution/src/outcome.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

function started(overrides: Partial<ViraDurableExecutionRecord> = {}): ViraDurableExecutionRecord {
  return Object.freeze({
    version: "1",
    executionId: "execution.prod12.outcome",
    scope,
    transactionId: "transaction.demo.publish",
    planDigest: "a".repeat(64),
    planRevision: 7,
    operationId: "publish.document",
    grantId: "grant.prod12.outcome",
    grantNonce: "nonce.prod12.outcome",
    idempotencyKey: "tx-demo:publish.document",
    revision: 4,
    status: "executing",
    leaseEpoch: 1,
    lease: Object.freeze({ workerId: "worker.prod12.outcome", epoch: 1, expiresAtEpochMs: NOW + 60_000 }),
    dispatchState: "started",
    createdAtEpochMs: NOW,
    updatedAtEpochMs: NOW + 3,
    ...overrides,
  });
}

function transition(outcome: "accepted" | "rejected" | "uncertain") {
  return recordViraDurableExecutionPrivateOutcome({
    record: started(),
    workerId: "worker.prod12.outcome",
    leaseEpoch: 1,
    expectedRevision: 4,
    nowEpochMs: NOW + 4,
    outcome,
  });
}

describe("PROD-12 fenced private dispatch outcomes", () => {
  it("moves accepted dispatch only to verifying and clears worker ownership", () => {
    const result = transition("accepted");
    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "verifying",
        revision: 5,
        leaseEpoch: 1,
        lease: null,
        dispatchState: "started",
      },
    });
    if (!result.ok) throw new Error(result.issue.message);
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it("moves explicit provider rejection to manual instead of inventing success", () => {
    expect(transition("rejected")).toMatchObject({
      ok: true,
      value: { status: "manual", revision: 5, lease: null },
    });
  });

  it("records transport ambiguity as uncertain", () => {
    expect(transition("uncertain")).toMatchObject({
      ok: true,
      value: { status: "uncertain", revision: 5, lease: null },
    });
  });

  it("fences stale revision and stale worker before any outcome transition", () => {
    expect(recordViraDurableExecutionPrivateOutcome({
      record: started(),
      workerId: "worker.prod12.outcome",
      leaseEpoch: 1,
      expectedRevision: 3,
      nowEpochMs: NOW + 4,
      outcome: "accepted",
    })).toMatchObject({ ok: false, issue: { code: "STALE_REVISION" } });

    expect(recordViraDurableExecutionPrivateOutcome({
      record: started(),
      workerId: "worker.stale",
      leaseEpoch: 1,
      expectedRevision: 4,
      nowEpochMs: NOW + 4,
      outcome: "accepted",
    })).toMatchObject({ ok: false, issue: { code: "STALE_LEASE" } });
  });

  it("refuses an outcome before dispatch-started is durable", () => {
    expect(recordViraDurableExecutionPrivateOutcome({
      record: started({ dispatchState: "not-started" }),
      workerId: "worker.prod12.outcome",
      leaseEpoch: 1,
      expectedRevision: 4,
      nowEpochMs: NOW + 4,
      outcome: "accepted",
    })).toMatchObject({ ok: false, issue: { code: "INVALID_STATE" } });
  });

  it("refuses an outcome after the current lease has expired", () => {
    expect(recordViraDurableExecutionPrivateOutcome({
      record: started({
        lease: Object.freeze({ workerId: "worker.prod12.outcome", epoch: 1, expiresAtEpochMs: NOW + 3 }),
      }),
      workerId: "worker.prod12.outcome",
      leaseEpoch: 1,
      expectedRevision: 4,
      nowEpochMs: NOW + 4,
      outcome: "uncertain",
    })).toMatchObject({ ok: false, issue: { code: "STALE_LEASE" } });
  });
});
