import { describe, expect, it } from "vitest";
import {
  createPostgresDurableExecutionStore,
  type PostgresClientLike,
  type PostgresPoolLike,
  type PostgresQueryResult,
} from "../../integrations/postgres/src/index.js";
import type { ViraDurableExecutionRecord } from "../../packages/durable-execution/src/index.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

interface NonceOwner {
  readonly grantId: string;
  readonly executionId: string;
}

interface IdempotencyOwner {
  readonly reservationId: string;
  readonly executionId: string;
  readonly transactionId: string;
  readonly planDigest: string;
  readonly planRevision: number;
  readonly operationId: string;
}

interface EffectOwner {
  readonly reservationId: string;
  readonly executionId: string;
  readonly boundLeaseEpoch: number;
}

function executing(input: {
  readonly revision: number;
  readonly workerId: string;
  readonly leaseEpoch: number;
  readonly dispatchState?: "not-started" | "started";
}): ViraDurableExecutionRecord {
  return {
    version: "1",
    executionId: "execution.prod12.rebind",
    scope,
    transactionId: "transaction.demo.publish",
    planDigest: "a".repeat(64),
    planRevision: 7,
    operationId: "publish.document",
    grantId: "grant.prod12.rebind",
    grantNonce: "nonce.prod12.rebind",
    idempotencyKey: "tx-demo:publish.document",
    revision: input.revision,
    status: "executing",
    leaseEpoch: input.leaseEpoch,
    lease: {
      workerId: input.workerId,
      epoch: input.leaseEpoch,
      expiresAtEpochMs: NOW + 120_000,
    },
    dispatchState: input.dispatchState ?? "not-started",
    createdAtEpochMs: NOW,
    updatedAtEpochMs: NOW + input.revision,
  };
}

function row(record: ViraDurableExecutionRecord): Record<string, unknown> {
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
    lease_worker_id: record.lease?.workerId ?? null,
    dispatch_state: record.dispatchState,
    record: structuredClone(record),
    lease_live: true,
  };
}

class RebindClient implements PostgresClientLike {
  state: ViraDurableExecutionRecord;
  readonly nonces = new Map<string, NonceOwner>();
  readonly idempotency = new Map<string, IdempotencyOwner>();
  readonly effects = new Map<string, EffectOwner>();
  readonly calls: string[] = [];
  readonly release = () => undefined;

  constructor(state: ViraDurableExecutionRecord) {
    this.state = state;
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<PostgresQueryResult<Row>> {
    const sql = text.replace(/\s+/g, " ").trim();
    this.calls.push(sql);
    let rows: Record<string, unknown>[] = [];

    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
      // No mutation occurs before a same-epoch effect conflict in this focused fake.
    } else if (sql.startsWith("SELECT set_config(") || sql === "SELECT vira.require_scope()") {
      // Tenant transaction bootstrap.
    } else if (sql.includes("FROM vira.durable_execution_state") && sql.includes("AS lease_live")) {
      rows = [row(this.state)];
    } else if (sql.startsWith("INSERT INTO vira.durable_execution_nonce")) {
      const nonce = String(values[3]);
      if (!this.nonces.has(nonce)) {
        this.nonces.set(nonce, {
          grantId: String(values[4]),
          executionId: String(values[5]),
        });
        rows = [{ token: nonce }];
      }
    } else if (sql.startsWith("SELECT nonce AS token")) {
      const nonce = String(values[3]);
      const existing = this.nonces.get(nonce);
      if (
        existing !== undefined
        && existing.grantId === String(values[4])
        && existing.executionId === String(values[5])
      ) rows = [{ token: nonce }];
    } else if (sql.startsWith("INSERT INTO vira.durable_execution_idempotency_reservation")) {
      const key = String(values[3]);
      if (!this.idempotency.has(key)) {
        const owner: IdempotencyOwner = {
          reservationId: String(values[4]),
          executionId: String(values[5]),
          transactionId: String(values[6]),
          planDigest: String(values[7]),
          planRevision: Number(values[8]),
          operationId: String(values[9]),
        };
        this.idempotency.set(key, owner);
        rows = [{ token: owner.reservationId }];
      }
    } else if (sql.startsWith("SELECT reservation_id AS token") && sql.includes("durable_execution_idempotency_reservation")) {
      const key = String(values[3]);
      const existing = this.idempotency.get(key);
      if (
        existing !== undefined
        && existing.reservationId === String(values[4])
        && existing.executionId === String(values[5])
        && existing.transactionId === String(values[6])
        && existing.planDigest === String(values[7])
        && existing.planRevision === Number(values[8])
        && existing.operationId === String(values[9])
      ) rows = [{ token: existing.reservationId }];
    } else if (sql.startsWith("INSERT INTO vira.durable_execution_effect_reservation")) {
      const key = `${values[3]}/${values[4]}/${values[5]}/${values[6]}`;
      if (!this.effects.has(key)) {
        const owner: EffectOwner = {
          reservationId: String(values[7]),
          executionId: String(values[8]),
          boundLeaseEpoch: Number(values[9]),
        };
        this.effects.set(key, owner);
        rows = [{ token: owner.reservationId }];
      }
    } else if (sql.startsWith("UPDATE vira.durable_execution_effect_reservation")) {
      const key = `${values[3]}/${values[4]}/${values[5]}/${values[6]}`;
      const existing = this.effects.get(key);
      const nextEpoch = Number(values[9]);
      if (
        existing !== undefined
        && existing.reservationId === String(values[7])
        && existing.executionId === String(values[8])
        && existing.boundLeaseEpoch < nextEpoch
      ) {
        this.effects.set(key, { ...existing, boundLeaseEpoch: nextEpoch });
        rows = [{ token: existing.reservationId }];
      }
    } else if (sql.startsWith("UPDATE vira.durable_execution_state") && sql.includes("SET revision = revision + 1")) {
      if (
        this.state.revision === values[4]
        && this.state.lease?.workerId === values[5]
        && this.state.leaseEpoch === values[6]
        && this.state.dispatchState === "not-started"
      ) {
        this.state = {
          ...this.state,
          revision: this.state.revision + 1,
          updatedAtEpochMs: this.state.updatedAtEpochMs + 1,
        };
        rows = [{ revision: this.state.revision }];
      }
    } else {
      throw new Error(`unexpected fake PostgreSQL query: ${sql}`);
    }

    return { rows: rows as Row[] };
  }
}

