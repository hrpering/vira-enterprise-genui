import { describe, expect, it } from "vitest";
import {
  createViraActionVerificationExpectation,
  type ViraActionProviderObservation,
  type ViraActionVerificationExpectation,
} from "../../packages/action-verification/src/index.js";
import {
  beginViraPostconditionVerification,
  claimViraVerificationReadback,
  claimViraVerificationWrite,
  completeViraPostconditionVerification,
  markViraVerificationWriteDispatched,
  recordViraVerificationPrecheck,
  recoverViraVerificationAfterLeaseExpiry,
  type ViraDurableActionVerificationRecord,
} from "../../packages/action-verification/src/durable.js";
import { recordViraVerificationWriteOutcome } from "../../packages/action-verification/src/write-outcome.js";
import type { ViraDurableExecutionRecord, ViraDurableExecutionStageBPermit } from "../../packages/durable-execution/src/index.js";
import type { ViraPostgresActionVerificationObservationRepository } from "../../integrations/postgres/src/action-verification-observation.js";
import type { ViraPostgresActionVerificationWriteOutcomeStore } from "../../integrations/postgres/src/action-verification-write-outcome.js";
import type { ViraPostgresActionVerificationStore } from "../../integrations/postgres/src/action-verification.js";
import type { ViraPostgresProductionActionLedgerStore } from "../../integrations/postgres/src/production-action-ledger.js";
import type { ViraPostgresDurableExecutionOutcomeStore } from "../../integrations/postgres/src/durable-execution-outcome.js";
import type { ViraPostgresDurableExecutionStore } from "../../integrations/postgres/src/durable-execution.js";
import {
  createGitHubFileObservationAdapter,
  createGitHubFileWriteAdapter,
  githubFileResourceIdFromIntent,
} from "../../integrations/private-runner/github-file-action-adapter.js";
import type {
  ViraPrivateProviderHttpRequest,
  ViraPrivateProviderHttpResponse,
  ViraPrivateProviderHttpTransport,
} from "../../integrations/private-runner/provider-http.js";
import type { ViraPrivateRunnerSecretProvider } from "../../packages/private-runner/src/index.js";
import { runViraVerifiedProviderAction } from "../../apps/vira-worker/src/verified-provider-action.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

const OLD_SHA = "1".repeat(40);
const NEW_SHA = "2".repeat(40);
const SECRET = "prod13-orchestration-secret-0123456789";
const OLD_CONTENT = Buffer.from("old content", "utf8").toString("base64");
const NEW_CONTENT = Buffer.from("new content", "utf8").toString("base64");

function intent() {
  return Object.freeze({
    version: "1" as const,
    kind: "github.repository.file.update" as const,
    owner: "demo-owner",
    repo: "demo-repo",
    path: "docs/readme.md",
    branch: "main",
    message: "Update readme",
    contentBase64: NEW_CONTENT,
  });
}

function permit(): ViraDurableExecutionStageBPermit {
  const actionIntent = intent();
  return {
    version: "1",
    executionId: "execution.prod13.github.reference",
    scope,
    transactionId: "transaction.prod13.github.reference",
    planDigest: "a".repeat(64),
    planRevision: 7,
    operationId: "github.update.readme",
    actionRef: { id: "github.repository.file.update", versionRef: "1.0.0" },
    actionIntent,
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
    idempotencyKey: "prod13:github:reference-write",
    grantId: "grant.prod13.github.reference",
    grantNonce: "nonce.prod13.github.reference",
    reservationId: "reservation.prod13.github.reference",
    reservationRevision: 4,
    workerId: "worker.prod13.a",
    leaseEpoch: 1,
    expiresAtEpochMs: NOW + 90_000,
  };
}

function expectation(beforeSha = OLD_SHA): ViraActionVerificationExpectation {
  const result = createViraActionVerificationExpectation({
    version: "1",
    scope,
    transactionId: permit().transactionId,
    planDigest: permit().planDigest,
    planRevision: permit().planRevision,
    operationId: permit().operationId,
    executionId: permit().executionId,
    providerId: "github",
    connectionId: "github.connection",
    resourceType: "github.repository.file",
    resourceId: githubFileResourceIdFromIntent(intent()),
    expectedBefore: { providerVersion: { kind: "blob-sha", value: beforeSha } },
    postconditions: [{ path: "/contentBase64", operator: "equals", value: NEW_CONTENT }],
    strategy: "immediate-readback",
    maxVerificationWindowMs: 120_000,
  });
  if (!result.ok) throw new Error(result.issue.code);
  return result.value;
}

