import { createHash } from "node:crypto";
import {
  createViraActionProviderObservation,
  createViraActionVerificationExpectation,
  evaluateViraActionPostcondition,
  evaluateViraActionPrecondition,
  type ViraActionProviderObservation,
  type ViraActionProviderVersion,
  type ViraActionVerificationExpectation,
} from "../../../packages/action-verification/src/index.js";
import {
  createViraDurableActionVerificationRecord,
  type ViraDurableActionVerificationRecord,
} from "../../../packages/action-verification/src/durable.js";
import type { ViraDurableExecutionStageBPermit } from "../../../packages/durable-execution/src/index.js";
import type { ViraEnterpriseScope, ViraSecretRef } from "../../../packages/enterprise-context/src/index.js";
import {
  runViraPrivateObservation,
  type ViraPrivateObservationAdapter,
  type ViraPrivateObservationAuthority,
} from "../../../packages/private-runner/src/observation.js";
import {
  runViraPrivateExecution,
  type ViraPrivateRunnerAdapter,
  type ViraPrivateRunnerSecretProvider,
} from "../../../packages/private-runner/src/index.js";
import type { JsonObject } from "../../../packages/protocol/src/index.js";
import type {
  ViraPostgresActionVerificationObservationRepository,
} from "../../../integrations/postgres/src/action-verification-observation.js";
import type {
  ViraPostgresActionVerificationWriteOutcomeStore,
} from "../../../integrations/postgres/src/action-verification-write-outcome.js";
import type {
  ViraPostgresActionVerificationStore,
} from "../../../integrations/postgres/src/action-verification.js";
import type {
  ViraPostgresProductionActionLedgerStore,
} from "../../../integrations/postgres/src/production-action-ledger.js";
import type {
  ViraPostgresDurableExecutionOutcomeStore,
} from "../../../integrations/postgres/src/durable-execution-outcome.js";
import type {
  ViraPostgresDurableExecutionStore,
} from "../../../integrations/postgres/src/durable-execution.js";

export interface ViraVerifiedProviderAdapterSet {
  readonly observationAdapter: ViraPrivateObservationAdapter;
  readonly writeAdapter: (version: ViraActionProviderVersion) => ViraPrivateRunnerAdapter;
}

export type ViraVerifiedProviderActionResult =
  | { readonly ok: true; readonly kind: "verified" | "partial" | "mismatch"; readonly verificationId: string; readonly revision: number }
  | { readonly ok: true; readonly kind: "precondition-mismatch" | "manual" | "uncertain"; readonly verificationId: string; readonly revision: number }
  | { readonly ok: false; readonly kind: "verification-store-failed" | "ledger-failed" | "dispatch-fence-failed" | "outcome-store-failed"; readonly verificationId: string; readonly code: string };

export interface ViraVerifiedProviderActionDependencies {
  readonly permit: ViraDurableExecutionStageBPermit;
  readonly expectation: ViraActionVerificationExpectation;
  readonly leaseMs: number;
  readonly now: () => number;
  readonly verificationStore: ViraPostgresActionVerificationStore;
  readonly observationRepository: ViraPostgresActionVerificationObservationRepository;
  readonly writeOutcomeStore: ViraPostgresActionVerificationWriteOutcomeStore;
  readonly executionStore: Pick<ViraPostgresDurableExecutionStore, "markDispatchStarted">;
  readonly executionOutcomeStore: ViraPostgresDurableExecutionOutcomeStore;
  readonly ledgerStore: ViraPostgresProductionActionLedgerStore;
  readonly secretProvider: ViraPrivateRunnerSecretProvider;
  readonly adapters: ViraVerifiedProviderAdapterSet;
}

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const MAX_LEASE_MS = 5 * 60 * 1_000;

function safeNow(now: () => number): number {
  const value = now();
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new TypeError("verified provider worker clock is invalid");
  return value;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function exactSecretRef(left: ViraSecretRef, right: ViraSecretRef): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment
    && left.provider === right.provider
    && left.key === right.key
    && left.versionRef === right.versionRef;
}

function stableId(prefix: string, values: readonly string[]): string {
  return `${prefix}.${createHash("sha256").update(values.join("\u0000")).digest("hex")}`;
}