class RebindPool implements PostgresPoolLike {
  constructor(readonly client: RebindClient) {}
  async connect(): Promise<PostgresClientLike> {
    return this.client;
  }
}

function authorityInput(record: ViraDurableExecutionRecord) {
  return {
    scope: record.scope,
    executionId: record.executionId,
    expectedRevision: record.revision,
    workerId: record.lease!.workerId,
    leaseEpoch: record.leaseEpoch,
    transactionId: record.transactionId,
    planDigest: record.planDigest,
    planRevision: record.planRevision,
    operationId: record.operationId,
    grantId: record.grantId,
    nonce: record.grantNonce,
    nonceExpiresAtEpochMs: NOW + 60_000,
    idempotencyKey: record.idempotencyKey,
  };
}

describe("PROD-12 crash-before-dispatch authority rebind", () => {
  it("rejects a second Stage B permit in the same lease epoch, then rebinds once after a higher-epoch takeover", async () => {
    const client = new RebindClient(executing({ revision: 2, workerId: "worker.a", leaseEpoch: 1 }));
    const store = createPostgresDurableExecutionStore(new RebindPool(client));

    const first = await store.consumeGrantAndReserveEffect(authorityInput(client.state));
    expect(first).toMatchObject({ ok: true, value: { revision: 3 } });
    if (!first.ok) throw new Error(first.code);
    const reservationId = first.value.reservationId;
    expect(client.nonces.size).toBe(1);
    expect(client.idempotency.size).toBe(1);
    expect(client.effects.size).toBe(1);

    const sameEpoch = await store.consumeGrantAndReserveEffect(authorityInput(client.state));
    expect(sameEpoch).toEqual({ ok: false, code: "EFFECT_CONFLICT" });
    expect(client.state.revision).toBe(3);
    expect([...client.effects.values()][0]?.boundLeaseEpoch).toBe(1);

    // Simulate lease-expiry recovery + a later fenced claim. Durable authority rows survive.
    client.state = executing({ revision: 5, workerId: "worker.b", leaseEpoch: 2 });
    const rebound = await store.consumeGrantAndReserveEffect(authorityInput(client.state));

    expect(rebound).toEqual({
      ok: true,
      value: {
        revision: 6,
        reservationId,
      },
    });
    expect(client.nonces.size).toBe(1);
    expect(client.idempotency.size).toBe(1);
    expect(client.effects.size).toBe(1);
    expect([...client.effects.values()][0]?.boundLeaseEpoch).toBe(2);

    const secondSameEpoch = await store.consumeGrantAndReserveEffect(authorityInput(client.state));
    expect(secondSameEpoch).toEqual({ ok: false, code: "EFFECT_CONFLICT" });
    expect(client.state.revision).toBe(6);
  });

  it("never rebinds after dispatch has started", async () => {
    const client = new RebindClient(executing({
      revision: 6,
      workerId: "worker.b",
      leaseEpoch: 2,
      dispatchState: "started",
    }));
    const store = createPostgresDurableExecutionStore(new RebindPool(client));

    expect(await store.consumeGrantAndReserveEffect(authorityInput(client.state))).toEqual({
      ok: false,
      code: "EFFECT_CONFLICT",
    });
    expect(client.nonces.size).toBe(0);
    expect(client.idempotency.size).toBe(0);
    expect(client.effects.size).toBe(0);
  });

  it("keeps a nonce owned by another execution as a replay conflict", async () => {
    const client = new RebindClient(executing({ revision: 2, workerId: "worker.a", leaseEpoch: 1 }));
    client.nonces.set("nonce.prod12.rebind", {
      grantId: "grant.other",
      executionId: "execution.other",
    });
    const store = createPostgresDurableExecutionStore(new RebindPool(client));

    expect(await store.consumeGrantAndReserveEffect(authorityInput(client.state))).toEqual({
      ok: false,
      code: "NONCE_REPLAY",
    });
    expect(client.idempotency.size).toBe(0);
    expect(client.effects.size).toBe(0);
  });
});
