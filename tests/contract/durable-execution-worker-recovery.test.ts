import { describe, expect, it } from "vitest";
import {
  runViraDurableExecutionWorkerOnce,
  type ViraDurableExecutionWorkerDependencies,
} from "../../apps/vira-worker/src/durable-execution-worker.js";
import type {
  ViraPostgresDurableExecutionAuthorityRepository,
  ViraPostgresDurableExecutionLeaseStore,
  ViraPostgresDurableExecutionOutcomeStore,
  ViraPostgresDurableExecutionRecoveryScanner,
  ViraPostgresDurableExecutionStore,
} from "../../integrations/postgres/src/index.js";
import type { ViraDurableExecutionRecord } from "../../packages/durable-execution/src/index.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

function recoveryRecord(): ViraDurableExecutionRecord {
  return Object.freeze({
    version: "1",
    executionId: "execution.prod12.recovery-worker",
    scope,
    transactionId: "transaction.demo.publish",
    planDigest: "a".repeat(64),
    planRevision: 7,
    operationId: "publish.document",
    grantId: "grant.prod12.recovery-worker",
    grantNonce: "nonce.prod12.recovery-worker",
    idempotencyKey: "tx-demo:publish.document",
    revision: 8,
    status: "recovery",
    leaseEpoch: 2,
    lease: null,
    dispatchState: "not-started",
    createdAtEpochMs: NOW,
    updatedAtEpochMs: NOW + 60_000,
  });
}

function store(
  events: string[],
  recoveryResult: "ok" | "race" | "invalid" = "ok",
): ViraPostgresDurableExecutionStore {
  return Object.freeze({
    async read() { return undefined; },
    async create() { return { ok: false as const, code: "ALREADY_EXISTS" as const }; },
    async claimNext() {
      events.push("claim");
      return undefined;
    },
    async markDispatchStarted() { return { ok: false as const, code: "INVALID_STATE" as const }; },
    async recoverExpired(input: Parameters<ViraPostgresDurableExecutionStore["recoverExpired"]>[0]) {
      events.push(`recover:${input.executionId}:${input.expectedRevision}:${input.nowEpochMs}`);
      if (recoveryResult === "race") return { ok: false as const, code: "VERSION_CONFLICT" as const };
      if (recoveryResult === "invalid") return { ok: false as const, code: "INVALID_STATE" as const };
      return { ok: true as const, value: recoveryRecord() };
    },
    consumeGrantAndReserveEffect() {
      return { ok: false as const, code: "NOT_FOUND" as const };
    },
    async listOutbox() { return Object.freeze([]); },
    async acceptOutboxConsumer() { return "accepted" as const; },
  });
}

function authorityRepository(): ViraPostgresDurableExecutionAuthorityRepository {
  return Object.freeze({
    async enqueueWithAuthority() { return { ok: false as const, code: "ALREADY_EXISTS" as const }; },
    async readAuthority() { return undefined; },
  });
}

function leaseStore(): ViraPostgresDurableExecutionLeaseStore {
  return Object.freeze({
    async renew() { return { ok: false as const, code: "INVALID_STATE" as const }; },
  });
}

function outcomeStore(): ViraPostgresDurableExecutionOutcomeStore {
  return Object.freeze({
    async record() { return { ok: false as const, code: "INVALID_STATE" as const }; },
  });
}

function dependencies(input: {
  readonly events: string[];
  readonly scanner: ViraPostgresDurableExecutionRecoveryScanner;
  readonly recoveryResult?: "ok" | "race" | "invalid";
}): ViraDurableExecutionWorkerDependencies {
  return Object.freeze({
    scope,
    workerId: "worker.prod12.recovery",
    leaseMs: 30_000,
    now: () => NOW + 70_000,
    store: store(input.events, input.recoveryResult),
    authorityRepository: authorityRepository(),
    recoveryScanner: input.scanner,
    leaseStore: leaseStore(),
    outcomeStore: outcomeStore(),
    verifier: { verify() { return false; } },
    secretProvider: { resolve() { throw new Error("must not resolve during recovery-only tests"); } },
    adapter: { invoke() { throw new Error("must not invoke during recovery-only tests"); } },
  });
}

function scanner(
  events: string[],
  mode: "candidate" | "none" | "throw" = "candidate",
): ViraPostgresDurableExecutionRecoveryScanner {
  return Object.freeze({
    async findNextExpired() {
      events.push("scan");
      if (mode === "throw") throw new Error("database scanner unavailable");
      if (mode === "none") return undefined;
      return {
        executionId: "execution.prod12.recovery-worker",
        expectedRevision: 7,
        nowEpochMs: NOW + 60_000,
      };
    },
  });
}

describe("PROD-12 worker expired execution recovery sweep", () => {
  it("uses scanner DB revision/time for recovery before attempting a new claim", async () => {
    const events: string[] = [];
    const result = await runViraDurableExecutionWorkerOnce(dependencies({
      events,
      scanner: scanner(events),
    }));

    expect(result).toEqual({ ok: true, kind: "idle" });
    expect(events).toEqual([
      "scan",
      `recover:execution.prod12.recovery-worker:7:${NOW + 60_000}`,
      "claim",
    ]);
  });

  it("treats a recovery CAS conflict as a benign worker race and continues to claim", async () => {
    const events: string[] = [];
    const result = await runViraDurableExecutionWorkerOnce(dependencies({
      events,
      scanner: scanner(events),
      recoveryResult: "race",
    }));

    expect(result).toEqual({ ok: true, kind: "idle" });
    expect(events.at(-1)).toBe("claim");
  });

  it("fails closed before claim when recovery scanner storage fails", async () => {
    const events: string[] = [];
    const result = await runViraDurableExecutionWorkerOnce(dependencies({
      events,
      scanner: scanner(events, "throw"),
    }));

    expect(result).toEqual({
      ok: false,
      kind: "recovery-rejected",
      executionId: "recovery.scan",
      code: "RECOVERY_SCAN_FAILED",
    });
    expect(events).toEqual(["scan"]);
  });

  it("fails closed before claim when semantic recovery rejects the expired state", async () => {
    const events: string[] = [];
    const result = await runViraDurableExecutionWorkerOnce(dependencies({
      events,
      scanner: scanner(events),
      recoveryResult: "invalid",
    }));

    expect(result).toEqual({
      ok: false,
      kind: "recovery-rejected",
      executionId: "execution.prod12.recovery-worker",
      code: "INVALID_STATE",
    });
    expect(events).toHaveLength(2);
    expect(events).not.toContain("claim");
  });
});
