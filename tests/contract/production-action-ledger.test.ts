import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createViraProductionActionLedgerEntry,
  issueViraProductionActionLedgerCheckpoint,
  verifyViraProductionActionLedgerChain,
  verifyViraProductionActionLedgerCheckpoint,
  type ViraProductionActionLedgerCheckpointSigner,
  type ViraProductionActionLedgerCheckpointVerifier,
  type ViraProductionActionLedgerDigestProvider,
  type ViraProductionActionLedgerEntry,
  type ViraProductionActionLedgerStream,
} from "../../packages/action-ledger/src/production.js";
import type { JsonObject } from "../../packages/protocol/src/index.js";
import { NOW, scope } from "./prod11-transaction-fixture.js";

const digestProvider: ViraProductionActionLedgerDigestProvider = Object.freeze({
  sha256(canonicalJson: string) {
    return createHash("sha256").update(canonicalJson).digest("hex");
  },
});

const stream: ViraProductionActionLedgerStream = Object.freeze({
  version: "1",
  scope,
  ledgerId: "ledger.transaction.demo.publish",
  transactionId: "transaction.demo.publish",
  planDigest: "a".repeat(64),
  planRevision: 7,
});

function signature(payload: string): string {
  return createHash("sha256").update(`prod13-checkpoint\u0000${payload}`).digest("base64url");
}

const signer: ViraProductionActionLedgerCheckpointSigner = Object.freeze({
  sign(input: Parameters<ViraProductionActionLedgerCheckpointSigner["sign"]>[0]) {
    return { keyId: "kms.prod13.ledger", signature: signature(input.payload) };
  },
});

const verifier: ViraProductionActionLedgerCheckpointVerifier = Object.freeze({
  verify(input: Parameters<ViraProductionActionLedgerCheckpointVerifier["verify"]>[0]) {
    return input.keyId === "kms.prod13.ledger" && input.signature === signature(input.payload);
  },
});

async function genesis(evidence: JsonObject = { status: "queued" }) {
  return createViraProductionActionLedgerEntry({
    stream,
    previousEntry: null,
    operationId: "publish.document",
    executionId: "execution.prod13.ledger",
    kind: "transaction.execution.queued",
    occurredAtEpochMs: NOW + 1,
    evidence,
    digestProvider,
  });
}

async function second(previousEntry: ViraProductionActionLedgerEntry) {
  return createViraProductionActionLedgerEntry({
    stream,
    previousEntry,
    operationId: "publish.document",
    executionId: "execution.prod13.ledger",
    attemptId: "attempt.prod13.001",
    executionRevision: 5,
    leaseEpoch: 1,
    kind: "provider.precondition.observed",
    occurredAtEpochMs: NOW + 2,
    evidence: {
      providerVersion: { kind: "blob-sha", value: "b".repeat(40) },
      canonicalDigest: "c".repeat(64),
    },
    digestProvider,
  });
}

