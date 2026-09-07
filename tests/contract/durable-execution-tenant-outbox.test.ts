import { describe, expect, it } from "vitest";
import {
  createPostgresDurableExecutionStore,
  type PostgresClientLike,
  type PostgresPoolLike,
  type PostgresQueryResult,
} from "../../integrations/postgres/src/index.js";
import type { ViraDurableExecutionRecord } from "../../packages/durable-execution/src/index.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

function queued(): ViraDurableExecutionRecord {
  return Object.freeze({
    version: "1",
    executionId: "execution.prod12.tenant",
    scope,
    transactionId: "transaction.demo.publish",
    planDigest: "a".repeat(64),
    planRevision: 7,
    operationId: "publish.document",
    grantId: "grant.prod12.tenant",
    grantNonce: "nonce.prod12.tenant",
    idempotencyKey: "tx-demo:publish.document",
    revision: 1,
    status: "queued",
    leaseEpoch: 0,
    lease: null,
    dispatchState: "not-started",
    createdAtEpochMs: NOW,
    updatedAtEpochMs: NOW,
  });
}

function stateRow(record: ViraDurableExecutionRecord): Record<string, unknown> {
  return {
    organization_id: record.scope.organizationId,
    project_id: record.scope.projectId,
    environment: record.scope.environment,
    execution_id: record.executionId,
    transaction_id: record.transactionId,
    plan_digest: record.planDigest,
    plan_revision: record.planRevision,
    operation_id: record.operationId,
    grant_id: record.grantId,
    grant_nonce: record.grantNonce,
    idempotency_key: record.idempotencyKey,
    revision: record.revision,
    status: record.status,
    lease_epoch: record.leaseEpoch,
    lease_worker_id: null,
    dispatch_state: record.dispatchState,
    record: structuredClone(record),
  };
}

class TenantOutboxClient implements PostgresClientLike {
  readonly state = queued();
  readonly receipts = new Set<string>();
  readonly eventIds = new Set(["event.prod12.1", "event.prod12.2"]);
  readonly calls: Array<{ readonly text: string; readonly values: readonly unknown[] }> = [];
  stateMutationCount = 0;
  readonly release = () => undefined;

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<PostgresQueryResult<Row>> {
    const sql = text.replace(/\s+/g, " ").trim();
    this.calls.push({ text: sql, values });
    let rows: Record<string, unknown>[] = [];

    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      // Transaction shell.
    } else if (sql.startsWith("SELECT set_config(") || sql === "SELECT vira.require_scope()") {
      // Tenant transaction bootstrap.
    } else if (sql.includes("FROM vira.durable_execution_state") && sql.includes("FOR UPDATE SKIP LOCKED")) {
      const exactTenant = values[0] === this.state.scope.organizationId
        && values[1] === this.state.scope.projectId
        && values[2] === this.state.scope.environment;
      if (exactTenant) rows = [stateRow(this.state)];
    } else if (sql.startsWith("UPDATE vira.durable_execution_state")) {
      this.stateMutationCount += 1;
      throw new Error("cross-tenant claim test must not mutate state");
    } else if (sql.startsWith("INSERT INTO vira.durable_execution_outbox_consumer")) {
      const eventId = String(values[3]);
      const consumerId = String(values[4]);
      if (!this.eventIds.has(eventId)) throw new Error("foreign key violation: unknown outbox event");
      const key = `${eventId}/${consumerId}`;
      if (!this.receipts.has(key)) {
        this.receipts.add(key);
        rows = [{ token: consumerId }];
      }
    } else {
      throw new Error(`unexpected fake PostgreSQL query: ${sql}`);
    }

    return { rows: rows as Row[] };
  }
}

class TenantOutboxPool implements PostgresPoolLike {
  constructor(readonly client: TenantOutboxClient) {}
  async connect(): Promise<PostgresClientLike> {
    return this.client;
  }
}

describe("PROD-12 tenant claim and outbox acknowledgement safety", () => {
  it("never claims a queued execution through another tenant scope", async () => {
    const client = new TenantOutboxClient();
    const store = createPostgresDurableExecutionStore(new TenantOutboxPool(client));
    const otherScope = Object.freeze({
      version: "1" as const,
      organizationId: "org-other",
      projectId: "project-other",
      environment: "staging" as const,
    });

    const claimed = await store.claimNext({
      scope: otherScope,
      workerId: "worker.prod12.other",
      nowEpochMs: NOW + 1,
      leaseMs: 30_000,
    });

    expect(claimed).toBeUndefined();
    expect(client.stateMutationCount).toBe(0);
    const claim = client.calls.find(({ text }) => text.includes("FOR UPDATE SKIP LOCKED"));
    expect(claim?.text).toContain("organization_id = $1 AND project_id = $2 AND environment = $3");
    expect(claim?.values.slice(0, 3)).toEqual(["org-other", "project-other", "staging"]);
  });

  it("keeps out-of-order receipts per-event idempotent without mutating execution state", async () => {
    const client = new TenantOutboxClient();
    const store = createPostgresDurableExecutionStore(new TenantOutboxPool(client));
    const consumerId = "consumer.prod12.projection";

    expect(await store.acceptOutboxConsumer({ scope, eventId: "event.prod12.2", consumerId })).toBe("accepted");
    expect(await store.acceptOutboxConsumer({ scope, eventId: "event.prod12.1", consumerId })).toBe("accepted");
    expect(await store.acceptOutboxConsumer({ scope, eventId: "event.prod12.2", consumerId })).toBe("duplicate");
    expect(await store.acceptOutboxConsumer({ scope, eventId: "event.prod12.1", consumerId })).toBe("duplicate");

    expect(client.receipts.size).toBe(2);
    expect(client.stateMutationCount).toBe(0);
  });

  it("fails closed when acknowledgement references an unknown outbox event", async () => {
    const client = new TenantOutboxClient();
    const store = createPostgresDurableExecutionStore(new TenantOutboxPool(client));

    await expect(store.acceptOutboxConsumer({
      scope,
      eventId: "event.prod12.missing",
      consumerId: "consumer.prod12.projection",
    })).rejects.toThrow(/unknown outbox event/);
    expect(client.receipts.size).toBe(0);
    expect(client.stateMutationCount).toBe(0);
  });
});
