import type { ViraProductionActionLedgerCheckpoint } from "../../../packages/action-ledger/src/production.js";
import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import { parseJsonValue, type JsonObject, type JsonValue } from "../../../packages/protocol/src/index.js";
import {
  canonicalizeEnterpriseScope,
  withTenantTransaction,
  type PostgresPoolLike,
} from "./transaction.js";

interface CheckpointRow extends Record<string, unknown> {
  readonly checkpoint: unknown;
}

export interface ViraPostgresProductionActionLedgerCheckpointRepository {
  readonly readLatest: (
    scope: ViraEnterpriseScope,
    ledgerId: string,
  ) => Promise<ViraProductionActionLedgerCheckpoint | undefined>;
}

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const SIGNATURE = /^[A-Za-z0-9._~+/=-]{8,4096}$/;
const CHECKPOINT_FIELDS = new Set([
  "version",
  "audience",
  "scope",
  "ledgerId",
  "transactionId",
  "planDigest",
  "planRevision",
  "sequence",
  "chainHeadHash",
  "issuedAtEpochMs",
  "keyId",
  "signature",
]);
const SCOPE_FIELDS = new Set(["version", "organizationId", "projectId", "environment"]);

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value: JsonObject, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function parseCheckpoint(input: unknown, expectedScope: ViraEnterpriseScope, expectedLedgerId: string): ViraProductionActionLedgerCheckpoint {
  const parsed = parseJsonValue(input, "$.checkpoint");
  if (!parsed.ok || !object(parsed.value) || !exactFields(parsed.value, CHECKPOINT_FIELDS) || !object(parsed.value.scope) || !exactFields(parsed.value.scope, SCOPE_FIELDS)) {
    throw new TypeError("PostgreSQL production Action Ledger checkpoint is not canonical exact-shape JSON");
  }
  const value = parsed.value;
  const scope = canonicalizeEnterpriseScope(value.scope);
  if (
    !exactScope(scope, expectedScope)
    || value.version !== "1"
    || value.audience !== "vira.action-ledger.checkpoint"
    || !safeToken(value.ledgerId)
    || value.ledgerId !== expectedLedgerId
    || !safeToken(value.transactionId)
    || typeof value.planDigest !== "string"
    || !SHA256_HEX.test(value.planDigest)
    || !positive(value.planRevision)
    || !nonNegative(value.sequence)
    || typeof value.chainHeadHash !== "string"
    || !SHA256_HEX.test(value.chainHeadHash)
    || !positive(value.issuedAtEpochMs)
    || !safeToken(value.keyId)
    || typeof value.signature !== "string"
    || !SIGNATURE.test(value.signature)
  ) throw new TypeError("PostgreSQL production Action Ledger checkpoint identity is invalid");
  return Object.freeze({
    version: "1",
    audience: "vira.action-ledger.checkpoint",
    scope,
    ledgerId: value.ledgerId,
    transactionId: value.transactionId,
    planDigest: value.planDigest,
    planRevision: value.planRevision,
    sequence: value.sequence,
    chainHeadHash: value.chainHeadHash,
    issuedAtEpochMs: value.issuedAtEpochMs,
    keyId: value.keyId,
    signature: value.signature,
  });
}

export function createPostgresProductionActionLedgerCheckpointRepository(
  pool: PostgresPoolLike,
): ViraPostgresProductionActionLedgerCheckpointRepository {
  if (pool === null || typeof pool !== "object" || typeof pool.connect !== "function") {
    throw new TypeError("PostgreSQL production Action Ledger checkpoint repository requires a pool");
  }
  return Object.freeze({
    async readLatest(scopeInput: ViraEnterpriseScope, ledgerId: string) {
      const scope = canonicalizeEnterpriseScope(scopeInput);
      if (!safeToken(ledgerId)) throw new TypeError("PostgreSQL production Action Ledger checkpoint ledger id is invalid");
      return withTenantTransaction(pool, scope, async (client) => {
        const result = await client.query<CheckpointRow>(
          `SELECT checkpoint
             FROM vira.production_action_ledger_checkpoint
            WHERE organization_id=$1 AND project_id=$2 AND environment=$3 AND ledger_id=$4
            ORDER BY sequence DESC, issued_at DESC
            LIMIT 1`,
          [scope.organizationId, scope.projectId, scope.environment, ledgerId],
        );
        if (result.rows.length === 0) return undefined;
        if (result.rows.length !== 1) throw new TypeError("PostgreSQL production Action Ledger checkpoint read returned duplicate latest rows");
        return parseCheckpoint(result.rows[0]!.checkpoint, scope, ledgerId);
      });
    },
  });
}
