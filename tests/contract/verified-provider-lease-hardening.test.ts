import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createViraActionProviderObservation,
  createViraActionVerificationExpectation,
  type ViraActionProviderObservation,
  type ViraActionVerificationExpectation,
} from "../../packages/action-verification/src/index.js";
import type { ViraDurableActionVerificationRecord } from "../../packages/action-verification/src/durable.js";
import type { ViraDurableExecutionStageBPermit } from "../../packages/durable-execution/src/index.js";
import type { ViraPrivateObservationAuthority } from "../../packages/private-runner/src/observation.js";
import type { ViraPrivateRunnerSecretProvider } from "../../packages/private-runner/src/index.js";
import type { ViraPostgresActionVerificationObservationRepository } from "../../integrations/postgres/src/action-verification-observation.js";
import type { ViraPostgresActionVerificationWriteOutcomeStore } from "../../integrations/postgres/src/action-verification-write-outcome.js";
import type { ViraPostgresActionVerificationStore } from "../../integrations/postgres/src/action-verification.js";
import type { ViraPostgresProductionActionLedgerStore } from "../../integrations/postgres/src/production-action-ledger.js";
import type { ViraPostgresDurableExecutionOutcomeStore } from "../../integrations/postgres/src/durable-execution-outcome.js";
import type { ViraPostgresDurableExecutionStore } from "../../integrations/postgres/src/durable-execution.js";
import { runViraVerifiedProviderAction } from "../../apps/vira-worker/src/verified-provider-action.js";
import { runViraVerifiedProviderReadback } from "../../apps/vira-worker/src/verified-provider-readback.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

const SECRET = "prod13-lease-hardening-secret-0123456789";
const PROVIDER_VERSION = "1".repeat(40);
const RESOURCE_ID = "github.repository.file:lease-hardening";

function stableId(prefix: string, values: readonly string[]): string {
  return `${prefix}.${createHash("sha256").update(values.join("\u0000")).digest("hex")}`;
}

function permit(): ViraDurableExecutionStageBPermit {
  return {
    version: "1",
    executionId: "execution.prod13.lease-hardening",
    scope,
    transactionId: "transaction.prod13.lease-hardening",
    planDigest: "a".repeat(64),
    planRevision: 7,
    operationId: "github.repository.file.update",
    actionRef: { id: "github.repository.file.update", versionRef: "1.0.0" },
    actionIntent: { version: "1", kind: "github.repository.file.update" },
    providerId: "github",
    connectionId: "github.connection",
    adapterRef: "adapter.github.contents",
    runnerRef: "runner.private",
    secretRef: {
      version: "1",
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      environment: scope.environment,
      provider: "vault",
      key: "providers.github.reference",
      versionRef: "1",
    },
    idempotencyKey: "prod13:lease-hardening",
    grantId: "grant.prod13.lease-hardening",
    grantNonce: "nonce.prod13.lease-hardening",
    reservationId: "reservation.prod13.lease-hardening",
    reservationRevision: 4,
    workerId: "worker.prod13.a",
    leaseEpoch: 1,
    expiresAtEpochMs: NOW + 90_000,
  };
}

function expectation(): ViraActionVerificationExpectation {
  const p = permit();
  const result = createViraActionVerificationExpectation({
    version: "1",
    scope,
    transactionId: p.transactionId,
    planDigest: p.planDigest,
    planRevision: p.planRevision,
    operationId: p.operationId,
    executionId: p.executionId,
    providerId: p.providerId,
    connectionId: p.connectionId,
    resourceType: "github.repository.file",
    resourceId: RESOURCE_ID,
    expectedBefore: { providerVersion: { kind: "blob-sha", value: PROVIDER_VERSION } },
    postconditions: [{ path: "/status", operator: "equals", value: "done" }],
    strategy: "immediate-readback",
    maxVerificationWindowMs: 120_000,
  });
  if (!result.ok) throw new Error(result.issue.code);
  return result.value;
}

