import { describe, expect, it } from "vitest";
import { createPostgresApplicationDeploymentStateStore } from "../../integrations/postgres/src/index.js";
import type {
  PostgresClientLike,
  PostgresPoolLike,
  PostgresQueryResult,
} from "../../integrations/postgres/src/transaction.js";

interface QueryCall {
  readonly text: string;
  readonly values: readonly unknown[] | undefined;
}

class FakeClient implements PostgresClientLike {
  readonly calls: QueryCall[] = [];
  released = false;

  constructor(private readonly failDeploymentLookup = false) {}

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PostgresQueryResult<Row>> {
    this.calls.push({ text, values });
    if (this.failDeploymentLookup && text.includes("FROM vira.application_deployment")) {
      throw new Error("database unavailable");
    }
    return { rows: [] as Row[] };
  }

  release(): void {
    this.released = true;
  }
}

function pool(client: FakeClient): PostgresPoolLike {
  return { connect: async () => client };
}

const scope = Object.freeze({
  version: "1" as const,
  organizationId: "org-vira",
  projectId: "flight-project",
  environment: "dev" as const,
});

describe("PROD-05 PostgreSQL Application deployment store", () => {
  it("looks up activation only inside a transaction-local canonical tenant scope", async () => {
    const client = new FakeClient();
    const store = createPostgresApplicationDeploymentStateStore(pool(client));

    const result = await store.getActive({ scope, applicationId: "vira.flight-assistant" });
    expect(result).toEqual({ ok: true, value: null });
    expect(client.released).toBe(true);
    expect(client.calls[0]?.text).toBe("BEGIN");
    expect(client.calls[1]).toEqual({
      text: "SELECT set_config('vira.organization_id', $1, true), set_config('vira.project_id', $2, true), set_config('vira.environment', $3, true)",
      values: ["org-vira", "flight-project", "dev"],
    });
    expect(client.calls.some((call) => call.text === "SELECT vira.require_scope()")).toBe(true);
    expect(client.calls.some((call) => call.text.includes("FROM vira.application_deployment") && call.values?.at(-1) === "vira.flight-assistant")).toBe(true);
    expect(client.calls.at(-1)?.text).toBe("COMMIT");
  });

  it("rolls back, releases the connection and fails closed when persistence lookup throws", async () => {
    const client = new FakeClient(true);
    const store = createPostgresApplicationDeploymentStateStore(pool(client));

    expect(await store.getActive({ scope, applicationId: "vira.flight-assistant" }))
      .toMatchObject({ ok: false, issue: { code: "PERSISTENCE_FAILED" } });
    expect(client.calls.some((call) => call.text === "ROLLBACK")).toBe(true);
    expect(client.calls.some((call) => call.text === "COMMIT")).toBe(false);
    expect(client.released).toBe(true);
  });

  it("rejects a non-pool dependency before any persistence work starts", () => {
    expect(() => createPostgresApplicationDeploymentStateStore({} as never)).toThrow(TypeError);
  });
});
