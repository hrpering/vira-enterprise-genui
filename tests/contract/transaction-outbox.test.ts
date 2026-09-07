import { describe, expect, it } from "vitest";
import type { ViraDurableExecutionRecord } from "../../packages/durable-execution/src/index.js";
import {
  createViraDurableExecutionOutboxEvent,
  deliverViraDurableExecutionOutboxEvent,
  type ViraDurableExecutionOutboxConsumer,
} from "../../packages/durable-execution/src/outbox.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

function record(): ViraDurableExecutionRecord {
  return Object.freeze({
    version: "1",
    executionId: "execution.prod12.outbox",
    scope,
    transactionId: "transaction.demo.publish",
    planDigest: "a".repeat(64),
    planRevision: 7,
    operationId: "publish.document",
    grantId: "grant.prod12.outbox",
    grantNonce: "nonce.prod12.outbox",
    idempotencyKey: "tx-demo:publish.document",
    revision: 3,
    status: "executing",
    leaseEpoch: 1,
    lease: Object.freeze({ workerId: "worker.a", epoch: 1, expiresAtEpochMs: NOW + 30_000 }),
    dispatchState: "not-started",
    createdAtEpochMs: NOW,
    updatedAtEpochMs: NOW + 2,
  });
}

function event() {
  const created = createViraDurableExecutionOutboxEvent({
    eventId: "outbox.prod12.execution-3",
    record: record(),
    type: "execution.claimed",
    occurredAtEpochMs: NOW + 2,
    payload: { status: "executing", leaseEpoch: 1 },
  });
  if (!created.ok) throw new Error(created.code);
  return created.value;
}

describe("PROD-12 transactional outbox contract", () => {
  it("freezes stable tenant/execution coordinates into an immutable event", () => {
    const value = event();
    expect(value).toMatchObject({
      version: "1",
      eventId: "outbox.prod12.execution-3",
      scope,
      executionId: "execution.prod12.outbox",
      executionRevision: 3,
      transactionId: "transaction.demo.publish",
      planDigest: "a".repeat(64),
      planRevision: 7,
      operationId: "publish.document",
      type: "execution.claimed",
      payload: { status: "executing", leaseEpoch: 1 },
    });
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.payload)).toBe(true);
  });

  it("supports at-least-once delivery without repeated consumer effects", async () => {
    const seen = new Set<string>();
    let effects = 0;
    const consumer: ViraDurableExecutionOutboxConsumer = {
      accept(input) {
        if (seen.has(input.eventId)) return "duplicate";
        seen.add(input.eventId);
        effects += 1;
        return "accepted";
      },
    };
    expect(await deliverViraDurableExecutionOutboxEvent(event(), consumer)).toEqual({ ok: true, value: "accepted" });
    expect(await deliverViraDurableExecutionOutboxEvent(event(), consumer)).toEqual({ ok: true, value: "duplicate" });
    expect(effects).toBe(1);
  });

  it("fails closed on consumer exceptions or invalid acknowledgement", async () => {
    expect(await deliverViraDurableExecutionOutboxEvent(event(), {
      accept() { throw new Error("downstream unavailable"); },
    })).toEqual({ ok: false, code: "CONSUMER_FAILED" });

    expect(await deliverViraDurableExecutionOutboxEvent(event(), {
      accept() { return "not-a-valid-ack" as never; },
    })).toEqual({ ok: false, code: "INVALID_CONSUMER_RESULT" });
  });

  it("snapshots mutable payload before delivery", () => {
    const payload = { status: "executing", nested: { attempt: 1 } };
    const created = createViraDurableExecutionOutboxEvent({
      eventId: "outbox.prod12.snapshot",
      record: record(),
      type: "execution.state-changed",
      occurredAtEpochMs: NOW + 3,
      payload,
    });
    if (!created.ok) throw new Error(created.code);
    payload.status = "manual";
    payload.nested.attempt = 99;
    expect(created.value.payload).toEqual({ status: "executing", nested: { attempt: 1 } });
  });
});