function observation(status: string): ViraActionProviderObservation {
  const result = createViraActionProviderObservation({
    version: "1",
    scope,
    providerId: "github",
    connectionId: "github.connection",
    resourceType: "github.repository.file",
    resourceId: RESOURCE_ID,
    observedAtEpochMs: NOW + 10,
    providerVersion: { kind: "blob-sha", value: PROVIDER_VERSION },
    canonicalDigest: "b".repeat(64),
    data: { status },
  });
  if (!result.ok) throw new Error(result.issue.code);
  return result.value;
}

function verificationRecord(input: {
  status: "ready-to-write" | "verifying" | "verified";
  workerId: string | null;
  leaseExpiresAtEpochMs?: number;
  revision?: number;
}): ViraDurableActionVerificationRecord {
  const p = permit();
  const verificationId = stableId("verification", [p.executionId, p.reservationId]);
  const attemptId = stableId("attempt", [p.executionId, p.reservationId]);
  const revision = input.revision ?? 3;
  const leaseEpoch = input.workerId === null ? 1 : 1;
  return {
    version: "1",
    scope,
    verificationId,
    transactionId: p.transactionId,
    planDigest: p.planDigest,
    planRevision: p.planRevision,
    operationId: p.operationId,
    executionId: p.executionId,
    attemptId,
    providerId: p.providerId,
    connectionId: p.connectionId,
    resourceType: "github.repository.file",
    resourceId: RESOURCE_ID,
    revision,
    status: input.status,
    leaseEpoch,
    lease: input.workerId === null ? null : {
      workerId: input.workerId,
      epoch: leaseEpoch,
      expiresAtEpochMs: input.leaseExpiresAtEpochMs ?? NOW + 60_000,
    },
    beforeObservationDigest: "b".repeat(64),
    afterObservationDigest: input.status === "verified" ? "c".repeat(64) : null,
    writeDispatchedAtEpochMs: input.status === "ready-to-write" ? null : NOW + 20,
    createdAtEpochMs: NOW,
    updatedAtEpochMs: NOW + revision,
  };
}

function noopLedger(): ViraPostgresProductionActionLedgerStore {
  let sequence = 0;
  return {
    async append(input) {
      const current = sequence++;
      return {
        ok: true,
        value: {
          ...input.stream,
          sequence: current,
          operationId: input.operationId,
          executionId: input.executionId,
          ...(input.attemptId === undefined ? {} : { attemptId: input.attemptId }),
          kind: input.kind,
          occurredAtEpochMs: input.occurredAtEpochMs,
          evidenceDigest: "d".repeat(64),
          evidence: input.evidence,
          previousEntryHash: current === 0 ? null : "e".repeat(64),
          entryHash: "f".repeat(64),
        },
      };
    },
    async readEntries() { return []; },
    async appendCheckpoint(checkpoint) { return { ok: true, value: checkpoint }; },
  };
}

function secretProvider(): ViraPrivateRunnerSecretProvider {
  return {
    resolve({ scope: requestedScope, secretRef }) {
      return {
        scope: requestedScope,
        secretRef,
        credential: SECRET,
        expiresAtEpochMs: NOW + 80_000,
      };
    },
  };
}

