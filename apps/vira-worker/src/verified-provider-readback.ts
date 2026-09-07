import { createHash } from "node:crypto";
import {
  createViraActionProviderObservation,
  createViraActionVerificationExpectation,
  evaluateViraActionPostcondition,
  type ViraActionVerificationExpectation,
} from "../../../packages/action-verification/src/index.js";
import type { ViraDurableActionVerificationRecord } from "../../../packages/action-verification/src/durable.js";
import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import {
  runViraPrivateObservation,
  type ViraPrivateObservationAdapter,
  type ViraPrivateObservationAuthority,
} from "../../../packages/private-runner/src/observation.js";
import type { ViraPrivateRunnerSecretProvider } from "../../../packages/private-runner/src/index.js";
import type { JsonObject } from "../../../packages/protocol/src/index.js";
import type { ViraPostgresActionVerificationStore } from "../../../integrations/postgres/src/action-verification.js";
import type { ViraPostgresProductionActionLedgerStore } from "../../../integrations/postgres/src/production-action-ledger.js";

export type ViraVerifiedProviderReadbackResult =
  | { readonly ok: true; readonly kind: "verified" | "partial" | "mismatch" | "uncertain"; readonly verificationId: string; readonly revision: number }
  | { readonly ok: false; readonly kind: "not-found" | "invalid-state" | "lease-rejected" | "verification-store-failed" | "ledger-failed"; readonly verificationId: string; readonly code: string };

export interface ViraVerifiedProviderReadbackDependencies {
  readonly verificationId: string;
  readonly expectation: ViraActionVerificationExpectation;
  readonly workerId: string;
  readonly leaseMs: number;
  readonly now: () => number;
  readonly verificationStore: ViraPostgresActionVerificationStore;
  readonly ledgerStore: ViraPostgresProductionActionLedgerStore;
  readonly secretProvider: ViraPrivateRunnerSecretProvider;
  readonly observationAuthority: ViraPrivateObservationAuthority;
  readonly observationAdapter: ViraPrivateObservationAdapter;
}

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const MAX_LEASE_MS = 5 * 60 * 1_000;

