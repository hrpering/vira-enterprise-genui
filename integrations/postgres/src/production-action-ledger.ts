import {
  createViraProductionActionLedgerEntry,
  type ViraProductionActionLedgerCheckpoint,
  type ViraProductionActionLedgerDigestProvider,
  type ViraProductionActionLedgerEntry,
  type ViraProductionActionLedgerEntryKind,
  type ViraProductionActionLedgerStream,
} from "../../../packages/action-ledger/src/production.js";
import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import { parseJsonValue, type JsonObject, type JsonValue } from "../../../packages/protocol/src/index.js";
import {
  canonicalizeEnterpriseScope,
  withTenantTransaction,
  type PostgresClientLike,
  type PostgresPoolLike,
} from "./transaction.js";

interface StreamRow extends Record<string, unknown> {
  readonly organization_id: unknown;
  readonly project_id: unknown;
  readonly environment: unknown;
  readonly ledger_id: unknown;
  readonly transaction_id: unknown;
  readonly plan_digest: unknown;
  readonly plan_revision: unknown;
  readonly next_sequence: unknown;
  readonly chain_head_hash: unknown;
}

interface EntryRow extends Record<string, unknown> {
  readonly entry: unknown;
}

export type ViraPostgresProductionActionLedgerMutationCode =
  | "STREAM_CONFLICT"
  | "CHAIN_CONFLICT"
  | "CHECKPOINT_CONFLICT";

export type ViraPostgresProductionActionLedgerMutationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: ViraPostgresProductionActionLedgerMutationCode };

export interface ViraPostgresProductionActionLedgerStore {
  readonly append: (input: {
    readonly stream: ViraProductionActionLedgerStream;
    readonly operationId: string;
    readonly executionId: string;
    readonly attemptId?: string;
    readonly executionRevision?: number;
    readonly leaseEpoch?: number;
    readonly kind: ViraProductionActionLedgerEntryKind;
    readonly occurredAtEpochMs: number;
    readonly evidence: JsonObject;
  }) => Promise<ViraPostgresProductionActionLedgerMutationResult<ViraProductionActionLedgerEntry>>;
  readonly readEntries: (
    scope: ViraEnterpriseScope,
    ledgerId: string,
  ) => Promise<readonly ViraProductionActionLedgerEntry[]>;
  readonly appendCheckpoint: (
    checkpoint: ViraProductionActionLedgerCheckpoint,
  ) => Promise<ViraPostgresProductionActionLedgerMutationResult<ViraProductionActionLedgerCheckpoint>>;
}

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const ENTRY_KINDS = new Set([
  "transaction.execution.queued",
  "transaction.execution.claimed",
  "provider.precondition.observed",
  "provider.precondition.mismatch",
  "provider.dispatch.started",
  "provider.dispatch.accepted",
  "provider.dispatch.rejected",
  "provider.dispatch.uncertain",
  "provider.postcondition.observed",
  "provider.effect.verified",
  "provider.effect.partial",
  "provider.effect.mismatch",
  "provider.effect.uncertain",
  "provider.retry.authorized",
  "provider.manual-resolution.requested",
  "provider.manual-resolution.completed",
]);
const REQUIRED_ENTRY_FIELDS = new Set([
  "version", "scope", "ledgerId", "sequence", "transactionId", "planDigest", "planRevision",
  "operationId", "executionId", "kind", "occurredAtEpochMs", "evidenceDigest", "evidence",
  "previousEntryHash", "entryHash",
]);
const OPTIONAL_ENTRY_FIELDS = new Set(["attemptId", "executionRevision", "leaseEpoch"]);

class LedgerConflict extends Error {
  readonly code: ViraPostgresProductionActionLedgerMutationCode;

  constructor(code: ViraPostgresProductionActionLedgerMutationCode) {
    super(code);
    this.name = "LedgerConflict";
    this.code = code;
  }
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function rowInteger(value: unknown, allowZero = false): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && (allowZero ? value >= 0 : value >= 1)) return value;
  if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && (allowZero ? parsed >= 0 : parsed >= 1)) return parsed;
  }
  throw new TypeError("PostgreSQL production Action Ledger integer is invalid");
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function validateStreamRow(row: StreamRow, stream: ViraProductionActionLedgerStream): {
  readonly nextSequence: number;
  readonly chainHeadHash: string | null;
} {
  const scope = canonicalizeEnterpriseScope({
    version: "1",
    organizationId: row.organization_id,
    projectId: row.project_id,
    environment: row.environment,
  });
  const nextSequence = rowInteger(row.next_sequence, true);
  if (
    !exactScope(scope, stream.scope)
    || row.ledger_id !== stream.ledgerId
    || row.transaction_id !== stream.transactionId
    || row.plan_digest !== stream.planDigest
    || rowInteger(row.plan_revision) !== stream.planRevision
    || (row.chain_head_hash !== null && (typeof row.chain_head_hash !== "string" || !SHA256_HEX.test(row.chain_head_hash)))
    || (nextSequence === 0) !== (row.chain_head_hash === null)
  ) throw new LedgerConflict("STREAM_CONFLICT");
  return { nextSequence, chainHeadHash: row.chain_head_hash as string | null };
}