describe("PROD-13 verification lease hardening", () => {
  it("never reaches the durable execution dispatch fence while a live verification lease belongs to another worker", async () => {
    const p = permit();
    const expected = expectation();
    const before = observation("before");
    const foreign = verificationRecord({ status: "ready-to-write", workerId: "worker.prod13.other" });
    let dispatchCalls = 0;

    const verificationStore = {
      async read() { return foreign; },
      async create() { throw new Error("create must not run"); },
      async recordPrecheck() { throw new Error("precheck must not run"); },
      async claimWrite() { throw new Error("claim must not run with a live lease"); },
      async markWriteDispatched() { throw new Error("verification dispatch must not run"); },
      async beginPostcondition() { throw new Error("postcondition must not run"); },
      async claimReadback() { throw new Error("readback must not run"); },
      async completePostcondition() { throw new Error("completion must not run"); },
      async recoverExpired() { throw new Error("live foreign lease must not recover"); },
    } satisfies ViraPostgresActionVerificationStore;

    const observationRepository: ViraPostgresActionVerificationObservationRepository = {
      async readPhase(input) { return input.phase === "before" ? before : undefined; },
    };
    const writeOutcomeStore = {
      async record() { throw new Error("write outcome must not run"); },
    } satisfies ViraPostgresActionVerificationWriteOutcomeStore;
    const executionStore = {
      async markDispatchStarted() {
        dispatchCalls += 1;
        throw new Error("dispatch fence must not run");
      },
    } satisfies Pick<ViraPostgresDurableExecutionStore, "markDispatchStarted">;
    const executionOutcomeStore = {
      async record() { throw new Error("execution outcome must not run"); },
    } satisfies ViraPostgresDurableExecutionOutcomeStore;

    const result = await runViraVerifiedProviderAction({
      permit: p,
      expectation: expected,
      leaseMs: 30_000,
      now: () => NOW + 100,
      verificationStore,
      observationRepository,
      writeOutcomeStore,
      executionStore,
      executionOutcomeStore,
      ledgerStore: noopLedger(),
      secretProvider: secretProvider(),
      adapters: {
        observationAdapter: { observe() { throw new Error("observation must not run"); } },
        writeAdapter() { return { invoke() { throw new Error("write must not run"); } }; },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      kind: "verification-store-failed",
      code: "VERIFICATION_LEASE_NOT_OWNED",
    });
    expect(dispatchCalls).toBe(0);
  });

  it("recovers an expired readback lease even when the expired lease belongs to the same worker, then reclaims before observing", async () => {
    const expected = expectation();
    let record = verificationRecord({
      status: "verifying",
      workerId: "worker.prod13.a",
      leaseExpiresAtEpochMs: NOW - 1,
      revision: 5,
    });
    let recoverCalls = 0;
    let claimCalls = 0;
    const after = observation("done");

    const verificationStore: ViraPostgresActionVerificationStore = {
      async read() { return record; },
      async create() { throw new Error("create must not run"); },
      async recordPrecheck() { throw new Error("precheck must not run"); },
      async claimWrite() { throw new Error("write claim must not run"); },
      async markWriteDispatched() { throw new Error("dispatch must not run"); },
      async beginPostcondition() { throw new Error("begin postcondition must not run"); },
      async recoverExpired() {
        recoverCalls += 1;
        record = { ...record, revision: record.revision + 1, lease: null, updatedAtEpochMs: NOW + 101 };
        return { ok: true, value: record };
      },
      async claimReadback(input) {
        claimCalls += 1;
        const epoch = record.leaseEpoch + 1;
        record = {
          ...record,
          revision: record.revision + 1,
          leaseEpoch: epoch,
          lease: { workerId: input.workerId, epoch, expiresAtEpochMs: NOW + 60_000 },
          updatedAtEpochMs: NOW + 102,
        };
        return { ok: true, value: record };
      },
      async completePostcondition(input) {
        record = {
          ...record,
          revision: record.revision + 1,
          status: input.status,
          lease: null,
          afterObservationDigest: input.observation?.canonicalDigest ?? null,
          updatedAtEpochMs: NOW + 103,
        };
        return { ok: true, value: record };
      },
    };

    const authority: ViraPrivateObservationAuthority = {
      version: "1",
      authorityId: record.verificationId,
      scope,
      providerId: record.providerId,
      connectionId: record.connectionId,
      actionIntent: permit().actionIntent,
      secretRef: permit().secretRef,
      expiresAtEpochMs: NOW + 120_000,
    };

    const result = await runViraVerifiedProviderReadback({
      verificationId: record.verificationId,
      expectation: expected,
      workerId: "worker.prod13.a",
      leaseMs: 30_000,
      now: () => NOW + 100,
      verificationStore,
      ledgerStore: noopLedger(),
      secretProvider: secretProvider(),
      observationAuthority: authority,
      observationAdapter: { observe() { return { observation: after }; } },
    });

    expect(result).toMatchObject({ ok: true, kind: "verified" });
    expect(recoverCalls).toBe(1);
    expect(claimCalls).toBe(1);
  });
});
