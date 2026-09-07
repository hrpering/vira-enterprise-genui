import {
  VIRA_TRANSACTION_APPROVAL_VERSION,
  VIRA_TRANSACTION_EXECUTION_AUDIENCE,
  type ViraFrozenTransactionPlan,
  type ViraSignedTransactionExecutionGrant,
} from "@vira-enterprise-genui/action-transaction";
import type { ViraEnterpriseScope } from "@vira-enterprise-genui/enterprise-context";
import {
  isViraDurableExecutionRecord,
  type ViraDurableExecutionRecord,
} from "./index.js";

export const VIRA_DURABLE_EXECUTION_AUTHORITY_VERSION = "1" as const;

export interface ViraDurableExecutionAuthoritySnapshot {
  readonly version: typeof VIRA_DURABLE_EXECUTION_AUTHORITY_VERSION;
  readonly executionId: string;
  readonly scope: ViraEnterpriseScope;
  readonly transactionId: string;
  readonly planDigest: string;
  readonly planRevision: number;
  readonly operationId: string;
  readonly grantId: string;
  readonly grantNonce: string;
  readonly frozen: ViraFrozenTransactionPlan;
  readonly grant: ViraSignedTransactionExecutionGrant;
}

export type ViraDurableExecutionAuthorityResult =
  | { readonly ok: true; readonly value: ViraDurableExecutionAuthoritySnapshot }
  | { readonly ok: false; readonly code: "INVALID_INPUT" | "AUTHORITY_MISMATCH" };

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{16,8192}$/;

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function deepClone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => deepClone(entry)) as T;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, deepClone(entry)]),
  ) as T;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const entry of value) deepFreeze(entry);
    return Object.freeze(value) as T;
  }
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  return Object.freeze(value);
}

export function createViraDurableExecutionAuthoritySnapshot(input: {
  readonly record: ViraDurableExecutionRecord;
  readonly frozen: ViraFrozenTransactionPlan;
  readonly grant: ViraSignedTransactionExecutionGrant;
}): ViraDurableExecutionAuthorityResult {
  if (
    input === null
    || typeof input !== "object"
    || !isViraDurableExecutionRecord(input.record)
    || input.frozen === null
    || typeof input.frozen !== "object"
    || input.grant === null
    || typeof input.grant !== "object"
  ) return { ok: false, code: "INVALID_INPUT" };

  const { record, frozen, grant } = input;
  const operation = frozen.plan?.operations?.find((candidate) => candidate.operationId === record.operationId);
  if (
    frozen.plan === null
    || typeof frozen.plan !== "object"
    || frozen.plan.transactionId !== record.transactionId
    || frozen.planDigest !== record.planDigest
    || frozen.planRevision !== record.planRevision
    || !exactScope(frozen.plan.scope, record.scope)
    || operation === undefined
    || operation.idempotencyKey !== record.idempotencyKey
    || grant.version !== VIRA_TRANSACTION_APPROVAL_VERSION
    || grant.payload.version !== VIRA_TRANSACTION_APPROVAL_VERSION
    || grant.payload.transactionId !== record.transactionId
    || grant.payload.planDigest !== record.planDigest
    || grant.payload.planRevision !== record.planRevision
    || grant.payload.operationId !== record.operationId
    || grant.payload.grantId !== record.grantId
    || grant.payload.nonce !== record.grantNonce
    || grant.payload.audience !== VIRA_TRANSACTION_EXECUTION_AUDIENCE
    || !exactScope(grant.payload.scope, record.scope)
    || !safeToken(grant.keyId)
    || typeof grant.signature !== "string"
    || !SIGNATURE.test(grant.signature)
  ) return { ok: false, code: "AUTHORITY_MISMATCH" };

  const snapshot: ViraDurableExecutionAuthoritySnapshot = {
    version: VIRA_DURABLE_EXECUTION_AUTHORITY_VERSION,
    executionId: record.executionId,
    scope: deepClone(record.scope),
    transactionId: record.transactionId,
    planDigest: record.planDigest,
    planRevision: record.planRevision,
    operationId: record.operationId,
    grantId: record.grantId,
    grantNonce: record.grantNonce,
    frozen: deepClone(frozen),
    grant: deepClone(grant),
  };
  return { ok: true, value: deepFreeze(snapshot) };
}