function nowEpochMs(now: () => number): number {
  const value = now();
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new TypeError("verified provider readback clock is invalid");
  return value;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function stableId(prefix: string, values: readonly string[]): string {
  return `${prefix}.${createHash("sha256").update(values.join("\u0000")).digest("hex")}`;
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

function exactRecord(record: ViraDurableActionVerificationRecord, expectation: ViraActionVerificationExpectation): boolean {
  return exactScope(record.scope, expectation.scope)
    && record.transactionId === expectation.transactionId
    && record.planDigest === expectation.planDigest
    && record.planRevision === expectation.planRevision
    && record.operationId === expectation.operationId
    && record.executionId === expectation.executionId
    && record.providerId === expectation.providerId
    && record.connectionId === expectation.connectionId
    && record.resourceType === expectation.resourceType
    && record.resourceId === expectation.resourceId;
}

function exactAuthority(record: ViraDurableActionVerificationRecord, authority: ViraPrivateObservationAuthority): boolean {
  return authority.authorityId === record.verificationId
    && exactScope(authority.scope, record.scope)
    && authority.providerId === record.providerId
    && authority.connectionId === record.connectionId;
}

async function appendLedger(input: {
  readonly dependencies: ViraVerifiedProviderReadbackDependencies;
  readonly expectation: ViraActionVerificationExpectation;
  readonly record: ViraDurableActionVerificationRecord;
  readonly kind: Parameters<ViraPostgresProductionActionLedgerStore["append"]>[0]["kind"];
  readonly evidence: JsonObject;
}): Promise<boolean> {
  const result = await input.dependencies.ledgerStore.append({
    stream: {
      version: "1",
      scope: input.expectation.scope,
      ledgerId: ledgerId(input.expectation),
      transactionId: input.expectation.transactionId,
      planDigest: input.expectation.planDigest,
      planRevision: input.expectation.planRevision,
    },
    operationId: input.record.operationId,
    executionId: input.record.executionId,
    attemptId: input.record.attemptId,
    kind: input.kind,
    occurredAtEpochMs: nowEpochMs(input.dependencies.now),
    evidence: input.evidence,
  });
  return result.ok;
}

export async function runViraVerifiedProviderReadback(
  dependencies: ViraVerifiedProviderReadbackDependencies,
): Promise<ViraVerifiedProviderReadbackResult> {
  if (
    dependencies === null
    || typeof dependencies !== "object"
    || !SAFE_TOKEN.test(dependencies.verificationId)
    || !SAFE_TOKEN.test(dependencies.workerId)
    || !Number.isSafeInteger(dependencies.leaseMs)
    || dependencies.leaseMs <= 0
    || dependencies.leaseMs > MAX_LEASE_MS
    || typeof dependencies.now !== "function"
  ) throw new TypeError("verified provider readback dependencies are invalid");

  const canonicalExpectation = createViraActionVerificationExpectation(dependencies.expectation);
  if (!canonicalExpectation.ok) throw new TypeError("verified provider readback expectation is invalid");
  const expectation = canonicalExpectation.value;
  let record = await dependencies.verificationStore.read(expectation.scope, dependencies.verificationId);
  if (record === undefined) {
    return { ok: false, kind: "not-found", verificationId: dependencies.verificationId, code: "VERIFICATION_NOT_FOUND" };
  }
  if (!exactRecord(record, expectation) || !exactAuthority(record, dependencies.observationAuthority)) {
    throw new TypeError("verified provider readback authority does not bind the exact verification record");
  }
  if (record.status === "verified" || record.status === "partial" || record.status === "mismatch" || record.status === "uncertain") {
    return { ok: true, kind: record.status, verificationId: record.verificationId, revision: record.revision };
  }
  if (record.status !== "verifying") {
    return { ok: false, kind: "invalid-state", verificationId: record.verificationId, code: `INVALID_STATUS_${record.status}` };
  }

  const localNow = nowEpochMs(dependencies.now);
  if (record.lease !== null) {
    if (record.lease.expiresAtEpochMs <= localNow) {
      const recovered = await dependencies.verificationStore.recoverExpired({
        scope: expectation.scope,
        verificationId: record.verificationId,
        expectedRevision: record.revision,
      });
      if (!recovered.ok) return { ok: false, kind: "lease-rejected", verificationId: record.verificationId, code: recovered.code };
      record = recovered.value;
    } else if (record.lease.workerId !== dependencies.workerId) {
      return { ok: false, kind: "lease-rejected", verificationId: record.verificationId, code: "LEASE_HELD_BY_OTHER_WORKER" };
    }
  }
  if (record.lease === null) {
    const claimed = await dependencies.verificationStore.claimReadback({
      scope: expectation.scope,
      verificationId: record.verificationId,
      workerId: dependencies.workerId,
      expectedRevision: record.revision,
      leaseMs: dependencies.leaseMs,
    });
    if (!claimed.ok) return { ok: false, kind: "lease-rejected", verificationId: record.verificationId, code: claimed.code };
    record = claimed.value;
  }
  if (record.lease === null || record.lease.workerId !== dependencies.workerId) {
    return { ok: false, kind: "lease-rejected", verificationId: record.verificationId, code: "READBACK_LEASE_NOT_OWNED" };
  }

  const privateAfter = await runViraPrivateObservation({
    authority: dependencies.observationAuthority,
    nowEpochMs: nowEpochMs(dependencies.now),
    secretProvider: dependencies.secretProvider,
    adapter: dependencies.observationAdapter,
  });
  if (!privateAfter.ok) {
    const completed = await dependencies.verificationStore.completePostcondition({
      scope: expectation.scope,
      verificationId: record.verificationId,
      workerId: dependencies.workerId,
      leaseEpoch: record.leaseEpoch,
      expectedRevision: record.revision,
      status: "uncertain",
    });
    if (!completed.ok) return { ok: false, kind: "verification-store-failed", verificationId: record.verificationId, code: completed.code };
    await appendLedger({
      dependencies,
      expectation,
      record: completed.value,
      kind: "provider.effect.uncertain",
      evidence: { code: privateAfter.issue.code },
    });
    return { ok: true, kind: "uncertain", verificationId: record.verificationId, revision: completed.value.revision };
  }

  const parsed = createViraActionProviderObservation(privateAfter.value.data.observation);
  if (!parsed.ok) {
    const completed = await dependencies.verificationStore.completePostcondition({
      scope: expectation.scope,
      verificationId: record.verificationId,
      workerId: dependencies.workerId,
      leaseEpoch: record.leaseEpoch,
      expectedRevision: record.revision,
      status: "uncertain",
    });
    if (!completed.ok) return { ok: false, kind: "verification-store-failed", verificationId: record.verificationId, code: completed.code };
    return { ok: true, kind: "uncertain", verificationId: record.verificationId, revision: completed.value.revision };
  }

  const decision = evaluateViraActionPostcondition({ expectation, observation: parsed.value });
  if (!decision.ok) throw new TypeError("verified provider readback observation identity is invalid");
  const completed = await dependencies.verificationStore.completePostcondition({
    scope: expectation.scope,
    verificationId: record.verificationId,
    workerId: dependencies.workerId,
    leaseEpoch: record.leaseEpoch,
    expectedRevision: record.revision,
    status: decision.value.status,
    ...(decision.value.status === "uncertain" ? {} : { observation: parsed.value }),
  });
  if (!completed.ok) return { ok: false, kind: "verification-store-failed", verificationId: record.verificationId, code: completed.code };

  const observed = await appendLedger({
    dependencies,
    expectation,
    record: completed.value,
    kind: "provider.postcondition.observed",
    evidence: {
      canonicalDigest: parsed.value.canonicalDigest,
      providerVersion: {
        kind: parsed.value.providerVersion.kind,
        value: parsed.value.providerVersion.value,
      },
    },
  });
  if (!observed) return { ok: false, kind: "ledger-failed", verificationId: record.verificationId, code: "POSTCONDITION_LEDGER_FAILED" };
  const effectKind = decision.value.status === "verified"
    ? "provider.effect.verified"
    : decision.value.status === "partial"
      ? "provider.effect.partial"
      : decision.value.status === "mismatch"
        ? "provider.effect.mismatch"
        : "provider.effect.uncertain";
  const truth = await appendLedger({
    dependencies,
    expectation,
    record: completed.value,
    kind: effectKind,
    evidence: {
      status: decision.value.status,
      matchedAssertions: decision.value.matchedAssertions,
      totalAssertions: decision.value.totalAssertions,
    },
  });
  if (!truth) return { ok: false, kind: "ledger-failed", verificationId: record.verificationId, code: "TRUTH_LEDGER_FAILED" };
  return { ok: true, kind: decision.value.status, verificationId: record.verificationId, revision: completed.value.revision };
}