function parseEntry(input: unknown, expectedScope: ViraEnterpriseScope): ViraProductionActionLedgerEntry {
  const parsed = parseJsonValue(input, "$.entry");
  if (!parsed.ok || !isObject(parsed.value)) throw new TypeError("PostgreSQL production Action Ledger entry is not canonical JSON");
  const entry = parsed.value;
  const keys = Object.keys(entry);
  if (
    ![...REQUIRED_ENTRY_FIELDS].every((key) => Object.hasOwn(entry, key))
    || keys.some((key) => !REQUIRED_ENTRY_FIELDS.has(key) && !OPTIONAL_ENTRY_FIELDS.has(key))
    || keys.length < REQUIRED_ENTRY_FIELDS.size
    || !isObject(entry.scope)
  ) throw new TypeError("PostgreSQL production Action Ledger entry shape is invalid");
  const scope = canonicalizeEnterpriseScope(entry.scope);
  if (
    !exactScope(scope, expectedScope)
    || entry.version !== "1"
    || !safeToken(entry.ledgerId)
    || typeof entry.sequence !== "number"
    || !Number.isSafeInteger(entry.sequence)
    || entry.sequence < 0
    || !safeToken(entry.transactionId)
    || typeof entry.planDigest !== "string"
    || !SHA256_HEX.test(entry.planDigest)
    || typeof entry.planRevision !== "number"
    || !Number.isSafeInteger(entry.planRevision)
    || entry.planRevision < 1
    || !safeToken(entry.operationId)
    || !safeToken(entry.executionId)
    || (entry.attemptId !== undefined && !safeToken(entry.attemptId))
    || (entry.executionRevision !== undefined && (typeof entry.executionRevision !== "number" || !Number.isSafeInteger(entry.executionRevision) || entry.executionRevision < 1))
    || (entry.leaseEpoch !== undefined && (typeof entry.leaseEpoch !== "number" || !Number.isSafeInteger(entry.leaseEpoch) || entry.leaseEpoch < 1))
    || typeof entry.kind !== "string"
    || !ENTRY_KINDS.has(entry.kind)
    || typeof entry.occurredAtEpochMs !== "number"
    || !Number.isSafeInteger(entry.occurredAtEpochMs)
    || entry.occurredAtEpochMs < 1
    || typeof entry.evidenceDigest !== "string"
    || !SHA256_HEX.test(entry.evidenceDigest)
    || !isObject(entry.evidence)
    || (entry.previousEntryHash !== null && (typeof entry.previousEntryHash !== "string" || !SHA256_HEX.test(entry.previousEntryHash)))
    || typeof entry.entryHash !== "string"
    || !SHA256_HEX.test(entry.entryHash)
  ) throw new TypeError("PostgreSQL production Action Ledger entry identity is invalid");
  return Object.freeze({ ...entry, scope, evidence: Object.freeze({ ...entry.evidence }) }) as unknown as ViraProductionActionLedgerEntry;
}

async function ensureAndLockStream(
  client: PostgresClientLike,
  stream: ViraProductionActionLedgerStream,
): Promise<{ readonly nextSequence: number; readonly chainHeadHash: string | null }> {
  const scope = canonicalizeEnterpriseScope(stream.scope);
  if (!safeToken(stream.ledgerId) || !safeToken(stream.transactionId) || !SHA256_HEX.test(stream.planDigest) || !Number.isSafeInteger(stream.planRevision) || stream.planRevision < 1) {
    throw new TypeError("PostgreSQL production Action Ledger stream is invalid");
  }
  await client.query(
    `INSERT INTO vira.production_action_ledger_stream (
       organization_id, project_id, environment, ledger_id, transaction_id, plan_digest, plan_revision
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (organization_id, project_id, environment, ledger_id) DO NOTHING`,
    [scope.organizationId, scope.projectId, scope.environment, stream.ledgerId, stream.transactionId, stream.planDigest, stream.planRevision],
  );
  const result = await client.query<StreamRow>(
    `SELECT organization_id, project_id, environment, ledger_id, transaction_id, plan_digest,
      plan_revision, next_sequence, chain_head_hash
     FROM vira.production_action_ledger_stream
     WHERE organization_id=$1 AND project_id=$2 AND environment=$3 AND ledger_id=$4
     FOR UPDATE`,
    [scope.organizationId, scope.projectId, scope.environment, stream.ledgerId],
  );
  if (result.rows.length !== 1) throw new LedgerConflict("STREAM_CONFLICT");
  return validateStreamRow(result.rows[0]!, { ...stream, scope });
}