function queuedHttp(responses: readonly ViraPrivateProviderHttpResponse[]) {
  const requests: ViraPrivateProviderHttpRequest[] = [];
  let index = 0;
  const http: ViraPrivateProviderHttpTransport = {
    async request(input) {
      requests.push(input);
      const response = responses[index++];
      if (response === undefined) throw new Error("unexpected HTTP request");
      return response;
    },
  };
  return { http, requests };
}

function fileRead(sha: string, contentBase64: string): ViraPrivateProviderHttpResponse {
  return {
    status: 200,
    body: { type: "file", sha, path: intent().path, encoding: "base64", content: contentBase64 },
  };
}

function verificationFakes() {
  let record: ViraDurableActionVerificationRecord | undefined;
  let before: ViraActionProviderObservation | undefined;
  let after: ViraActionProviderObservation | undefined;

  const store: ViraPostgresActionVerificationStore = {
    async read() { return record; },
    async create(input) {
      if (record !== undefined) return { ok: false, code: "ALREADY_EXISTS" };
      record = input;
      return { ok: true, value: input };
    },
    async recordPrecheck(input) {
      if (record === undefined || record.revision !== input.expectedRevision) return { ok: false, code: "VERSION_CONFLICT" };
      const result = recordViraVerificationPrecheck({
        record,
        precondition: input.precondition,
        nowEpochMs: NOW + record.revision + 10,
        ...(input.observation === undefined ? {} : { observation: input.observation }),
      });
      if (!result.ok) return { ok: false, code: "INVALID_STATE" };
      record = result.value;
      if (input.observation !== undefined) before = input.observation;
      return { ok: true, value: record };
    },
    async claimWrite(input) {
      if (record === undefined) return { ok: false, code: "NOT_FOUND" };
      const result = claimViraVerificationWrite({ record, workerId: input.workerId, expectedRevision: input.expectedRevision, nowEpochMs: NOW + 30, leaseMs: input.leaseMs });
      if (!result.ok) return { ok: false, code: "INVALID_STATE" };
      record = result.value;
      return { ok: true, value: record };
    },
    async markWriteDispatched(input) {
      if (record === undefined) return { ok: false, code: "NOT_FOUND" };
      const result = markViraVerificationWriteDispatched({ record, workerId: input.workerId, leaseEpoch: input.leaseEpoch, expectedRevision: input.expectedRevision, nowEpochMs: NOW + 40 });
      if (!result.ok) return { ok: false, code: "INVALID_STATE" };
      record = result.value;
      return { ok: true, value: record };
    },
    async beginPostcondition(input) {
      if (record === undefined) return { ok: false, code: "NOT_FOUND" };
      const result = beginViraPostconditionVerification({ record, workerId: input.workerId, leaseEpoch: input.leaseEpoch, expectedRevision: input.expectedRevision, nowEpochMs: NOW + 50 });
      if (!result.ok) return { ok: false, code: "INVALID_STATE" };
      record = result.value;
      return { ok: true, value: record };
    },
    async claimReadback(input) {
      if (record === undefined) return { ok: false, code: "NOT_FOUND" };
      const result = claimViraVerificationReadback({ record, workerId: input.workerId, expectedRevision: input.expectedRevision, nowEpochMs: NOW + 60, leaseMs: input.leaseMs });
      if (!result.ok) return { ok: false, code: "INVALID_STATE" };
      record = result.value;
      return { ok: true, value: record };
    },
    async completePostcondition(input) {
      if (record === undefined) return { ok: false, code: "NOT_FOUND" };
      const result = completeViraPostconditionVerification({
        record,
        workerId: input.workerId,
        leaseEpoch: input.leaseEpoch,
        expectedRevision: input.expectedRevision,
        nowEpochMs: NOW + 70,
        status: input.status,
        ...(input.observation === undefined ? {} : { observation: input.observation }),
      });
      if (!result.ok) return { ok: false, code: "INVALID_STATE" };
      record = result.value;
      if (input.observation !== undefined) after = input.observation;
      return { ok: true, value: record };
    },
    async recoverExpired(input) {
      if (record === undefined) return { ok: false, code: "NOT_FOUND" };
      const result = recoverViraVerificationAfterLeaseExpiry({ record, expectedRevision: input.expectedRevision, nowEpochMs: NOW + 100_000 });
      if (!result.ok) return { ok: false, code: "INVALID_STATE" };
      record = result.value;
      return { ok: true, value: record };
    },
  };

  const observations: ViraPostgresActionVerificationObservationRepository = {
    async readPhase(input) { return input.phase === "before" ? before : after; },
  };

  const writeOutcome: ViraPostgresActionVerificationWriteOutcomeStore = {
    async record(input) {
      if (record === undefined) return { ok: false, code: "NOT_FOUND" };
      const result = recordViraVerificationWriteOutcome({
        record,
        workerId: input.workerId,
        leaseEpoch: input.leaseEpoch,
        expectedRevision: input.expectedRevision,
        nowEpochMs: NOW + 55,
        outcome: input.outcome,
      });
      if (!result.ok) return { ok: false, code: "INVALID_STATE" };
      record = result.value;
      return { ok: true, value: record };
    },
  };

  return { store, observations, writeOutcome, getRecord: () => record };
}

