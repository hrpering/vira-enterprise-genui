import { describe, expect, it } from "vitest";
import {
  createPostgresDurableExecutionRecoveryScanner,
  type PostgresClientLike,
  type PostgresPoolLike,
  type PostgresQueryResult,
} from "../../integrations/postgres/src/index.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

interface CandidateState {
  readonly organizationId: string;
  readonly projectId: string;
  readonly environment: string;
  readonly executionId: unknown;
  readonly revision: unknown;
  readonly nowEpochMs: unknown;
  readonly status: "executing" | "queued";
  readonly expired: boolean;
}

class RecoveryScannerClient implements PostgresClientLike {
  readonly calls: Array<{ readonly text: string; readonly values: readonly unknown[] }> = [];
  readonly release = () => undefined;

  constructor(readonly candidate: CandidateState | undefined) {}

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
      const candidate = this.candidate;
      if (
        candidate !== undefined
        && candidate.organizationId === values[0]
        && candidate.projectId === values[1]
        && candidate.environment === values[2]
        && candidate.status === "executing"
        && candidate.expired
      ) {
        rows = [{
          execution_id: candidate.executionId,
          revision: candidate.revision,
          db_now_epoch_ms: candidate.nowEpochMs,
        }];
      }
    } else {
      throw new Error(`unexpected fake PostgreSQL query: ${sql}`);
    }

    return { rows: rows as Row[] };
  }
}

class RecoveryScannerPool implements PostgresPoolLike {
  constructor(readonly client: RecoveryScannerClient) {}
  async connect(): Promise<PostgresClientLike> {
    return this.client;
  }
}

function candidate(overrides: Partial<CandidateState> = {}): CandidateState {
  return {
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    environment: scope.environment,
    executionId: "execution.prod12.expired",
    revision: 7,
    nowEpochMs: NOW + 60_000,
    status: "executing",
    expired: true,
    ...overrides,
  };
}

describe("PROD-12 PostgreSQL expired execution recovery scanner", () => {
  it("finds the next exact-tenant expired execution using DB server time and SKIP LOCKED", async () => {
    const client = new RecoveryScannerClient(candidate());
    const scanner = createPostgresDurableExecutionRecoveryScanner(new RecoveryScannerPool(client));

    await expect(scanner.findNextExpired(scope)).resolves.toEqual({
      executionId: "execution.prod12.expired",
      expectedRevision: 7,
      nowEpochMs: NOW + 60_000,
    });

    const scan = client.calls.find(({ text }) => text.includes("FROM vira.durable_execution_state"));
    expect(scan?.text).toContain("status = 'executing'");
    expect(scan?.text).toContain("lease_expires_at <= clock_timestamp()");
    expect(scan?.text).toContain("FOR UPDATE SKIP LOCKED");
    expect(scan?.text).toContain("extract(epoch FROM clock_timestamp())");
    expect(scan?.values).toEqual([scope.organizationId, scope.projectId, scope.environment]);
  });

  it("does not surface live, non-executing or cross-tenant rows", async () => {
    for (const state of [
      candidate({ expired: false }),
      candidate({ status: "queued" }),
      candidate({ organizationId: "org-other" }),
    ]) {
      const scanner = createPostgresDurableExecutionRecoveryScanner(
        new RecoveryScannerPool(new RecoveryScannerClient(state)),
      );
      await expect(scanner.findNextExpired(scope)).resolves.toBeUndefined();
    }
  });

  it("fails closed on malformed execution identity or DB time evidence", async () => {
    const invalidExecution = createPostgresDurableExecutionRecoveryScanner(
      new RecoveryScannerPool(new RecoveryScannerClient(candidate({ executionId: "" }))),
    );
    await expect(invalidExecution.findNextExpired(scope)).rejects.toThrow(/execution id/);

    const invalidTime = createPostgresDurableExecutionRecoveryScanner(
      new RecoveryScannerPool(new RecoveryScannerClient(candidate({ nowEpochMs: 0 }))),
    );
    await expect(invalidTime.findNextExpired(scope)).rejects.toThrow(/integer/);
  });
});
