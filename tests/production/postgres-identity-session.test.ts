import { describe, expect, it } from "vitest";
import {
  authorizeBrowserSessionFromPostgres,
  type PostgresClientLike,
  type PostgresPoolLike,
  type PostgresQueryResult,
} from "../../integrations/postgres/src/index.js";

const scope = Object.freeze({
  version: "1" as const,
  organizationId: "acme",
  projectId: "alpha",
  environment: "staging" as const,
});
const sessionIdHash = "a".repeat(64);
const now = 2_000_000_000;

function poolWithRows(rows: readonly Record<string, unknown>[]) {
  const queries: { text: string; values?: readonly unknown[] }[] = [];
  let released = false;
  const client: PostgresClientLike = {
    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<PostgresQueryResult<Row>> {
      queries.push({ text, ...(values === undefined ? {} : { values }) });
      if (text.includes("FROM vira.browser_session AS bs")) {
        return { rows: rows as readonly Row[] };
      }
      return { rows: [] };
    },
    release() { released = true; },
  };
  const pool: PostgresPoolLike = { connect: async () => client };
  return { pool, queries, released: () => released };
}

function validRow(): Record<string, unknown> {
  return {
    session_id_hash: sessionIdHash,
    membership_id: "membership-a",
    membership_revision: "7",
    session_principal_kind: "user",
    session_principal_id: "user:alice",
    session_issued_at: String(now - 10),
    session_expires_at: String(now + 300),
    session_revoked_at: null,
    identity_issuer: "https://issuer.example",
    identity_subject: "alice",
    membership_principal_kind: "user",
    membership_principal_id: "user:alice",
    membership_revision_current: "7",
    membership_active: true,
    membership_expires_at: null,
  };
}

describe("PROD-03 PostgreSQL browser session adapter", () => {
  it("authorizes through the canonical tenant transaction and hash-only lookup", async () => {
    const fixture = poolWithRows([validRow()]);
    const result = await authorizeBrowserSessionFromPostgres(fixture.pool, {
      scope,
      sessionIdHash,
      nowEpochSeconds: now,
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        sessionIdHash,
        membershipId: "membership-a",
        membershipRevision: 7,
        principal: { kind: "user", id: "user:alice" },
        scope,
      },
    });
    expect(fixture.queries.map((query) => query.text)).toEqual([
      "BEGIN",
      "SELECT set_config('vira.organization_id', $1, true), set_config('vira.project_id', $2, true), set_config('vira.environment', $3, true)",
      "SELECT vira.require_scope()",
      expect.stringContaining("FROM vira.browser_session AS bs"),
      "COMMIT",
    ]);
    expect(fixture.queries[3]?.values).toEqual([sessionIdHash]);
    expect(fixture.released()).toBe(true);
  });

  it("fails closed when the scoped lookup is absent, duplicated or malformed", async () => {
    expect(await authorizeBrowserSessionFromPostgres(poolWithRows([]).pool, {
      scope,
      sessionIdHash,
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "SESSION_NOT_FOUND" } });

    expect(await authorizeBrowserSessionFromPostgres(poolWithRows([validRow(), validRow()]).pool, {
      scope,
      sessionIdHash,
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "SESSION_NOT_FOUND" } });

    expect(await authorizeBrowserSessionFromPostgres(poolWithRows([{ ...validRow(), membership_revision_current: "8" }]).pool, {
      scope,
      sessionIdHash,
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "STALE_MEMBERSHIP" } });
  });

  it("rejects malformed lookup inputs before touching the pool", async () => {
    let connected = false;
    const pool: PostgresPoolLike = {
      async connect() {
        connected = true;
        throw new Error("must not connect");
      },
    };
    expect(await authorizeBrowserSessionFromPostgres(pool, null)).toMatchObject({ ok: false, issue: { code: "INVALID_SESSION_LOOKUP" } });
    expect(connected).toBe(false);
  });
});
