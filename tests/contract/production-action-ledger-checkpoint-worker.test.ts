import { describe, expect, it } from "vitest";
import type { ViraProductionActionLedgerCheckpoint, ViraProductionActionLedgerEntry } from "../../packages/action-ledger/src/production.js";
import type { ViraPostgresProductionActionLedgerCheckpointRepository } from "../../integrations/postgres/src/production-action-ledger-checkpoint.js";
import type { ViraPostgresProductionActionLedgerStore } from "../../integrations/postgres/src/production-action-ledger.js";
import { runViraActionLedgerCheckpointCadence } from "../../apps/vira-worker/src/action-ledger-checkpoint.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

function entry(sequence: number, occurredAtEpochMs: number): ViraProductionActionLedgerEntry {
  return {
    version: "1",
    scope,
    ledgerId: "ledger.prod13.cadence.worker",
    sequence,
    transactionId: "transaction.prod13.cadence.worker",
    planDigest: "a".repeat(64),
    planRevision: 7,
    operationId: "github.repository.file.update",
    executionId: "execution.prod13.cadence.worker",
    attemptId: "attempt.prod13.cadence.worker",
    kind: "provider.effect.verified",
    occurredAtEpochMs,
    evidenceDigest: "b".repeat(64),
    evidence: { status: "verified" },
    previousEntryHash: sequence === 0 ? null : "c".repeat(64),
    entryHash: "d".repeat(64),
  };
}

function checkpoint(sequence: number, issuedAtEpochMs: number): ViraProductionActionLedgerCheckpoint {
  return {
    version: "1",
    audience: "vira.action-ledger.checkpoint",
    scope,
    ledgerId: "ledger.prod13.cadence.worker",
    transactionId: "transaction.prod13.cadence.worker",
    planDigest: "a".repeat(64),
    planRevision: 7,
    sequence,
    chainHeadHash: "c".repeat(64),
    issuedAtEpochMs,
    keyId: "kms.prod13.cadence.worker",
    signature: "signature-prod13-cadence-worker",
  };
}

const policy = { maxEntriesWithoutCheckpoint: 3, maxAgeMs: 60_000 } as const;

describe("PROD-13 Action Ledger checkpoint worker", () => {
  it("does nothing for an empty ledger", async () => {
    let signerCalls = 0;
    const result = await runViraActionLedgerCheckpointCadence({
      scope,
      ledgerId: "ledger.prod13.cadence.worker",
      policy,
      now: () => NOW + 10,
      ledgerStore: {
        async readEntries() { return []; },
        async appendCheckpoint() { throw new Error("append must not run"); },
      },
      checkpointRepository: { async readLatest() { throw new Error("checkpoint read must not run"); } },
      signer: { sign() { signerCalls += 1; throw new Error("sign must not run"); } },
    });
    expect(result).toEqual({ ok: true, kind: "empty", ledgerId: "ledger.prod13.cadence.worker" });
    expect(signerCalls).toBe(0);
  });

  it("does not sign or persist before cadence is due", async () => {
    let signerCalls = 0;
    let appendCalls = 0;
    const entries = [entry(0, NOW), entry(1, NOW + 1_000)];
    const result = await runViraActionLedgerCheckpointCadence({
      scope,
      ledgerId: entries[0]!.ledgerId,
      policy,
      now: () => NOW + 10_000,
      ledgerStore: {
        async readEntries() { return entries; },
        async appendCheckpoint() { appendCalls += 1; throw new Error("append must not run"); },
      },
      checkpointRepository: { async readLatest() { return undefined; } },
      signer: { sign() { signerCalls += 1; throw new Error("sign must not run"); } },
    });
    expect(result).toEqual({ ok: true, kind: "not-due", ledgerId: entries[0]!.ledgerId });
    expect(signerCalls).toBe(0);
    expect(appendCalls).toBe(0);
  });

  it("signs and persists the exact current chain head when due", async () => {
    const entries = [entry(0, NOW), entry(1, NOW + 1_000), entry(2, NOW + 2_000)];
    let persisted: ViraProductionActionLedgerCheckpoint | undefined;
    const ledgerStore: Pick<ViraPostgresProductionActionLedgerStore, "readEntries" | "appendCheckpoint"> = {
      async readEntries() { return entries; },
      async appendCheckpoint(input) { persisted = input; return { ok: true, value: input }; },
    };
    const checkpointRepository: ViraPostgresProductionActionLedgerCheckpointRepository = {
      async readLatest() { return undefined; },
    };
    const result = await runViraActionLedgerCheckpointCadence({
      scope,
      ledgerId: entries[0]!.ledgerId,
      policy,
      now: () => NOW + 10_000,
      ledgerStore,
      checkpointRepository,
      signer: { sign() { return { keyId: "kms.prod13.cadence.worker", signature: "signature-prod13-cadence-worker" }; } },
    });
    expect(result).toMatchObject({ ok: true, kind: "issued", sequence: 2, chainHeadHash: entries[2]!.entryHash });
    expect(persisted).toMatchObject({ sequence: 2, chainHeadHash: entries[2]!.entryHash });
  });

  it("uses the latest persisted checkpoint to avoid duplicate cadence issuance", async () => {
    const entries = [entry(0, NOW), entry(1, NOW + 1_000), entry(2, NOW + 2_000)];
    let signerCalls = 0;
    const prior = { ...checkpoint(2, NOW + 5_000), chainHeadHash: entries[2]!.entryHash };
    const result = await runViraActionLedgerCheckpointCadence({
      scope,
      ledgerId: entries[0]!.ledgerId,
      policy,
      now: () => NOW + 10_000,
      ledgerStore: {
        async readEntries() { return entries; },
        async appendCheckpoint() { throw new Error("append must not run"); },
      },
      checkpointRepository: { async readLatest() { return prior; } },
      signer: { sign() { signerCalls += 1; throw new Error("sign must not run"); } },
    });
    expect(result).toEqual({ ok: true, kind: "not-due", ledgerId: entries[0]!.ledgerId });
    expect(signerCalls).toBe(0);
  });

  it("fails closed when checkpoint persistence conflicts", async () => {
    const entries = [entry(0, NOW), entry(1, NOW + 1_000), entry(2, NOW + 2_000)];
    const result = await runViraActionLedgerCheckpointCadence({
      scope,
      ledgerId: entries[0]!.ledgerId,
      policy,
      now: () => NOW + 10_000,
      ledgerStore: {
        async readEntries() { return entries; },
        async appendCheckpoint() { return { ok: false, code: "CHECKPOINT_CONFLICT" }; },
      },
      checkpointRepository: { async readLatest() { return undefined; } },
      signer: { sign() { return { keyId: "kms.prod13.cadence.worker", signature: "signature-prod13-cadence-worker" }; } },
    });
    expect(result).toEqual({
      ok: false,
      kind: "checkpoint-store-failed",
      ledgerId: entries[0]!.ledgerId,
      code: "CHECKPOINT_CONFLICT",
    });
  });
});