function exactExpectation(permit: ViraDurableExecutionStageBPermit, expectation: ViraActionVerificationExpectation): boolean {
  return exactScope(permit.scope, expectation.scope)
    && permit.transactionId === expectation.transactionId
    && permit.planDigest === expectation.planDigest
    && permit.planRevision === expectation.planRevision
    && permit.operationId === expectation.operationId
    && permit.executionId === expectation.executionId
    && permit.providerId === expectation.providerId
    && permit.connectionId === expectation.connectionId;
}

function verificationId(permit: ViraDurableExecutionStageBPermit): string {
  return stableId("verification", [permit.executionId, permit.reservationId]);
}

function attemptId(permit: ViraDurableExecutionStageBPermit): string {
  return stableId("attempt", [permit.executionId, permit.reservationId]);
}

function ledgerId(expectation: ViraActionVerificationExpectation): string {
  return stableId("ledger", [
    expectation.scope.organizationId,
    expectation.scope.projectId,
    expectation.scope.environment,
    expectation.transactionId,
    expectation.planDigest,
    String(expectation.planRevision),
  ]);
}

function observationAuthority(input: {
  readonly permit: ViraDurableExecutionStageBPermit;
  readonly record: ViraDurableActionVerificationRecord;
  readonly expectation: ViraActionVerificationExpectation;
}): ViraPrivateObservationAuthority {
  const expiresAtEpochMs = input.record.createdAtEpochMs + input.expectation.maxVerificationWindowMs;
  if (!Number.isSafeInteger(expiresAtEpochMs) || expiresAtEpochMs <= input.record.createdAtEpochMs) {
    throw new TypeError("verification observation authority expiry is invalid");
  }
  return Object.freeze({
    version: "1",
    authorityId: input.record.verificationId,
    scope: input.permit.scope,
    providerId: input.permit.providerId,
    connectionId: input.permit.connectionId,
    actionIntent: input.permit.actionIntent,
    secretRef: input.permit.secretRef,
    expiresAtEpochMs,
  });
}

function observationFromPrivate(data: JsonObject): ViraActionProviderObservation | undefined {
  const result = createViraActionProviderObservation(data.observation);
  return result.ok ? result.value : undefined;
}

async function appendLedger(input: {
  readonly dependencies: ViraVerifiedProviderActionDependencies;
  readonly expectation: ViraActionVerificationExpectation;
  readonly attemptId: string;
  readonly kind: Parameters<ViraPostgresProductionActionLedgerStore["append"]>[0]["kind"];
  readonly evidence: JsonObject;
  readonly executionRevision?: number;
  readonly leaseEpoch?: number;
}): Promise<boolean> {
  const result = await input.dependencies.ledgerStore.append({
    stream: Object.freeze({
      version: "1",
      scope: input.expectation.scope,
      ledgerId: ledgerId(input.expectation),
      transactionId: input.expectation.transactionId,
      planDigest: input.expectation.planDigest,
      planRevision: input.expectation.planRevision,
    }),
    operationId: input.expectation.operationId,
    executionId: input.expectation.executionId,
    attemptId: input.attemptId,
    ...(input.executionRevision === undefined ? {} : { executionRevision: input.executionRevision }),
    ...(input.leaseEpoch === undefined ? {} : { leaseEpoch: input.leaseEpoch }),
    kind: input.kind,
    occurredAtEpochMs: safeNow(input.dependencies.now),
    evidence: input.evidence,
  });
  return result.ok;
}

async function ensureVerification(
  dependencies: ViraVerifiedProviderActionDependencies,
  expectation: ViraActionVerificationExpectation,
): Promise<ViraDurableActionVerificationRecord> {
  const id = verificationId(dependencies.permit);
  const attempt = attemptId(dependencies.permit);
  const existing = await dependencies.verificationStore.read(expectation.scope, id);
  if (existing !== undefined) {
    if (
      existing.transactionId !== expectation.transactionId
      || existing.planDigest !== expectation.planDigest
      || existing.planRevision !== expectation.planRevision
      || existing.operationId !== expectation.operationId
      || existing.executionId !== expectation.executionId
      || existing.attemptId !== attempt
      || existing.providerId !== expectation.providerId
      || existing.connectionId !== expectation.connectionId
      || existing.resourceType !== expectation.resourceType
      || existing.resourceId !== expectation.resourceId
    ) throw new TypeError("existing verification record does not bind the exact expectation");
    return existing;
  }
  const created = createViraDurableActionVerificationRecord({
    scope: expectation.scope,
    verificationId: id,
    transactionId: expectation.transactionId,
    planDigest: expectation.planDigest,
    planRevision: expectation.planRevision,
    operationId: expectation.operationId,
    executionId: expectation.executionId,
    attemptId: attempt,
    providerId: expectation.providerId,
    connectionId: expectation.connectionId,
    resourceType: expectation.resourceType,
    resourceId: expectation.resourceId,
    createdAtEpochMs: safeNow(dependencies.now),
  });
  if (!created.ok) throw new TypeError("verification record could not be created");
  const persisted = await dependencies.verificationStore.create(created.value);
  if (persisted.ok) return persisted.value;
  if (persisted.code !== "ALREADY_EXISTS") throw new TypeError(`verification create failed: ${persisted.code}`);
  const raced = await dependencies.verificationStore.read(expectation.scope, id);
  if (raced === undefined) throw new TypeError("verification create raced without a readable record");
  return raced;
}