function executionRecord(status: "executing" | "verifying" | "manual" | "uncertain", revision: number, lease: boolean): ViraDurableExecutionRecord {
  const p = permit();
  return {
    version: "1",
    executionId: p.executionId,
    scope,
    transactionId: p.transactionId,
    planDigest: p.planDigest,
    planRevision: p.planRevision,
    operationId: p.operationId,
    grantId: p.grantId,
    grantNonce: p.grantNonce,
    idempotencyKey: p.idempotencyKey,
    revision,
    status,
    leaseEpoch: p.leaseEpoch,
    lease: lease ? { workerId: p.workerId, epoch: p.leaseEpoch, expiresAtEpochMs: NOW + 80_000 } : null,
    dispatchState: "started",
    createdAtEpochMs: NOW,
    updatedAtEpochMs: NOW + revision,
  };
}

function durableFakes() {
  let dispatchCalls = 0;
  const executionStore = {
    async markDispatchStarted() {
      dispatchCalls += 1;
      return { ok: true as const, value: executionRecord("executing", 5, true) };
    },
  } satisfies Pick<ViraPostgresDurableExecutionStore, "markDispatchStarted">;

  const executionOutcomeStore: ViraPostgresDurableExecutionOutcomeStore = {
    async record(input) {
      const status = input.outcome === "accepted" ? "verifying" : input.outcome === "rejected" ? "manual" : "uncertain";
      return { ok: true, value: executionRecord(status, 6, false) };
    },
  };
  return { executionStore, executionOutcomeStore, dispatchCalls: () => dispatchCalls };
}

function ledgerFake() {
  const kinds: string[] = [];
  const ledgerStore: ViraPostgresProductionActionLedgerStore = {
    async append(input) {
      kinds.push(input.kind);
      return {
        ok: true,
        value: {
          ...input.stream,
          sequence: kinds.length - 1,
          operationId: input.operationId,
          executionId: input.executionId,
          ...(input.attemptId === undefined ? {} : { attemptId: input.attemptId }),
          kind: input.kind,
          occurredAtEpochMs: input.occurredAtEpochMs,
          evidenceDigest: "d".repeat(64),
          evidence: input.evidence,
          previousEntryHash: kinds.length === 1 ? null : "e".repeat(64),
          entryHash: "f".repeat(64),
        },
      };
    },
    async readEntries() { return []; },
    async appendCheckpoint(checkpoint) { return { ok: true, value: checkpoint }; },
  };
  return { ledgerStore, kinds };
}

function secretProvider(): ViraPrivateRunnerSecretProvider {
  return {
    resolve({ scope: requestedScope, secretRef }) {
      return { scope: requestedScope, secretRef, credential: SECRET, expiresAtEpochMs: NOW + 80_000 };
    },
  };
}

