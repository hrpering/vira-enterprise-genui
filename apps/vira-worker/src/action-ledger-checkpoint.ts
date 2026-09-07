import {
  issueViraProductionActionLedgerCheckpointIfDue,
  type ViraProductionActionLedgerCheckpointPolicy,
} from "../../../packages/action-ledger/src/checkpoint-cadence.js";
import type {
  ViraProductionActionLedgerCheckpointSigner,
} from "../../../packages/action-ledger/src/production.js";
import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import type {
  ViraPostgresProductionActionLedgerCheckpointRepository,
} from "../../../integrations/postgres/src/production-action-ledger-checkpoint.js";
import type {
  ViraPostgresProductionActionLedgerStore,
} from "../../../integrations/postgres/src/production-action-ledger.js";

export type ViraActionLedgerCheckpointRunResult =
  | { readonly ok: true; readonly kind: "empty" | "not-due"; readonly ledgerId: string }
  | { readonly ok: true; readonly kind: "issued"; readonly ledgerId: string; readonly sequence: number; readonly chainHeadHash: string }
  | { readonly ok: false; readonly kind: "checkpoint-store-failed"; readonly ledgerId: string; readonly code: string };

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;

function nowEpochMs(now: () => number): number {
  const value = now();
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("production Action Ledger checkpoint worker clock is invalid");
  }
  return value;
}

export async function runViraActionLedgerCheckpointCadence(input: {
  readonly scope: ViraEnterpriseScope;
  readonly ledgerId: string;
  readonly policy: ViraProductionActionLedgerCheckpointPolicy;
  readonly now: () => number;
  readonly ledgerStore: Pick<ViraPostgresProductionActionLedgerStore, "readEntries" | "appendCheckpoint">;
  readonly checkpointRepository: ViraPostgresProductionActionLedgerCheckpointRepository;
  readonly signer: ViraProductionActionLedgerCheckpointSigner;
}): Promise<ViraActionLedgerCheckpointRunResult> {
  if (
    input === null
    || typeof input !== "object"
    || !SAFE_TOKEN.test(input.ledgerId)
    || typeof input.now !== "function"
    || input.ledgerStore === null
    || typeof input.ledgerStore !== "object"
    || input.checkpointRepository === null
    || typeof input.checkpointRepository !== "object"
    || input.signer === null
    || typeof input.signer !== "object"
  ) throw new TypeError("production Action Ledger checkpoint worker dependencies are invalid");

  const entries = await input.ledgerStore.readEntries(input.scope, input.ledgerId);
  if (entries.length === 0) return { ok: true, kind: "empty", ledgerId: input.ledgerId };
  const first = entries[0]!;
  const head = entries.at(-1)!;
  if (first.ledgerId !== input.ledgerId || head.ledgerId !== input.ledgerId) {
    throw new TypeError("production Action Ledger checkpoint worker read the wrong stream");
  }
  const previousCheckpoint = await input.checkpointRepository.readLatest(input.scope, input.ledgerId) ?? null;
  const issued = await issueViraProductionActionLedgerCheckpointIfDue({
    head,
    previousCheckpoint,
    firstEntryOccurredAtEpochMs: first.occurredAtEpochMs,
    nowEpochMs: nowEpochMs(input.now),
    policy: input.policy,
    signer: input.signer,
  });
  if (!issued.ok) throw new TypeError(`production Action Ledger checkpoint issuance failed: ${issued.issue.code}`);
  if (issued.value === null) return { ok: true, kind: "not-due", ledgerId: input.ledgerId };

  const persisted = await input.ledgerStore.appendCheckpoint(issued.value);
  if (!persisted.ok) {
    return { ok: false, kind: "checkpoint-store-failed", ledgerId: input.ledgerId, code: persisted.code };
  }
  return {
    ok: true,
    kind: "issued",
    ledgerId: input.ledgerId,
    sequence: persisted.value.sequence,
    chainHeadHash: persisted.value.chainHeadHash,
  };
}