async function previousEntry(
  client: PostgresClientLike,
  scope: ViraEnterpriseScope,
  ledgerId: string,
  nextSequence: number,
): Promise<ViraProductionActionLedgerEntry | null> {
  if (nextSequence === 0) return null;
  const result = await client.query<EntryRow>(
    `SELECT entry
     FROM vira.production_action_ledger_entry
     WHERE organization_id=$1 AND project_id=$2 AND environment=$3 AND ledger_id=$4 AND sequence=$5`,
    [scope.organizationId, scope.projectId, scope.environment, ledgerId, nextSequence - 1],
  );
  if (result.rows.length !== 1) throw new LedgerConflict("CHAIN_CONFLICT");
  const entry = parseEntry(result.rows[0]!.entry, scope);
  if (entry.sequence !== nextSequence - 1 || entry.ledgerId !== ledgerId) throw new LedgerConflict("CHAIN_CONFLICT");
  return entry;
}

export function createPostgresProductionActionLedgerStore(
  pool: PostgresPoolLike,
  digestProvider: ViraProductionActionLedgerDigestProvider,
): ViraPostgresProductionActionLedgerStore {
  return Object.freeze({
    async append(
      input: Parameters<ViraPostgresProductionActionLedgerStore["append"]>[0],
    ): ReturnType<ViraPostgresProductionActionLedgerStore["append"]> {
      try {
        return await withTenantTransaction(pool, input.stream.scope, async (client, scope) => {
          const stream = Object.freeze({ ...input.stream, scope });
          const locked = await ensureAndLockStream(client, stream);
          const previous = await previousEntry(client, scope, stream.ledgerId, locked.nextSequence);
          if ((previous?.entryHash ?? null) !== locked.chainHeadHash) throw new LedgerConflict("CHAIN_CONFLICT");

          const created = await createViraProductionActionLedgerEntry({
            stream,
            previousEntry: previous,
            operationId: input.operationId,
            executionId: input.executionId,
            ...(input.attemptId === undefined ? {} : { attemptId: input.attemptId }),
            ...(input.executionRevision === undefined ? {} : { executionRevision: input.executionRevision }),
            ...(input.leaseEpoch === undefined ? {} : { leaseEpoch: input.leaseEpoch }),
            kind: input.kind,
            occurredAtEpochMs: input.occurredAtEpochMs,
            evidence: input.evidence,
            digestProvider,
          });
          if (!created.ok) throw new TypeError(`production Action Ledger entry rejected: ${created.issue.code}`);
          const entry = created.value;
          if (entry.sequence !== locked.nextSequence || entry.previousEntryHash !== locked.chainHeadHash) {
            throw new LedgerConflict("CHAIN_CONFLICT");
          }

          const inserted = await client.query(
            `INSERT INTO vira.production_action_ledger_entry (
               organization_id, project_id, environment, ledger_id, sequence, transaction_id, plan_digest,
               plan_revision, operation_id, execution_id, attempt_id, execution_revision, lease_epoch, kind,
               occurred_at, evidence_digest, previous_entry_hash, entry_hash, entry
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb)`,
            [
              scope.organizationId, scope.projectId, scope.environment, entry.ledgerId, entry.sequence,
              entry.transactionId, entry.planDigest, entry.planRevision, entry.operationId, entry.executionId,
              entry.attemptId ?? null, entry.executionRevision ?? null, entry.leaseEpoch ?? null, entry.kind,
              new Date(entry.occurredAtEpochMs), entry.evidenceDigest, entry.previousEntryHash, entry.entryHash,
              JSON.stringify(entry),
            ],
          );
          if (inserted.rowCount !== 1) throw new LedgerConflict("CHAIN_CONFLICT");

          const advanced = await client.query(
            `UPDATE vira.production_action_ledger_stream
             SET next_sequence=$5, chain_head_hash=$6, updated_at=clock_timestamp()
             WHERE organization_id=$1 AND project_id=$2 AND environment=$3 AND ledger_id=$4
               AND next_sequence=$7 AND chain_head_hash IS NOT DISTINCT FROM $8`,
            [
              scope.organizationId, scope.projectId, scope.environment, stream.ledgerId,
              entry.sequence + 1, entry.entryHash, locked.nextSequence, locked.chainHeadHash,
            ],
          );
          if (advanced.rowCount !== 1) throw new LedgerConflict("CHAIN_CONFLICT");
          return { ok: true as const, value: entry };
        });
      } catch (error) {
        if (error instanceof LedgerConflict) return { ok: false, code: error.code };
        throw error;
      }
    },

    async readEntries(
      scopeInput: ViraEnterpriseScope,
      ledgerId: string,
    ): Promise<readonly ViraProductionActionLedgerEntry[]> {
      const scope = canonicalizeEnterpriseScope(scopeInput);
      if (!safeToken(ledgerId)) throw new TypeError("PostgreSQL production Action Ledger id is invalid");
      return withTenantTransaction(pool, scope, async (client) => {
        const result = await client.query<EntryRow>(
          `SELECT entry
           FROM vira.production_action_ledger_entry
           WHERE organization_id=$1 AND project_id=$2 AND environment=$3 AND ledger_id=$4
           ORDER BY sequence ASC`,
          [scope.organizationId, scope.projectId, scope.environment, ledgerId],
        );
        const entries = result.rows.map((row) => parseEntry(row.entry, scope));
        entries.forEach((entry, index) => {
          if (entry.ledgerId !== ledgerId || entry.sequence !== index || entry.previousEntryHash !== (entries[index - 1]?.entryHash ?? null)) {
            throw new TypeError("PostgreSQL production Action Ledger stored chain is not contiguous");
          }
        });
        return Object.freeze(entries);
      });
    },

    async appendCheckpoint(
      checkpoint: ViraProductionActionLedgerCheckpoint,
    ): Promise<
      ViraPostgresProductionActionLedgerMutationResult<ViraProductionActionLedgerCheckpoint>
    > {
      try {
        return await withTenantTransaction(pool, checkpoint.scope, async (client, scope) => {
          if (!exactScope(scope, checkpoint.scope) || !safeToken(checkpoint.ledgerId)) throw new TypeError("PostgreSQL production Action Ledger checkpoint scope is invalid");
          const streamResult = await client.query<StreamRow>(
            `SELECT organization_id, project_id, environment, ledger_id, transaction_id, plan_digest,
              plan_revision, next_sequence, chain_head_hash
             FROM vira.production_action_ledger_stream
             WHERE organization_id=$1 AND project_id=$2 AND environment=$3 AND ledger_id=$4
             FOR UPDATE`,
            [scope.organizationId, scope.projectId, scope.environment, checkpoint.ledgerId],
          );
          if (streamResult.rows.length !== 1) throw new LedgerConflict("CHECKPOINT_CONFLICT");
          const locked = validateStreamRow(streamResult.rows[0]!, checkpoint);
          if (locked.nextSequence !== checkpoint.sequence + 1 || locked.chainHeadHash !== checkpoint.chainHeadHash) {
            throw new LedgerConflict("CHECKPOINT_CONFLICT");
          }
          const checkpointId = `checkpoint.${checkpoint.ledgerId}.${checkpoint.sequence}.${checkpoint.chainHeadHash.slice(0, 16)}`;
          const inserted = await client.query(
            `INSERT INTO vira.production_action_ledger_checkpoint (
               organization_id, project_id, environment, checkpoint_id, ledger_id, sequence, chain_head_hash,
               issued_at, key_id, signature, checkpoint
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
             ON CONFLICT (organization_id, project_id, environment, checkpoint_id) DO NOTHING`,
            [
              scope.organizationId, scope.projectId, scope.environment, checkpointId, checkpoint.ledgerId,
              checkpoint.sequence, checkpoint.chainHeadHash, new Date(checkpoint.issuedAtEpochMs),
              checkpoint.keyId, checkpoint.signature, JSON.stringify(checkpoint),
            ],
          );
          if (inserted.rowCount !== 1) throw new LedgerConflict("CHECKPOINT_CONFLICT");
          return { ok: true as const, value: checkpoint };
        });
      } catch (error) {
        if (error instanceof LedgerConflict) return { ok: false, code: error.code };
        throw error;
      }
    },
  });
}