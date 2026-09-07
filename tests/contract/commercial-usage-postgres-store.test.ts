import { describe, expect, it } from "vitest";
import {
  createPostgresCommercialUsageStore,
  type PostgresClientLike,
  type PostgresPoolLike,
  type PostgresQueryResult,
} from "../../integrations/postgres/src/index.js";
import type { ViraCommercialTrustedUsageSourceEvent } from "../../packages/commercial-metering/src/trusted-source.js";
import type { ViraCommercialUsageRecord } from "../../packages/commercial-metering/src/types.js";

const scope = Object.freeze({
  version: "1" as const,
  organizationId: "contoso",
  projectId: "refunds",
  environment: "production" as const,
});

function fixture(applicationDigest = "a".repeat(64)): Readonly<{
  event: ViraCommercialTrustedUsageSourceEvent;
  usage: ViraCommercialUsageRecord;
}> {
  const sourceEventId = `usage-${"b".repeat(64)}`;
  const principal = Object.freeze({
    version: "1" as const,
    kind: "user" as const,
    id: "user-1",
    organizationId: "contoso",
  });
  const entitlementRef = Object.freeze({ id: "entitlement.refund-enterprise", versionRef: "1" });
  const meteringRef = Object.freeze({ id: "metering.refund-actions", versionRef: "1" });
  const occurredAt = "2026-09-07T12:00:06.000Z";
  const event: ViraCommercialTrustedUsageSourceEvent = Object.freeze({
    version: "1",
    sourceKind: "action.effect.verified",
    sourceEventId,
    occurredAt,
    scope,
    principal,
    applicationId: "demo.refund-app",
    applicationVersion: "1.0.0",
    applicationDigest,
    entitlementRef,
    meteringRef,
    capabilityRef: null,
    locationId: null,
    quantity: 1,
    authority: Object.freeze({
      kind: "action-verification",
      verificationId: "verification.refund.1",
      transactionId: "transaction.refund.1",
      planDigest: "1".repeat(64),
      planRevision: 3,
      operationId: "operation.refund.approve",
      executionId: "execution.refund.1",
      attemptId: "attempt.refund.1",
      verificationRevision: 7,
      afterObservationDigest: "3".repeat(64),
    }),
    attribution: Object.freeze({
      publisherId: null,
      providerId: "github",
      modelId: null,
      nodeId: null,
      platformId: null,
    }),
  });
  const usage: ViraCommercialUsageRecord = Object.freeze({
    usageId: sourceEventId,
    sourceId: "action.verification",
    occurredAt,
    applicationId: "demo.refund-app",
    applicationVersion: "1.0.0",
    entitlementRef,
    meteringRef,
    principal,
    scope,
    capabilityRef: null,
    locationId: null,
    quantity: 1,
  });
  return Object.freeze({ event, usage });
}

class FakeCommercialUsageClient implements PostgresClientLike {
  readonly events = new Map<string, ViraCommercialTrustedUsageSourceEvent>();
  readonly usages = new Map<string, ViraCommercialUsageRecord>();
  forceUsageCollision = false;
  private snapshot: Readonly<{
    events: Map<string, ViraCommercialTrustedUsageSourceEvent>;
    usages: Map<string, ViraCommercialUsageRecord>;
  }> | undefined;

  readonly release = () => undefined;

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<PostgresQueryResult<Row>> {
    const sql = text.replace(/\s+/g, " ").trim();
    let rows: Record<string, unknown>[] = [];

    if (sql === "BEGIN") {
      this.snapshot = {
        events: new Map(this.events),
        usages: new Map(this.usages),
      };
    } else if (sql === "COMMIT") {
      this.snapshot = undefined;
    } else if (sql === "ROLLBACK") {
      if (this.snapshot !== undefined) {
        this.events.clear();
        for (const [key, value] of this.snapshot.events) this.events.set(key, value);
        this.usages.clear();
        for (const [key, value] of this.snapshot.usages) this.usages.set(key, value);
      }
      this.snapshot = undefined;
    } else if (sql.startsWith("SELECT set_config(") || sql === "SELECT vira.require_scope()") {
      // tenant transaction bootstrap
    } else if (sql.startsWith("INSERT INTO vira.commercial_usage_source_event")) {
      const key = String(values[3]);
      if (!this.events.has(key)) {
        const event = JSON.parse(String(values[19])) as ViraCommercialTrustedUsageSourceEvent;
        this.events.set(key, event);
        rows = [{ token: key }];
      }
    } else if (sql.startsWith("INSERT INTO vira.commercial_usage_record")) {
      const usageId = String(values[3]);
      if (!this.forceUsageCollision && !this.usages.has(usageId)) {
        const usage = JSON.parse(String(values[19])) as ViraCommercialUsageRecord;
        this.usages.set(usageId, usage);
        rows = [{ token: usageId }];
      }
    } else if (sql.includes("FROM vira.commercial_usage_source_event AS source")) {
      const key = String(values[3]);
      const event = this.events.get(key);
      const usage = this.usages.get(key);
      if (event !== undefined) {
        const exact = usage !== undefined
          && JSON.stringify(event) === JSON.stringify(JSON.parse(String(values[4])))
          && JSON.stringify(usage) === JSON.stringify(JSON.parse(String(values[5])));
        rows = [{ exact_match: exact }];
      }
    } else {
      throw new Error(`unexpected SQL in commercial usage fake: ${sql}`);
    }

    return { rows: rows as Row[], rowCount: rows.length };
  }
}

function pool(client: FakeCommercialUsageClient): PostgresPoolLike {
  return { connect: async () => client };
}

describe("PROD-14 PostgreSQL commercial usage store", () => {
  it("atomically accepts first delivery and classifies exact replay as duplicate", async () => {
    const client = new FakeCommercialUsageClient();
    const store = createPostgresCommercialUsageStore(pool(client));
    const value = fixture();

    const first = await store.append({ scope, ...value });
    const second = await store.append({ scope, ...value });

    expect(first).toMatchObject({ ok: true, status: "accepted" });
    expect(second).toMatchObject({ ok: true, status: "duplicate" });
    expect(client.events.size).toBe(1);
    expect(client.usages.size).toBe(1);
  });

  it("fails closed when the same sourceEventId is replayed with different authority evidence", async () => {
    const client = new FakeCommercialUsageClient();
    const store = createPostgresCommercialUsageStore(pool(client));
    const original = fixture();
    const conflicting = fixture("c".repeat(64));

    expect(await store.append({ scope, ...original })).toMatchObject({ ok: true, status: "accepted" });
    expect(await store.append({ scope, ...conflicting })).toEqual({ ok: false, code: "SOURCE_CONFLICT" });
    expect(client.events.size).toBe(1);
    expect(client.usages.size).toBe(1);
  });

  it("rolls back the source event if canonical usage insertion collides", async () => {
    const client = new FakeCommercialUsageClient();
    client.forceUsageCollision = true;
    const store = createPostgresCommercialUsageStore(pool(client));
    const value = fixture();

    await expect(store.append({ scope, ...value })).rejects.toThrow("collided after source event insert");
    expect(client.events.size).toBe(0);
    expect(client.usages.size).toBe(0);
  });

  it("rejects event/usage identity substitution before opening a transaction", async () => {
    const client = new FakeCommercialUsageClient();
    const store = createPostgresCommercialUsageStore(pool(client));
    const value = fixture();
    const usage = Object.freeze({ ...value.usage, quantity: 2 });

    await expect(store.append({ scope, event: value.event, usage })).rejects.toThrow("conflicts with canonical usage record");
    expect(client.events.size).toBe(0);
    expect(client.usages.size).toBe(0);
  });
});
