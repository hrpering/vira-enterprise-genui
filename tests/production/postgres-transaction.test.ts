import { describe, expect, it } from "vitest";
import { createViraEnterpriseContext } from "../../packages/enterprise-context/src/index.js";
import {
  canonicalizeEnterpriseScope,
  withTenantTransaction,
  type PostgresClientLike,
  type PostgresQueryResult,
} from "../../integrations/postgres/src/index.js";

function scope() {
  const created = createViraEnterpriseContext({ organizationId: "acme", projectId: "checkout", environments: ["staging"] });
  if (!created.ok) throw new Error("test context failed");
  const result = created.value.scope("staging");
  if (!result.ok) throw new Error("test scope failed");
  return result.value;
}

function fakeDatabase() {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  let released = 0;
  let connects = 0;
  const client: PostgresClientLike = {
    query: async <Row extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<PostgresQueryResult<Row>> => {
      queries.push({ text, ...(values === undefined ? {} : { values }) });
      return { rows: [] };
    },
    release: () => { released += 1; },
  };
  const pool = { connect: async () => { connects += 1; return client; } };
  return { client, pool, queries, released: () => released, connects: () => connects };
}

describe("PROD-02 PostgreSQL tenant transaction boundary", () => {
  it("delegates scope validation to enterprise-context and rejects shape drift before acquiring a connection", async () => {
    expect(canonicalizeEnterpriseScope(scope())).toEqual(scope());
    const database = fakeDatabase();
    await expect(withTenantTransaction(database.pool, { ...scope(), tenantId: "shadow-owner" }, async () => undefined)).rejects.toThrow("invalid shape");
    expect(database.connects()).toBe(0);
  });

  it("sets exact scope with parameterized transaction-local GUCs and commits", async () => {
    const database = fakeDatabase();
    const result = await withTenantTransaction(database.pool, scope(), async (_client, canonicalScope) => canonicalScope.environment);
    expect(result).toBe("staging");
    expect(database.queries.map((entry) => entry.text)).toEqual([
      "BEGIN",
      "SELECT set_config('vira.organization_id', $1, true), set_config('vira.project_id', $2, true), set_config('vira.environment', $3, true)",
      "SELECT vira.require_scope()",
      "COMMIT",
    ]);
    expect(database.queries[1]?.values).toEqual(["acme", "checkout", "staging"]);
    expect(database.released()).toBe(1);
  });

  it("rolls back and releases exactly once when repository work fails", async () => {
    const database = fakeDatabase();
    await expect(withTenantTransaction(database.pool, scope(), async () => { throw new Error("repository failed"); })).rejects.toThrow("repository failed");
    expect(database.queries.at(-1)?.text).toBe("ROLLBACK");
    expect(database.queries.some((entry) => entry.text === "COMMIT")).toBe(false);
    expect(database.released()).toBe(1);
  });

  it("preserves both failures and identifies rollback as the immediate cause", async () => {
    const original = new Error("repository failed");
    const rollback = new Error("rollback failed");
    let released = 0;
    const client: PostgresClientLike = {
      query: async <Row extends Record<string, unknown> = Record<string, unknown>>(text: string): Promise<PostgresQueryResult<Row>> => {
        if (text === "ROLLBACK") throw rollback;
        return { rows: [] };
      },
      release: () => { released += 1; },
    };

    let caught: unknown;
    try {
      await withTenantTransaction({ connect: async () => client }, scope(), async () => { throw original; });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    const aggregate = caught as AggregateError;
    expect(aggregate.cause).toBe(rollback);
    expect(aggregate.errors).toEqual([original, rollback]);
    expect(released).toBe(1);
  });
});
