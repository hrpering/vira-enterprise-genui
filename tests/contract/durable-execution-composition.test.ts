import { describe, expect, it } from "vitest";
import { createViraDurableExecutionWorkerComposition } from "../../apps/vira-worker/src/durable-execution-composition.js";
import type { PostgresPoolLike } from "../../integrations/postgres/src/index.js";
import type { ViraEnterpriseScope } from "../../packages/enterprise-context/src/index.js";
import { scope, verifier } from "./prod11-transaction-fixture.js";

const pool: PostgresPoolLike = {
  async connect() {
    throw new Error("composition test must not open PostgreSQL eagerly");
  },
};

describe("PROD-12 vira-worker durable execution composition", () => {
  it("constructs all Postgres-backed worker boundaries without opening the pool eagerly", () => {
    const composition = createViraDurableExecutionWorkerComposition({
      pool,
      scope,
      workerId: "worker.prod12.composition",
      leaseMs: 30_000,
      now: () => 1_900_000_000_000,
      verifier: verifier(),
      secretProvider: {
        resolve() {
          throw new Error("not invoked during composition");
        },
      },
      adapter: {
        invoke() {
          throw new Error("not invoked during composition");
        },
      },
    });

    expect(composition.dependencies).toMatchObject({
      scope,
      workerId: "worker.prod12.composition",
      leaseMs: 30_000,
    });
    expect(typeof composition.dependencies.store.claimNext).toBe("function");
    expect(typeof composition.dependencies.authorityRepository.readAuthority).toBe("function");
    expect(typeof composition.dependencies.recoveryScanner?.findNextExpired).toBe("function");
    expect(typeof composition.dependencies.leaseStore.renew).toBe("function");
    expect(typeof composition.dependencies.outcomeStore.record).toBe("function");
    expect(typeof composition.runBatch).toBe("function");
    expect(Object.isFrozen(composition)).toBe(true);
    expect(Object.isFrozen(composition.dependencies)).toBe(true);
    expect(Object.isFrozen(composition.dependencies.scope)).toBe(true);
  });

  it("rejects a non-canonical tenant scope before constructing runtime authority", () => {
    const invalidScope = {
      ...scope,
      environment: "development",
    } as unknown as ViraEnterpriseScope;

    expect(() => createViraDurableExecutionWorkerComposition({
      pool,
      scope: invalidScope,
      workerId: "worker.prod12.composition",
      leaseMs: 30_000,
      verifier: verifier(),
      secretProvider: { resolve() { return undefined; } },
      adapter: { invoke() { return { dispatch: "accepted" }; } },
    })).toThrow();
  });
});
