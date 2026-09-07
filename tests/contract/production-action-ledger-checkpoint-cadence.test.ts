import { describe, expect, it } from "vitest";
import {
  evaluateViraProductionActionLedgerCheckpointCadence,
  issueViraProductionActionLedgerCheckpointIfDue,
} from "../../packages/action-ledger/src/checkpoint-cadence.js";
import type {
  ViraProductionActionLedgerCheckpoint,
  ViraProductionActionLedgerEntry,
} from "../../packages/action-ledger/src/production.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

function head(sequence: number, occurredAtEpochMs = NOW): ViraProductionActionLedgerEntry {
  return Object.freeze({
    version: "1",
    scope,
    ledgerId: "ledger.prod13.checkpoint",
    sequence,
    transactionId: "transaction.prod13.checkpoint",
    planDigest: "a".repeat(64),
    planRevision: 7,
    operationId: "github.repository.file.update",
    executionId: "execution.prod13.checkpoint",
    attemptId: "attempt.prod13.checkpoint",
    kind: "provider.effect.verified",
    occurredAtEpochMs,
    evidenceDigest: "b".repeat(64),
    evidence: Object.freeze({ status: "verified" }),
    previousEntryHash: sequence === 0 ? null : "c".repeat(64),
    entryHash: "d".repeat(64),
  });
}

function checkpoint(input: {
  sequence: number;
  issuedAtEpochMs: number;
  chainHeadHash?: string;
}): ViraProductionActionLedgerCheckpoint {
  return Object.freeze({
    version: "1",
    audience: "vira.action-ledger.checkpoint",
    scope,
    ledgerId: "ledger.prod13.checkpoint",
    transactionId: "transaction.prod13.checkpoint",
    planDigest: "a".repeat(64),
    planRevision: 7,
    sequence: input.sequence,
    chainHeadHash: input.chainHeadHash ?? "c".repeat(64),
    issuedAtEpochMs: input.issuedAtEpochMs,
    keyId: "kms.prod13.checkpoint",
    signature: "sig-prod13-checkpoint",
  });
}

const policy = Object.freeze({ maxEntriesWithoutCheckpoint: 4, maxAgeMs: 60_000 });

describe("PROD-13 production Action Ledger checkpoint cadence", () => {
  it("does not checkpoint before either explicit cadence threshold", () => {
    expect(evaluateViraProductionActionLedgerCheckpointCadence({
      head: head(1, NOW + 10_000),
      previousCheckpoint: null,
      firstEntryOccurredAtEpochMs: NOW,
      nowEpochMs: NOW + 20_000,
      policy,
    })).toEqual({ required: false, reason: "none", entriesSinceCheckpoint: 2, ageMs: 20_000 });
  });

  it("requires a checkpoint when the entry-count cadence is reached", () => {
    expect(evaluateViraProductionActionLedgerCheckpointCadence({
      head: head(3, NOW + 10_000),
      previousCheckpoint: null,
      firstEntryOccurredAtEpochMs: NOW,
      nowEpochMs: NOW + 20_000,
      policy,
    })).toEqual({ required: true, reason: "entry-count", entriesSinceCheckpoint: 4, ageMs: 20_000 });
  });

  it("requires a checkpoint when the age cadence is reached", () => {
    expect(evaluateViraProductionActionLedgerCheckpointCadence({
      head: head(2, NOW + 60_000),
      previousCheckpoint: checkpoint({ sequence: 1, issuedAtEpochMs: NOW + 10_000 }),
      firstEntryOccurredAtEpochMs: NOW,
      nowEpochMs: NOW + 70_000,
      policy,
    })).toEqual({ required: true, reason: "age", entriesSinceCheckpoint: 1, ageMs: 60_000 });
  });

  it("rejects a checkpoint from another stream or ahead of the current head", () => {
    expect(() => evaluateViraProductionActionLedgerCheckpointCadence({
      head: head(3),
      previousCheckpoint: { ...checkpoint({ sequence: 2, issuedAtEpochMs: NOW - 1 }), ledgerId: "ledger.attacker" },
      firstEntryOccurredAtEpochMs: NOW - 100,
      nowEpochMs: NOW + 100,
      policy,
    })).toThrow(TypeError);

    expect(() => evaluateViraProductionActionLedgerCheckpointCadence({
      head: head(3),
      previousCheckpoint: checkpoint({ sequence: 4, issuedAtEpochMs: NOW - 1 }),
      firstEntryOccurredAtEpochMs: NOW - 100,
      nowEpochMs: NOW + 100,
      policy,
    })).toThrow(TypeError);
  });

  it("requires an exact chain-head hash when the previous checkpoint already covers the current head", () => {
    expect(() => evaluateViraProductionActionLedgerCheckpointCadence({
      head: head(3),
      previousCheckpoint: checkpoint({ sequence: 3, issuedAtEpochMs: NOW - 1, chainHeadHash: "e".repeat(64) }),
      firstEntryOccurredAtEpochMs: NOW - 100,
      nowEpochMs: NOW + 100,
      policy,
    })).toThrow(TypeError);
  });

  it("signs the exact current head only when cadence is due", async () => {
    let signCalls = 0;
    const signer = {
      sign() {
        signCalls += 1;
        return { keyId: "kms.prod13.checkpoint", signature: "signed-prod13-checkpoint" };
      },
    };

    const notDue = await issueViraProductionActionLedgerCheckpointIfDue({
      head: head(0, NOW),
      previousCheckpoint: null,
      firstEntryOccurredAtEpochMs: NOW,
      nowEpochMs: NOW + 1_000,
      policy,
      signer,
    });
    expect(notDue).toEqual({ ok: true, value: null });
    expect(signCalls).toBe(0);

    const dueHead = head(3, NOW + 10_000);
    const due = await issueViraProductionActionLedgerCheckpointIfDue({
      head: dueHead,
      previousCheckpoint: null,
      firstEntryOccurredAtEpochMs: NOW,
      nowEpochMs: NOW + 20_000,
      policy,
      signer,
    });
    expect(due).toMatchObject({
      ok: true,
      value: {
        sequence: dueHead.sequence,
        chainHeadHash: dueHead.entryHash,
        keyId: "kms.prod13.checkpoint",
      },
    });
    expect(signCalls).toBe(1);
  });
});
