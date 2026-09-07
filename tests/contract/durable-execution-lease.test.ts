import { describe, expect, it } from "vitest";
import {
  createPostgresDurableExecutionLeaseStore,
  type PostgresClientLike,
  type PostgresPoolLike,
  type PostgresQueryResult,
} from "../../integrations/postgres/src/index.js";
import type { ViraDurableExecutionRecord } from "../../packages/durable-execution/src/index.js";
import type { ViraDurableExecutionOutboxEvent } from "../../packages/durable-execution/src/outbox.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

function executing(): ViraDurableExecutionRecord {
  return Object.freeze({
    version: "1",
    executionId: "execution.prod12.lease",
    scope,
    transactionId: "transaction.demo.publish",
    planDigest: "a".repeat(64),
    planRevision: 7,
    operationId: "publish.document",
    grantId: "grant.prod12.lease",
    grantNonce: "nonce.prod12.lease",
    idempotencyKey: "tx-demo:publish.document",
    revision: 2,
    status: "executing",
    leaseEpoch: 1,
    lease: Object.freeze({
      workerId: "worker.prod12.lease",
      epoch: 1,
      expiresAtEpochMs: NOW + 30_000,
    }),
    dispatchState: "not-started",
    createdAtEpochMs: NOW,
    updatedAtEpochMs: NOW + 1,
  });
}

function row(record: ViraDurableExecutionRecord, leaseLive = true): Record<string, unknown> {
  return {
    revision: record.revision,
    lease_epoch: record.leaseEpoch,
    lease_worker_id: record.lease?.workerId ?? null,
    lease_live: leaseLive,
    record: structuredClone(record),
  };
}

class LeaseClient implements PostgresClientLike {
  state = executing();
  readonly outbox = new Map<string, ViraDurableExecutionOutboxEvent>();
  readonly calls: string[] = [];
  readonly release = () => undefined;

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<PostgresQueryResult<Row>> {
    const sql = text.replace(/\s+/g, " ").trim();
    this.calls.push(sql);
    let rows: Record<string, unknown>[] = [];

    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      // Transaction shell.
    } else if (sql.startsWith("SELECT set_config(") || sql === "SELECT vira.require_scope()") {
      // Tenant transaction bootstrap.
    } else if (sql.startsWith("SELECT revision") && sql.includes("FROM vira.durable_execution_state")) {
      rows = [row(this.state, true)];
    } else if (sql.startsWith("UPDATE vira.durable_execution_state")) {
      if (
        this.state.revision === values[7]
        && this.state.lease?.workerId === values[8]
        && this.state.leaseEpoch === values[9]
      ) {
        this.state = JSON.parse(String(values[6])) as ViraDurableExecutionRecord;
        rows = [row(this.state)];
      }
    } else if (sql.startsWith("INSERT INTO vira.durable_execution_outbox")) {
      const event = JSON.parse(String(values[6])) as ViraDurableExecutionOutboxEvent;
      if (!this.outbox.has(event.eventId)) {
        this.outbox.set(event.eventId, event);
        rows = [{ token: event.eventId }];
      }
    } else {
      throw new Error(`unexpected fake PostgreSQL query: ${sql}`);
    }

    return { rows: rows as Row[] };
  }
}

class LeasePool implements PostgresPoolLike {
  constructor(readonly client: LeaseClient) {}
  async connect(): Promise<PostgresClientLike> {
    return this.client;
  }
}

describe("PROD-12 PostgreSQL worker lease renewal", () => {
  it("renews only the exact live fenced worker and commits the state plus outbox together", async () => {
    const client = new LeaseClient();
    const store = createPostgresDurableExecutionLeaseStore(new LeasePool(client));

    const result = await store.renew({
      scope,
      executionId: "execution.prod12.lease",
      workerId: "worker.prod12.lease",
      leaseEpoch: 1,
      expectedRevision: 2,
      nowEpochMs: NOW + 2,
      leaseMs: 20_000,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        revision: 3,
        status: "executing",
        leaseEpoch: 1,
        lease: {
          workerId: "worker.prod12.lease",
          epoch: 1,
          expiresAtEpochMs: NOW + 2 + 20_000,
        },
      },
    });
    expect(client.state.revision).toBe(3);
    expect(client.outbox.size).toBe(1);
    const event = [...client.outbox.values()][0];
    expect(event).toMatchObject({
      type: "execution.state-changed",
      executionRevision: 3,
      payload: { reason: "lease-renewed", workerId: "worker.prod12.lease", leaseEpoch: 1 },
    });
    expect(client.calls).toContain("BEGIN");
    expect(client.calls).toContain("COMMIT");
  });

  it("rejects a stale revision without updating state or emitting outbox", async () => {
    const client = new LeaseClient();
    const store = createPostgresDurableExecutionLeaseStore(new LeasePool(client));

    const result = await store.renew({
      scope,
      executionId: "execution.prod12.lease",
      workerId: "worker.prod12.lease",
      leaseEpoch: 1,
      expectedRevision: 1,
      nowEpochMs: NOW + 2,
      leaseMs: 20_000,
    });

    expect(result).toEqual({ ok: false, code: "VERSION_CONFLICT" });
    expect(client.state.revision).toBe(2);
    expect(client.outbox.size).toBe(0);
  });

  it("rejects a stale worker lease before mutation", async () => {
    const client = new LeaseClient();
    const store = createPostgresDurableExecutionLeaseStore(new LeasePool(client));

    const result = await store.renew({
      scope,
      executionId: "execution.prod12.lease",
      workerId: "worker.stale",
      leaseEpoch: 1,
      expectedRevision: 2,
      nowEpochMs: NOW + 2,
      leaseMs: 20_000,
    });

    expect(result).toEqual({ ok: false, code: "INVALID_STATE" });
    expect(client.state.revision).toBe(2);
    expect(client.outbox.size).toBe(0);
  });
});
