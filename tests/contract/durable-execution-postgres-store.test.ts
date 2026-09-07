import { describe, expect, it } from "vitest";
import {
  createViraHumanApprovalEvidence,
  createViraTransactionComprehension,
  issueViraTransactionExecutionGrant,
} from "../../packages/action-transaction/src/index.js";
import {
  consumeViraDurableExecutionStageB,
  createViraDurableExecutionRecord,
  type ViraDurableExecutionRecord,
} from "../../packages/durable-execution/src/index.js";
import type { ViraDurableExecutionOutboxEvent } from "../../packages/durable-execution/src/outbox.js";
import {
  createPostgresDurableExecutionStore,
  type PostgresClientLike,
  type PostgresPoolLike,
  type PostgresQueryResult,
} from "../../integrations/postgres/src/index.js";
import { NOW, frozenPlan, signer, user, verifier } from "./prod11-transaction-fixture.js";

interface QueryCall {
  readonly text: string;
  readonly values: readonly unknown[];
}

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

interface Snapshot {
  readonly state: ViraDurableExecutionRecord | undefined;
  readonly nonces: Map<string, NonceOwner>;
  readonly idempotency: Map<string, IdempotencyOwner>;
  readonly effects: Map<string, EffectOwner>;
  readonly outbox: Map<string, ViraDurableExecutionOutboxEvent>;
  readonly consumers: Set<string>;
}

function cloneState(state: ViraDurableExecutionRecord | undefined): ViraDurableExecutionRecord | undefined {
  return state === undefined ? undefined : structuredClone(state) as ViraDurableExecutionRecord;
}

function rowFromRecord(record: ViraDurableExecutionRecord, leaseLive = true): Record<string, unknown> {
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
    lease_live: leaseLive,
  };
}

class FakeDurableExecutionClient implements PostgresClientLike {
  readonly calls: QueryCall[] = [];
  state: ViraDurableExecutionRecord | undefined;
  readonly nonces = new Map<string, NonceOwner>();
  readonly idempotency = new Map<string, IdempotencyOwner>();
  readonly effects = new Map<string, EffectOwner>();
  readonly outbox = new Map<string, ViraDurableExecutionOutboxEvent>();
  readonly consumers = new Set<string>();
  private snapshot: Snapshot | undefined;

  readonly release = () => undefined;

  private begin(): void {
    this.snapshot = {
      state: cloneState(this.state),
      nonces: new Map(this.nonces),
      idempotency: new Map(this.idempotency),
      effects: new Map(this.effects),
      outbox: new Map([...this.outbox].map(([key, value]) => [key, structuredClone(value) as ViraDurableExecutionOutboxEvent])),
      consumers: new Set(this.consumers),
    };
  }

