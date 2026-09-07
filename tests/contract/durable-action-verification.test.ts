import { describe, expect, it } from "vitest";
import { createViraActionProviderObservation } from "../../packages/action-verification/src/index.js";
import {
  claimViraVerificationReadback,
  claimViraVerificationWrite,
  completeViraPostconditionVerification,
  createViraDurableActionVerificationRecord,
  isViraDurableActionVerificationRecord,
  markViraVerificationWriteDispatched,
  recordViraVerificationPrecheck,
  recoverViraVerificationAfterLeaseExpiry,
} from "../../packages/action-verification/src/durable.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

const BEFORE_DIGEST = "a".repeat(64);
const AFTER_DIGEST = "b".repeat(64);

function beforeObservation() {
  const result = createViraActionProviderObservation({
    version: "1",
    scope,
    providerId: "github",
    connectionId: "github.connection",
    resourceType: "github.repository.file",
    resourceId: "demo/repo:docs/readme.md@main",
    observedAtEpochMs: NOW + 1,
    providerVersion: { kind: "blob-sha", value: "c".repeat(40) },
    canonicalDigest: BEFORE_DIGEST,
    data: { summary: "before" },
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function afterObservation() {
  const result = createViraActionProviderObservation({
    version: "1",
    scope,
    providerId: "github",
    connectionId: "github.connection",
    resourceType: "github.repository.file",
    resourceId: "demo/repo:docs/readme.md@main",
    observedAtEpochMs: NOW + 20_000,
    providerVersion: { kind: "blob-sha", value: "d".repeat(40) },
    canonicalDigest: AFTER_DIGEST,
    data: { summary: "after" },
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function baseRecord() {
  const created = createViraDurableActionVerificationRecord({
    scope,
    verificationId: "verification.prod13.001",
    transactionId: "transaction.demo.publish",
    planDigest: "e".repeat(64),
    planRevision: 7,
    operationId: "publish.document",
    executionId: "execution.prod13.001",
    attemptId: "attempt.prod13.001",
    providerId: "github",
    connectionId: "github.connection",
    resourceType: "github.repository.file",
    resourceId: "demo/repo:docs/readme.md@main",
    createdAtEpochMs: NOW,
  });
  if (!created.ok) throw new Error(created.issue.message);
  return created.value;
}

function readyRecord() {
  const ready = recordViraVerificationPrecheck({
    record: baseRecord(),
    observation: beforeObservation(),
    precondition: "match",
    nowEpochMs: NOW + 2,
  });
  if (!ready.ok) throw new Error(ready.issue.message);
  return ready.value;
}

describe("PROD-13 durable action verification", () => {
  it("treats lease-free ready-to-write and recovered verifying states as canonical", () => {
    const ready = readyRecord();
    expect(ready.status).toBe("ready-to-write");
    expect(ready.lease).toBeNull();
    expect(isViraDurableActionVerificationRecord(ready)).toBe(true);

    const claimed = claimViraVerificationWrite({
      record: ready,
      workerId: "worker.a",
      expectedRevision: ready.revision,
      nowEpochMs: NOW + 3,
      leaseMs: 1_000,
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;

    const dispatched = markViraVerificationWriteDispatched({
      record: claimed.value,
      workerId: "worker.a",
      leaseEpoch: claimed.value.leaseEpoch,
      expectedRevision: claimed.value.revision,
      nowEpochMs: NOW + 4,
    });
    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) return;

    const recovered = recoverViraVerificationAfterLeaseExpiry({
      record: dispatched.value,
      expectedRevision: dispatched.value.revision,
      nowEpochMs: NOW + 2_000,
    });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    expect(recovered.value).toMatchObject({ status: "verifying", lease: null });
    expect(isViraDurableActionVerificationRecord(recovered.value)).toBe(true);
  });

  it("never returns a post-dispatch recovery to the write claim path", () => {
    const first = claimViraVerificationWrite({
      record: readyRecord(),
      workerId: "worker.a",
      expectedRevision: 2,
      nowEpochMs: NOW + 3,
      leaseMs: 1_000,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const dispatched = markViraVerificationWriteDispatched({
      record: first.value,
      workerId: "worker.a",
      leaseEpoch: first.value.leaseEpoch,
      expectedRevision: first.value.revision,
      nowEpochMs: NOW + 4,
    });
    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) return;

    const recovered = recoverViraVerificationAfterLeaseExpiry({
      record: dispatched.value,
      expectedRevision: dispatched.value.revision,
      nowEpochMs: NOW + 2_000,
    });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;

    expect(claimViraVerificationWrite({
      record: recovered.value,
      workerId: "worker.b",
      expectedRevision: recovered.value.revision,
      nowEpochMs: NOW + 2_001,
      leaseMs: 1_000,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_STATE" } });

    const readback = claimViraVerificationReadback({
      record: recovered.value,
      workerId: "worker.b",
      expectedRevision: recovered.value.revision,
      nowEpochMs: NOW + 2_001,
      leaseMs: 1_000,
    });
    expect(readback.ok).toBe(true);
    if (!readback.ok) return;
    expect(readback.value.leaseEpoch).toBe(2);

    const completed = completeViraPostconditionVerification({
      record: readback.value,
      workerId: "worker.b",
      leaseEpoch: readback.value.leaseEpoch,
      expectedRevision: readback.value.revision,
      nowEpochMs: NOW + 2_002,
      observation: afterObservation(),
      status: "verified",
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    expect(completed.value).toMatchObject({
      status: "verified",
      lease: null,
      afterObservationDigest: AFTER_DIGEST,
    });
  });

  it("allows a pre-dispatch expired lease to recover to a higher-epoch write claim", () => {
    const first = claimViraVerificationWrite({
      record: readyRecord(),
      workerId: "worker.a",
      expectedRevision: 2,
      nowEpochMs: NOW + 3,
      leaseMs: 1_000,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const recovered = recoverViraVerificationAfterLeaseExpiry({
      record: first.value,
      expectedRevision: first.value.revision,
      nowEpochMs: NOW + 2_000,
    });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    expect(recovered.value).toMatchObject({ status: "ready-to-write", lease: null });

    const second = claimViraVerificationWrite({
      record: recovered.value,
      workerId: "worker.b",
      expectedRevision: recovered.value.revision,
      nowEpochMs: NOW + 2_001,
      leaseMs: 1_000,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.leaseEpoch).toBe(2);
  });

  it("rejects readback claims while an existing verification lease is still attached", () => {
    const first = claimViraVerificationWrite({
      record: readyRecord(),
      workerId: "worker.a",
      expectedRevision: 2,
      nowEpochMs: NOW + 3,
      leaseMs: 5_000,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const dispatched = markViraVerificationWriteDispatched({
      record: first.value,
      workerId: "worker.a",
      leaseEpoch: first.value.leaseEpoch,
      expectedRevision: first.value.revision,
      nowEpochMs: NOW + 4,
    });
    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) return;

    const verifying = {
      ...dispatched.value,
      revision: dispatched.value.revision + 1,
      status: "verifying" as const,
      updatedAtEpochMs: NOW + 5,
    };
    expect(isViraDurableActionVerificationRecord(verifying)).toBe(true);
    expect(claimViraVerificationReadback({
      record: verifying,
      workerId: "worker.b",
      expectedRevision: verifying.revision,
      nowEpochMs: NOW + 6,
      leaseMs: 1_000,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_STATE" } });
  });
});