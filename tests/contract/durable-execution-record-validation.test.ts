import { describe, expect, it } from "vitest";
import {
  isViraDurableExecutionRecord,
  type ViraDurableExecutionRecord,
} from "../../packages/durable-execution/src/index.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

function executing(): ViraDurableExecutionRecord {
  return Object.freeze({
    version: "1",
    executionId: "execution.prod12.validation",
    scope,
    transactionId: "transaction.demo.publish",
    planDigest: "a".repeat(64),
    planRevision: 7,
    operationId: "publish.document",
    grantId: "grant.prod12.validation",
    grantNonce: "nonce.prod12.validation",
    idempotencyKey: "tx-demo:publish.document",
    revision: 2,
    status: "executing",
    leaseEpoch: 1,
    lease: Object.freeze({
      workerId: "worker.prod12.validation",
      epoch: 1,
      expiresAtEpochMs: NOW + 30_000,
    }),
    dispatchState: "not-started",
    createdAtEpochMs: NOW,
    updatedAtEpochMs: NOW + 1,
  });
}

describe("PROD-12 canonical durable execution record validation", () => {
  it("accepts canonical executing and non-executing records", () => {
    const active = executing();
    expect(isViraDurableExecutionRecord(active)).toBe(true);
    expect(isViraDurableExecutionRecord({
      ...active,
      revision: 3,
      status: "recovery",
      lease: null,
      updatedAtEpochMs: NOW + 2,
    })).toBe(true);
  });

  it("rejects executing state without a fenced lease", () => {
    expect(isViraDurableExecutionRecord({
      ...executing(),
      lease: null,
    })).toBe(false);
  });

  it("rejects lease epoch drift", () => {
    expect(isViraDurableExecutionRecord({
      ...executing(),
      lease: {
        workerId: "worker.prod12.validation",
        epoch: 2,
        expiresAtEpochMs: NOW + 30_000,
      },
    })).toBe(false);
  });

  it("rejects a non-executing state that still carries worker authority", () => {
    expect(isViraDurableExecutionRecord({
      ...executing(),
      status: "uncertain",
    })).toBe(false);
  });

  it("rejects invalid tenant environment and backwards record time", () => {
    expect(isViraDurableExecutionRecord({
      ...executing(),
      scope: {
        ...scope,
        environment: "development",
      },
    })).toBe(false);
    expect(isViraDurableExecutionRecord({
      ...executing(),
      updatedAtEpochMs: NOW - 1,
    })).toBe(false);
  });
});