  private rollback(): void {
    if (this.snapshot === undefined) return;
    this.state = cloneState(this.snapshot.state);
    this.nonces.clear();
    for (const [key, value] of this.snapshot.nonces) this.nonces.set(key, value);
    this.idempotency.clear();
    for (const [key, value] of this.snapshot.idempotency) this.idempotency.set(key, value);
    this.effects.clear();
    for (const [key, value] of this.snapshot.effects) this.effects.set(key, value);
    this.outbox.clear();
    for (const [key, value] of this.snapshot.outbox) this.outbox.set(key, structuredClone(value) as ViraDurableExecutionOutboxEvent);
    this.consumers.clear();
    for (const value of this.snapshot.consumers) this.consumers.add(value);
    this.snapshot = undefined;
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<PostgresQueryResult<Row>> {
    this.calls.push({ text, values });
    const sql = text.replace(/\s+/g, " ").trim();
    let rows: Record<string, unknown>[] = [];

    if (sql === "BEGIN") {
      this.begin();
    } else if (sql === "COMMIT") {
      this.snapshot = undefined;
    } else if (sql === "ROLLBACK") {
      this.rollback();
    } else if (sql.startsWith("SELECT set_config(") || sql === "SELECT vira.require_scope()") {
      // Tenant transaction bootstrap.
    } else if (sql.startsWith("INSERT INTO vira.durable_execution_state")) {
      if (this.state === undefined) {
        this.state = JSON.parse(String(values[15])) as ViraDurableExecutionRecord;
        rows = [rowFromRecord(this.state)];
      }
    } else if (sql.includes("FROM vira.durable_execution_state") && sql.includes("FOR UPDATE SKIP LOCKED")) {
      if (this.state !== undefined && (this.state.status === "queued" || this.state.status === "recovery")) {
        rows = [rowFromRecord(this.state)];
      }
    } else if (sql.includes("FROM vira.durable_execution_state") && sql.includes("AS lease_live")) {
      if (this.state !== undefined) rows = [rowFromRecord(this.state, true)];
    } else if (sql.startsWith("SELECT") && sql.includes("FROM vira.durable_execution_state") && sql.includes("FOR UPDATE")) {
      if (this.state !== undefined) rows = [rowFromRecord(this.state)];
    } else if (sql.startsWith("SELECT") && sql.includes("FROM vira.durable_execution_state")) {
      if (this.state !== undefined) rows = [rowFromRecord(this.state)];
    } else if (sql.startsWith("UPDATE vira.durable_execution_state") && sql.includes("SET revision = revision + 1")) {
      if (this.state !== undefined && this.state.revision === values[4]) {
        this.state = {
          ...this.state,
          revision: this.state.revision + 1,
          updatedAtEpochMs: Math.max(this.state.updatedAtEpochMs + 1, NOW + 4),
        };
        rows = [{ revision: this.state.revision }];
      }
    } else if (sql.startsWith("UPDATE vira.durable_execution_state")) {
      if (this.state !== undefined && this.state.revision === values[11]) {
        this.state = JSON.parse(String(values[10])) as ViraDurableExecutionRecord;
        rows = [rowFromRecord(this.state)];
      }
    } else if (sql.startsWith("INSERT INTO vira.durable_execution_nonce")) {
      const nonce = String(values[3]);
      if (!this.nonces.has(nonce)) {
        this.nonces.set(nonce, { grantId: String(values[4]), executionId: String(values[5]) });
        rows = [{ token: nonce }];
      }
    } else if (sql.startsWith("SELECT nonce AS token")) {
      const nonce = String(values[3]);
      const owner = this.nonces.get(nonce);
      if (
        owner !== undefined
        && owner.grantId === String(values[4])
        && owner.executionId === String(values[5])
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
      const owner = this.idempotency.get(key);
      if (
        owner !== undefined
        && owner.reservationId === String(values[4])
        && owner.executionId === String(values[5])
        && owner.transactionId === String(values[6])
        && owner.planDigest === String(values[7])
        && owner.planRevision === Number(values[8])
        && owner.operationId === String(values[9])
      ) rows = [{ token: owner.reservationId }];
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
      const owner = this.effects.get(key);
      const nextEpoch = Number(values[9]);
      if (
        owner !== undefined
        && owner.reservationId === String(values[7])
        && owner.executionId === String(values[8])
        && owner.boundLeaseEpoch < nextEpoch
      ) {
        this.effects.set(key, { ...owner, boundLeaseEpoch: nextEpoch });
        rows = [{ token: owner.reservationId }];
      }
    } else if (sql.startsWith("INSERT INTO vira.durable_execution_outbox_consumer")) {
      const key = `${values[3]}/${values[4]}`;
      if (!this.consumers.has(key)) {
        this.consumers.add(key);
        rows = [{ token: String(values[4]) }];
      }
    } else if (sql.startsWith("INSERT INTO vira.durable_execution_outbox")) {
      const event = JSON.parse(String(values[6])) as ViraDurableExecutionOutboxEvent;
      if (!this.outbox.has(event.eventId)) {
        this.outbox.set(event.eventId, event);
        rows = [{ token: event.eventId }];
      }
    } else if (sql.startsWith("SELECT event") && sql.includes("FROM vira.durable_execution_outbox")) {
      rows = [...this.outbox.values()].map((event) => ({ event: structuredClone(event) }));
    } else {
      throw new Error(`unexpected fake PostgreSQL query: ${sql}`);
    }

    return { rows: rows as Row[] };
  }
}

class FakePool implements PostgresPoolLike {
  constructor(readonly client: FakeDurableExecutionClient) {}
  async connect(): Promise<PostgresClientLike> {
    return this.client;
  }
}

async function executionContext() {
  const frozen = frozenPlan();
  const review = createViraTransactionComprehension(frozen);
  if (!review.ok) throw new Error(review.issue.message);
  const approval = createViraHumanApprovalEvidence({
    approvalId: "approval.prod12.postgres",
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
    grantId: "grant.prod12.postgres",
    nonce: "nonce.prod12.postgres",
    issuedAtEpochMs: NOW + 1,
    expiresAtEpochMs: NOW + 60_000,
    signer: signer(),
  });
  if (!grant.ok) throw new Error(grant.issue.message);
  const queued = createViraDurableExecutionRecord({
    executionId: "execution.prod12.postgres",
    frozen,
    grant: grant.value,
    operationId: "publish.document",
    createdAtEpochMs: NOW + 1,
  });
  if (!queued.ok) throw new Error(queued.issue.message);
  return { frozen, grant: grant.value, queued: queued.value };
}

describe("PROD-12 PostgreSQL durable execution store", () => {
  it("persists queued state and claims it with SKIP LOCKED plus transactional outbox", async () => {
    const ctx = await executionContext();
    const client = new FakeDurableExecutionClient();
    const store = createPostgresDurableExecutionStore(new FakePool(client));

    expect(await store.create(ctx.queued)).toMatchObject({ ok: true, value: { status: "queued", revision: 1 } });
    expect(client.outbox.size).toBe(1);

    const claimed = await store.claimNext({
      scope: ctx.queued.scope,
      workerId: "worker.prod12.postgres",
      nowEpochMs: NOW + 2,
      leaseMs: 30_000,
    });
    expect(claimed).toMatchObject({
      status: "executing",
      revision: 2,
      leaseEpoch: 1,
      lease: { workerId: "worker.prod12.postgres", epoch: 1 },
    });
    expect(client.calls.some(({ text }) => text.includes("FOR UPDATE SKIP LOCKED"))).toBe(true);
    expect(client.outbox.size).toBe(2);
    expect(client.calls.filter(({ text }) => text === "BEGIN").length).toBe(2);
    expect(client.calls.filter(({ text }) => text === "COMMIT").length).toBe(2);
  });

  it("atomically rolls nonce back when a later idempotency reservation conflicts", async () => {
    const ctx = await executionContext();
    const client = new FakeDurableExecutionClient();
    const store = createPostgresDurableExecutionStore(new FakePool(client));
    await store.create(ctx.queued);
    const claimed = await store.claimNext({
      scope: ctx.queued.scope,
      workerId: "worker.prod12.postgres",
      nowEpochMs: NOW + 2,
      leaseMs: 30_000,
    });
    if (claimed === undefined) throw new Error("claim missing");

    client.idempotency.set("tx-demo:publish.document", {
      reservationId: "reservation:conflicting-owner",
      executionId: "execution.other",
      transactionId: claimed.transactionId,
      planDigest: claimed.planDigest,
      planRevision: claimed.planRevision,
      operationId: claimed.operationId,
    });
    const result = await consumeViraDurableExecutionStageB({
      record: claimed,
      frozen: ctx.frozen,
      grant: ctx.grant,
      operationId: "publish.document",
      workerId: "worker.prod12.postgres",
      leaseEpoch: 1,
      expectedRevision: 2,
      nowEpochMs: NOW + 3,
      verifier: verifier(),
      store,
    });

    expect(result).toMatchObject({ ok: false, issue: { code: "AUTHORITY_REJECTED" } });
    expect(client.nonces.has("nonce.prod12.postgres")).toBe(false);
    expect(client.calls.some(({ text }) => text === "ROLLBACK")).toBe(true);
    expect(client.effects.size).toBe(0);
  });

  it("consumes one nonce/effect reservation and fences the exact state revision", async () => {
    const ctx = await executionContext();
    const client = new FakeDurableExecutionClient();
    const store = createPostgresDurableExecutionStore(new FakePool(client));
    await store.create(ctx.queued);
    const claimed = await store.claimNext({
      scope: ctx.queued.scope,
      workerId: "worker.prod12.postgres",
      nowEpochMs: NOW + 2,
      leaseMs: 30_000,
    });
    if (claimed === undefined) throw new Error("claim missing");

    const first = await consumeViraDurableExecutionStageB({
      record: claimed,
      frozen: ctx.frozen,
      grant: ctx.grant,
      operationId: "publish.document",
      workerId: "worker.prod12.postgres",
      leaseEpoch: 1,
      expectedRevision: 2,
      nowEpochMs: NOW + 3,
      verifier: verifier(),
      store,
    });
    expect(first).toMatchObject({ ok: true, value: { reservationRevision: 3, leaseEpoch: 1 } });
    expect(client.nonces.size).toBe(1);
    expect(client.idempotency.size).toBe(1);
    expect(client.effects.size).toBe(1);
    expect([...client.effects.values()][0]?.boundLeaseEpoch).toBe(1);
    expect(client.state?.revision).toBe(3);

    expect(await store.consumeGrantAndReserveEffect({
      scope: claimed.scope,
      executionId: claimed.executionId,
      expectedRevision: 2,
      workerId: "worker.prod12.postgres",
      leaseEpoch: 1,
      transactionId: claimed.transactionId,
      planDigest: claimed.planDigest,
      planRevision: claimed.planRevision,
      operationId: claimed.operationId,
      grantId: claimed.grantId,
      nonce: claimed.grantNonce,
      nonceExpiresAtEpochMs: NOW + 60_000,
      idempotencyKey: claimed.idempotencyKey,
    })).toEqual({ ok: false, code: "STALE_REVISION" });
  });

  it("makes per-consumer outbox delivery idempotent", async () => {
    const ctx = await executionContext();
    const client = new FakeDurableExecutionClient();
    const store = createPostgresDurableExecutionStore(new FakePool(client));
    await store.create(ctx.queued);
    const events = await store.listOutbox(ctx.queued.scope, 100);
    expect(events).toHaveLength(1);

    const receipt = {
      scope: ctx.queued.scope,
      eventId: events[0]!.eventId,
      consumerId: "consumer.usage.prod12",
    };
    expect(await store.acceptOutboxConsumer(receipt)).toBe("accepted");
    expect(await store.acceptOutboxConsumer(receipt)).toBe("duplicate");
    expect(client.consumers.size).toBe(1);
  });
});