describe("PROD-13 production Action Ledger integrity", () => {
  it("creates a deterministic append-only hash chain and verifies the exact history", async () => {
    const first = await genesis();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const next = await second(first.value);
    expect(next.ok).toBe(true);
    if (!next.ok) return;

    expect(first.value.sequence).toBe(0);
    expect(first.value.previousEntryHash).toBeNull();
    expect(next.value.sequence).toBe(1);
    expect(next.value.previousEntryHash).toBe(first.value.entryHash);

    expect(await verifyViraProductionActionLedgerChain({
      entries: [first.value, next.value],
      digestProvider,
    })).toEqual({
      ok: true,
      value: {
        entriesVerified: 2,
        chainHeadHash: next.value.entryHash,
      },
    });
  });

  it("canonicalizes evidence object-key order for digest stability", async () => {
    const left = await genesis({ alpha: 1, nested: { b: 2, a: 1 } });
    const right = await genesis({ nested: { a: 1, b: 2 }, alpha: 1 });
    expect(left.ok && right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect(left.value.evidenceDigest).toBe(right.value.evidenceDigest);
    expect(left.value.entryHash).toBe(right.value.entryHash);
  });

  it("snapshots mutable evidence and rejects secret-bearing evidence", async () => {
    const evidence = { result: { status: "observed" } };
    const entry = await genesis(evidence);
    expect(entry.ok).toBe(true);
    if (!entry.ok) return;
    evidence.result.status = "attacker";
    expect(entry.value.evidence).toEqual({ result: { status: "observed" } });
    expect(Object.isFrozen(entry.value.evidence)).toBe(true);

    expect(await genesis({ authorization: "Bearer must-not-enter-ledger" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_EVIDENCE" },
    });
  });

  it("rejects a previous entry from another tenant or transaction stream", async () => {
    const first = await genesis();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const foreign: ViraProductionActionLedgerEntry = Object.freeze({
      ...first.value,
      scope: Object.freeze({ ...scope, projectId: "project-other" }),
    });

    expect(await createViraProductionActionLedgerEntry({
      stream,
      previousEntry: foreign,
      operationId: "publish.document",
      executionId: "execution.prod13.ledger",
      kind: "provider.dispatch.started",
      occurredAtEpochMs: NOW + 2,
      evidence: { attemptId: "attempt.prod13.001" },
      digestProvider,
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PREVIOUS_ENTRY" },
    });
  });

  it("detects historical evidence mutation, broken previous hash and sequence insertion", async () => {
    const first = await genesis();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const next = await second(first.value);
    expect(next.ok).toBe(true);
    if (!next.ok) return;

    const tamperedEvidence: ViraProductionActionLedgerEntry = {
      ...next.value,
      evidence: { canonicalDigest: "d".repeat(64) },
    };
    expect(await verifyViraProductionActionLedgerChain({
      entries: [first.value, tamperedEvidence],
      digestProvider,
    })).toMatchObject({ ok: false, issue: { code: "CHAIN_BROKEN" } });

    const brokenPrevious: ViraProductionActionLedgerEntry = {
      ...next.value,
      previousEntryHash: "e".repeat(64),
    };
    expect(await verifyViraProductionActionLedgerChain({
      entries: [first.value, brokenPrevious],
      digestProvider,
    })).toMatchObject({ ok: false, issue: { code: "CHAIN_BROKEN" } });

    const inserted: ViraProductionActionLedgerEntry = {
      ...next.value,
      sequence: 2,
    };
    expect(await verifyViraProductionActionLedgerChain({
      entries: [first.value, inserted],
      digestProvider,
    })).toMatchObject({ ok: false, issue: { code: "CHAIN_BROKEN" } });
  });

  it("issues a signed checkpoint bound to the exact chain head and rejects forged or retargeted evidence", async () => {
    const first = await genesis();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const next = await second(first.value);
    expect(next.ok).toBe(true);
    if (!next.ok) return;

    const checkpoint = await issueViraProductionActionLedgerCheckpoint({
      head: next.value,
      issuedAtEpochMs: NOW + 3,
      signer,
    });
    expect(checkpoint.ok).toBe(true);
    if (!checkpoint.ok) return;

    expect(await verifyViraProductionActionLedgerCheckpoint({
      checkpoint: checkpoint.value,
      expectedHead: next.value,
      verifier,
    })).toEqual({ ok: true, value: true });

    expect(await verifyViraProductionActionLedgerCheckpoint({
      checkpoint: { ...checkpoint.value, signature: `${checkpoint.value.signature}x` },
      expectedHead: next.value,
      verifier,
    })).toMatchObject({ ok: false, issue: { code: "CHECKPOINT_REJECTED" } });

    expect(await verifyViraProductionActionLedgerCheckpoint({
      checkpoint: checkpoint.value,
      expectedHead: first.value,
      verifier,
    })).toMatchObject({ ok: false, issue: { code: "CHECKPOINT_REJECTED" } });
  });
});