function baseDependencies(http: ViraPrivateProviderHttpTransport, expected = expectation()) {
  const verification = verificationFakes();
  const durable = durableFakes();
  const ledger = ledgerFake();
  let tick = 0;
  const now = () => NOW + (++tick);
  return {
    dependencies: {
      permit: permit(),
      expectation: expected,
      leaseMs: 30_000,
      now,
      verificationStore: verification.store,
      observationRepository: verification.observations,
      writeOutcomeStore: verification.writeOutcome,
      executionStore: durable.executionStore,
      executionOutcomeStore: durable.executionOutcomeStore,
      ledgerStore: ledger.ledgerStore,
      secretProvider: secretProvider(),
      adapters: {
        observationAdapter: createGitHubFileObservationAdapter({ http, now }),
        writeAdapter: (version: { readonly kind: string; readonly value: string }) => {
          if (version.kind !== "blob-sha") throw new Error("wrong GitHub version kind");
          return createGitHubFileWriteAdapter({ http, expectedBlobSha: version.value });
        },
      },
    },
    verification,
    durable,
    ledger,
  };
}

describe("PROD-13 verified provider action worker", () => {
  it("performs independent pre-read, conditional write, independent post-read and only then returns verified", async () => {
    const { http, requests } = queuedHttp([
      fileRead(OLD_SHA, OLD_CONTENT),
      { status: 200, body: { content: { sha: NEW_SHA }, commit: { sha: "3".repeat(40) } } },
      fileRead(NEW_SHA, NEW_CONTENT),
    ]);
    const setup = baseDependencies(http);
    const result = await runViraVerifiedProviderAction(setup.dependencies);
    expect(result).toMatchObject({ ok: true, kind: "verified" });
    expect(requests.map((request) => request.method)).toEqual(["GET", "PUT", "GET"]);
    expect(JSON.parse(requests[1]!.body ?? "{}").sha).toBe(OLD_SHA);
    expect(setup.ledger.kinds).toEqual([
      "provider.precondition.observed",
      "provider.dispatch.started",
      "provider.dispatch.accepted",
      "provider.postcondition.observed",
      "provider.effect.verified",
    ]);
    expect(setup.verification.getRecord()?.status).toBe("verified");
  });

  it("never reaches dispatch when independent pre-read mismatches the frozen version", async () => {
    const { http, requests } = queuedHttp([fileRead("9".repeat(40), OLD_CONTENT)]);
    const setup = baseDependencies(http);
    const result = await runViraVerifiedProviderAction(setup.dependencies);
    expect(result).toMatchObject({ ok: true, kind: "precondition-mismatch" });
    expect(requests.map((request) => request.method)).toEqual(["GET"]);
    expect(setup.durable.dispatchCalls()).toBe(0);
    expect(setup.ledger.kinds).toEqual(["provider.precondition.mismatch"]);
  });

  it("classifies GitHub 409 as precondition mismatch without a post-read or blind retry", async () => {
    const { http, requests } = queuedHttp([
      fileRead(OLD_SHA, OLD_CONTENT),
      { status: 409, body: { message: "conflict" } },
    ]);
    const setup = baseDependencies(http);
    const result = await runViraVerifiedProviderAction(setup.dependencies);
    expect(result).toMatchObject({ ok: true, kind: "precondition-mismatch" });
    expect(requests.map((request) => request.method)).toEqual(["GET", "PUT"]);
    expect(setup.verification.getRecord()?.status).toBe("precondition-mismatch");
    expect(setup.ledger.kinds).toContain("provider.dispatch.rejected");
  });

  it("keeps accepted write uncertain when the independent post-read is unavailable", async () => {
    const { http, requests } = queuedHttp([
      fileRead(OLD_SHA, OLD_CONTENT),
      { status: 200, body: { content: { sha: NEW_SHA } } },
      { status: 503, body: { message: "unavailable" } },
    ]);
    const setup = baseDependencies(http);
    const result = await runViraVerifiedProviderAction(setup.dependencies);
    expect(result).toMatchObject({ ok: true, kind: "uncertain" });
    expect(requests.map((request) => request.method)).toEqual(["GET", "PUT", "GET"]);
    expect(setup.verification.getRecord()?.status).toBe("uncertain");
    expect(setup.ledger.kinds).not.toContain("provider.effect.verified");
    expect(setup.ledger.kinds).toContain("provider.effect.uncertain");
  });
});