export async function runViraVerifiedProviderAction(
  dependencies: ViraVerifiedProviderActionDependencies,
): Promise<ViraVerifiedProviderActionResult> {
  if (
    dependencies === null
    || typeof dependencies !== "object"
    || !Number.isSafeInteger(dependencies.leaseMs)
    || dependencies.leaseMs <= 0
    || dependencies.leaseMs > MAX_LEASE_MS
    || typeof dependencies.now !== "function"
    || dependencies.adapters === null
    || typeof dependencies.adapters !== "object"
    || typeof dependencies.adapters.writeAdapter !== "function"
    || dependencies.adapters.observationAdapter === null
    || typeof dependencies.adapters.observationAdapter !== "object"
  ) throw new TypeError("verified provider action dependencies are invalid");

  const canonicalExpectation = createViraActionVerificationExpectation(dependencies.expectation);
  if (!canonicalExpectation.ok || !exactExpectation(dependencies.permit, canonicalExpectation.value)) {
    throw new TypeError("verified provider action expectation does not bind the exact Stage B permit");
  }
  const expectation = canonicalExpectation.value;
  const attempt = attemptId(dependencies.permit);
  let record = await ensureVerification(dependencies, expectation);
  const id = record.verificationId;
  const authority = observationAuthority({ permit: dependencies.permit, record, expectation });

  if (!exactScope(authority.scope, dependencies.permit.scope) || !exactSecretRef(authority.secretRef, dependencies.permit.secretRef)) {
    throw new TypeError("verification observation authority drifted from Stage B permit");
  }

  if (record.status === "pending-precheck") {
    const privateBefore = await runViraPrivateObservation({
      authority,
      nowEpochMs: safeNow(dependencies.now),
      secretProvider: dependencies.secretProvider,
      adapter: dependencies.adapters.observationAdapter,
    });
    if (!privateBefore.ok) {
      const unavailable = await dependencies.verificationStore.recordPrecheck({
        scope: expectation.scope,
        verificationId: id,
        expectedRevision: record.revision,
        precondition: "unavailable",
      });
      if (!unavailable.ok) return { ok: false, kind: "verification-store-failed", verificationId: id, code: unavailable.code };
      return { ok: true, kind: "uncertain", verificationId: id, revision: unavailable.value.revision };
    }
    const before = observationFromPrivate(privateBefore.value.data);
    if (before === undefined) {
      const unavailable = await dependencies.verificationStore.recordPrecheck({
        scope: expectation.scope,
        verificationId: id,
        expectedRevision: record.revision,
        precondition: "unavailable",
      });
      if (!unavailable.ok) return { ok: false, kind: "verification-store-failed", verificationId: id, code: unavailable.code };
      return { ok: true, kind: "uncertain", verificationId: id, revision: unavailable.value.revision };
    }
    const precondition = evaluateViraActionPrecondition({ expectation, observation: before });
    if (!precondition.ok) throw new TypeError("provider precondition observation identity is invalid");
    const persisted = await dependencies.verificationStore.recordPrecheck({
      scope: expectation.scope,
      verificationId: id,
      expectedRevision: record.revision,
      precondition: precondition.value.status,
      observation: before,
    });
    if (!persisted.ok) return { ok: false, kind: "verification-store-failed", verificationId: id, code: persisted.code };
    record = persisted.value;
    const ledgerOk = await appendLedger({
      dependencies,
      expectation,
      attemptId: attempt,
      kind: precondition.value.status === "match" ? "provider.precondition.observed" : "provider.precondition.mismatch",
      evidence: Object.freeze({
        status: precondition.value.status,
        canonicalDigest: before.canonicalDigest,
        providerVersion: Object.freeze({
          kind: before.providerVersion.kind,
          value: before.providerVersion.value,
        }),
      }),
    });
    if (!ledgerOk) return { ok: false, kind: "ledger-failed", verificationId: id, code: "PRECONDITION_LEDGER_FAILED" };
    if (precondition.value.status !== "match") {
      return { ok: true, kind: "precondition-mismatch", verificationId: id, revision: record.revision };
    }
  }

  if (record.status === "precondition-mismatch") {
    return { ok: true, kind: "precondition-mismatch", verificationId: id, revision: record.revision };
  }
  if (record.status === "uncertain" || record.status === "manual") {
    return { ok: true, kind: record.status, verificationId: id, revision: record.revision };
  }

  const before = await dependencies.observationRepository.readPhase({
    scope: expectation.scope,
    verificationId: id,
    attemptId: attempt,
    phase: "before",
  });
  if (before === undefined) return { ok: false, kind: "verification-store-failed", verificationId: id, code: "BEFORE_OBSERVATION_MISSING" };

  if (record.status === "ready-to-write" && record.lease !== null) {
    const leaseNow = safeNow(dependencies.now);

    if (record.lease.expiresAtEpochMs <= leaseNow) {
      const recovered = await dependencies.verificationStore.recoverExpired({
        scope: expectation.scope,
        verificationId: id,
        expectedRevision: record.revision,
      });

      if (!recovered.ok) {
        return {
          ok: false,
          kind: "verification-store-failed",
          verificationId: id,
          code: recovered.code,
        };
      }

      record = recovered.value;
    } else if (record.lease.workerId !== dependencies.permit.workerId) {
      return {
        ok: false,
        kind: "verification-store-failed",
        verificationId: id,
        code: "VERIFICATION_LEASE_NOT_OWNED",
      };
    }
  }

  if (record.status === "ready-to-write" && record.lease === null) {
    const claimed = await dependencies.verificationStore.claimWrite({
      scope: expectation.scope,
      verificationId: id,
      workerId: dependencies.permit.workerId,
      expectedRevision: record.revision,
      leaseMs: dependencies.leaseMs,
    });
    if (!claimed.ok) return { ok: false, kind: "verification-store-failed", verificationId: id, code: claimed.code };
    record = claimed.value;
  }

  if (record.status === "ready-to-write" && record.lease !== null) {
    const dispatchNow = safeNow(dependencies.now);

    if (record.lease.workerId !== dependencies.permit.workerId) {
      return {
        ok: false,
        kind: "verification-store-failed",
        verificationId: id,
        code: "VERIFICATION_LEASE_NOT_OWNED",
      };
    }

    if (record.lease.expiresAtEpochMs <= dispatchNow) {
      return {
        ok: false,
        kind: "verification-store-failed",
        verificationId: id,
        code: "VERIFICATION_LEASE_EXPIRED_BEFORE_DISPATCH",
      };
    }

    const dispatch = await dependencies.executionStore.markDispatchStarted({
      scope: dependencies.permit.scope,
      executionId: dependencies.permit.executionId,
      workerId: dependencies.permit.workerId,
      leaseEpoch: dependencies.permit.leaseEpoch,
      expectedRevision: dependencies.permit.reservationRevision,
      nowEpochMs: dispatchNow,
    });
    if (!dispatch.ok) return { ok: false, kind: "dispatch-fence-failed", verificationId: id, code: dispatch.code };

    const verificationDispatch = await dependencies.verificationStore.markWriteDispatched({
      scope: expectation.scope,
      verificationId: id,
      workerId: dependencies.permit.workerId,
      leaseEpoch: record.leaseEpoch,
      expectedRevision: record.revision,
    });
    if (!verificationDispatch.ok) return { ok: false, kind: "verification-store-failed", verificationId: id, code: verificationDispatch.code };
    record = verificationDispatch.value;

    const startedLedger = await appendLedger({
      dependencies,
      expectation,
      attemptId: attempt,
      kind: "provider.dispatch.started",
      evidence: Object.freeze({
        conditionalVersion: Object.freeze({
          kind: before.providerVersion.kind,
          value: before.providerVersion.value,
        }),
      }),
      executionRevision: dispatch.value.revision,
      leaseEpoch: dependencies.permit.leaseEpoch,
    });
    if (!startedLedger) return { ok: false, kind: "ledger-failed", verificationId: id, code: "DISPATCH_LEDGER_FAILED" };

    const privateWrite = await runViraPrivateExecution({
      permit: dependencies.permit,
      nowEpochMs: safeNow(dependencies.now),
      secretProvider: dependencies.secretProvider,
      adapter: dependencies.adapters.writeAdapter(before.providerVersion),
    });

    if (!privateWrite.ok) {
      const verificationOutcome = await dependencies.writeOutcomeStore.record({
        scope: expectation.scope,
        verificationId: id,
        workerId: dependencies.permit.workerId,
        leaseEpoch: record.leaseEpoch,
        expectedRevision: record.revision,
        outcome: "uncertain",
      });
      if (!verificationOutcome.ok) return { ok: false, kind: "verification-store-failed", verificationId: id, code: verificationOutcome.code };
      const executionOutcome = await dependencies.executionOutcomeStore.record({
        scope: dispatch.value.scope,
        executionId: dispatch.value.executionId,
        workerId: dependencies.permit.workerId,
        leaseEpoch: dispatch.value.leaseEpoch,
        expectedRevision: dispatch.value.revision,
        nowEpochMs: safeNow(dependencies.now),
        outcome: "uncertain",
      });
      if (!executionOutcome.ok) return { ok: false, kind: "outcome-store-failed", verificationId: id, code: executionOutcome.code };
      await appendLedger({ dependencies, expectation, attemptId: attempt, kind: "provider.dispatch.uncertain", evidence: Object.freeze({ code: privateWrite.issue.code }) });
      return { ok: true, kind: "uncertain", verificationId: id, revision: verificationOutcome.value.revision };
    }

    if (privateWrite.value.dispatch === "rejected") {
      const code = privateWrite.value.data?.code;
      const outcome = code === "precondition-conflict" ? "precondition-conflict" : "provider-rejected";
      const verificationOutcome = await dependencies.writeOutcomeStore.record({
        scope: expectation.scope,
        verificationId: id,
        workerId: dependencies.permit.workerId,
        leaseEpoch: record.leaseEpoch,
        expectedRevision: record.revision,
        outcome,
      });
      if (!verificationOutcome.ok) return { ok: false, kind: "verification-store-failed", verificationId: id, code: verificationOutcome.code };
      const executionOutcome = await dependencies.executionOutcomeStore.record({
        scope: dispatch.value.scope,
        executionId: dispatch.value.executionId,
        workerId: dependencies.permit.workerId,
        leaseEpoch: dispatch.value.leaseEpoch,
        expectedRevision: dispatch.value.revision,
        nowEpochMs: safeNow(dependencies.now),
        outcome: "rejected",
      });
      if (!executionOutcome.ok) return { ok: false, kind: "outcome-store-failed", verificationId: id, code: executionOutcome.code };
      await appendLedger({
        dependencies,
        expectation,
        attemptId: attempt,
        kind: "provider.dispatch.rejected",
        evidence: Object.freeze({ code: typeof code === "string" && SAFE_TOKEN.test(code) ? code : "provider-rejected" }),
      });
      return {
        ok: true,
        kind: outcome === "precondition-conflict" ? "precondition-mismatch" : "manual",
        verificationId: id,
        revision: verificationOutcome.value.revision,
      };
    }

    const acceptedLedger = await appendLedger({
      dependencies,
      expectation,
      attemptId: attempt,
      kind: "provider.dispatch.accepted",
      evidence: Object.freeze({ accepted: true }),
    });
    if (!acceptedLedger) return { ok: false, kind: "ledger-failed", verificationId: id, code: "DISPATCH_ACCEPT_LEDGER_FAILED" };

    const verifying = await dependencies.verificationStore.beginPostcondition({
      scope: expectation.scope,
      verificationId: id,
      workerId: dependencies.permit.workerId,
      leaseEpoch: record.leaseEpoch,
      expectedRevision: record.revision,
    });
    if (!verifying.ok) return { ok: false, kind: "verification-store-failed", verificationId: id, code: verifying.code };
    record = verifying.value;

    const executionOutcome = await dependencies.executionOutcomeStore.record({
      scope: dispatch.value.scope,
      executionId: dispatch.value.executionId,
      workerId: dependencies.permit.workerId,
      leaseEpoch: dispatch.value.leaseEpoch,
      expectedRevision: dispatch.value.revision,
      nowEpochMs: safeNow(dependencies.now),
      outcome: "accepted",
    });
    if (!executionOutcome.ok) return { ok: false, kind: "outcome-store-failed", verificationId: id, code: executionOutcome.code };
  }

  if (record.status !== "verifying") {
    if (record.status === "verified" || record.status === "partial" || record.status === "mismatch") {
      return { ok: true, kind: record.status, verificationId: id, revision: record.revision };
    }
    return { ok: false, kind: "verification-store-failed", verificationId: id, code: `UNEXPECTED_STATUS_${record.status}` };
  }

  if (record.lease === null) {
    const claimed = await dependencies.verificationStore.claimReadback({
      scope: expectation.scope,
      verificationId: id,
      workerId: dependencies.permit.workerId,
      expectedRevision: record.revision,
      leaseMs: dependencies.leaseMs,
    });
    if (!claimed.ok) return { ok: false, kind: "verification-store-failed", verificationId: id, code: claimed.code };
    record = claimed.value;
  }

  const privateAfter = await runViraPrivateObservation({
    authority,
    nowEpochMs: safeNow(dependencies.now),
    secretProvider: dependencies.secretProvider,
    adapter: dependencies.adapters.observationAdapter,
  });
  if (!privateAfter.ok) {
    const uncertain = await dependencies.verificationStore.completePostcondition({
      scope: expectation.scope,
      verificationId: id,
      workerId: dependencies.permit.workerId,
      leaseEpoch: record.leaseEpoch,
      expectedRevision: record.revision,
      status: "uncertain",
    });
    if (!uncertain.ok) return { ok: false, kind: "verification-store-failed", verificationId: id, code: uncertain.code };
    await appendLedger({ dependencies, expectation, attemptId: attempt, kind: "provider.effect.uncertain", evidence: Object.freeze({ code: privateAfter.issue.code }) });
    return { ok: true, kind: "uncertain", verificationId: id, revision: uncertain.value.revision };
  }

  const after = observationFromPrivate(privateAfter.value.data);
  if (after === undefined) {
    const uncertain = await dependencies.verificationStore.completePostcondition({
      scope: expectation.scope,
      verificationId: id,
      workerId: dependencies.permit.workerId,
      leaseEpoch: record.leaseEpoch,
      expectedRevision: record.revision,
      status: "uncertain",
    });
    if (!uncertain.ok) return { ok: false, kind: "verification-store-failed", verificationId: id, code: uncertain.code };
    return { ok: true, kind: "uncertain", verificationId: id, revision: uncertain.value.revision };
  }

  const decision = evaluateViraActionPostcondition({ expectation, observation: after });
  if (!decision.ok) throw new TypeError("provider postcondition observation identity is invalid");
  const completed = await dependencies.verificationStore.completePostcondition({
    scope: expectation.scope,
    verificationId: id,
    workerId: dependencies.permit.workerId,
    leaseEpoch: record.leaseEpoch,
    expectedRevision: record.revision,
    status: decision.value.status,
    ...(decision.value.status === "uncertain" ? {} : { observation: after }),
  });
  if (!completed.ok) return { ok: false, kind: "verification-store-failed", verificationId: id, code: completed.code };

  const observedLedger = await appendLedger({
    dependencies,
    expectation,
    attemptId: attempt,
    kind: "provider.postcondition.observed",
    evidence: Object.freeze({
      canonicalDigest: after.canonicalDigest,
      providerVersion: Object.freeze({
        kind: after.providerVersion.kind,
        value: after.providerVersion.value,
      }),
    }),
  });
  if (!observedLedger) return { ok: false, kind: "ledger-failed", verificationId: id, code: "POSTCONDITION_LEDGER_FAILED" };
  const effectKind = decision.value.status === "verified"
    ? "provider.effect.verified"
    : decision.value.status === "partial"
      ? "provider.effect.partial"
      : decision.value.status === "mismatch"
        ? "provider.effect.mismatch"
        : "provider.effect.uncertain";
  const truthLedger = await appendLedger({
    dependencies,
    expectation,
    attemptId: attempt,
    kind: effectKind,
    evidence: Object.freeze({
      status: decision.value.status,
      matchedAssertions: decision.value.matchedAssertions,
      totalAssertions: decision.value.totalAssertions,
    }),
  });
  if (!truthLedger) return { ok: false, kind: "ledger-failed", verificationId: id, code: "TRUTH_LEDGER_FAILED" };

  return {
    ok: true,
    kind: decision.value.status,
    verificationId: id,
    revision: completed.value.revision,
  };
}
