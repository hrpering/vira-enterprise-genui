import type { ViraEnterprisePrincipal, ViraEnterpriseScope } from "@vira-enterprise-genui/enterprise-context";
import type {
  ViraFrozenTransactionPlan,
  ViraTransactionOperation,
  ViraTransactionRiskLevel,
  ViraTransactionReversibility,
} from "./types.js";

export const VIRA_TRANSACTION_APPROVAL_VERSION = "1" as const;
export const VIRA_TRANSACTION_EXECUTION_AUDIENCE = "vira.action-execution" as const;
export const VIRA_TRANSACTION_GRANT_MAX_LIFETIME_MS = 5 * 60 * 1_000;

const SHA256_HEX = /^[a-f0-9]{64}$/;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{16,8192}$/;

export interface ViraTransactionReviewOperation {
  readonly operationId: string;
  readonly actionRef: Readonly<{ id: string; versionRef: string }>;
  readonly providerId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly actionIntent: Readonly<Record<string, unknown>>;
  readonly observedBefore: Readonly<{ ref: string | null; digest: string | null; etag: string | null }>;
  readonly expectedPostconditions: readonly Readonly<Record<string, unknown>>[];
  readonly risk: ViraTransactionRiskLevel;
  readonly reversibility: ViraTransactionReversibility;
  readonly dependsOn: readonly string[];
}

export interface ViraTransactionComprehension {
  readonly version: typeof VIRA_TRANSACTION_APPROVAL_VERSION;
  readonly transactionId: string;
  readonly planDigest: string;
  readonly planRevision: number;
  readonly scope: ViraEnterpriseScope;
  readonly applicationRef: Readonly<{ id: string; version: string }>;
  readonly operations: readonly ViraTransactionReviewOperation[];
  readonly policyObligations: unknown;
  readonly commercialPreflight: unknown;
  readonly createdAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export type ViraApprovalDecision = "approved" | "rejected";

export interface ViraTransactionApprovalEvidence {
  readonly version: typeof VIRA_TRANSACTION_APPROVAL_VERSION;
  readonly approvalId: string;
  readonly scope: ViraEnterpriseScope;
  readonly transactionId: string;
  readonly planDigest: string;
  readonly planRevision: number;
  readonly issuer: ViraEnterprisePrincipal;
  readonly decision: ViraApprovalDecision;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface ViraTransactionExecutionGrantPayload {
  readonly version: typeof VIRA_TRANSACTION_APPROVAL_VERSION;
  readonly grantId: string;
  readonly scope: ViraEnterpriseScope;
  readonly transactionId: string;
  readonly planDigest: string;
  readonly planRevision: number;
  readonly operationId: string;
  readonly approvalId: string;
  readonly audience: typeof VIRA_TRANSACTION_EXECUTION_AUDIENCE;
  readonly nonce: string;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface ViraSignedTransactionExecutionGrant {
  readonly version: typeof VIRA_TRANSACTION_APPROVAL_VERSION;
  readonly payload: ViraTransactionExecutionGrantPayload;
  readonly keyId: string;
  readonly signature: string;
}

export interface ViraTransactionGrantSigner {
  readonly sign: (input: {
    readonly message: string;
    readonly scope: ViraEnterpriseScope;
  }) => Promise<unknown> | unknown;
}

export interface ViraTransactionGrantVerifier {
  readonly verify: (input: {
    readonly message: string;
    readonly keyId: string;
    readonly signature: string;
    readonly scope: ViraEnterpriseScope;
  }) => Promise<unknown> | unknown;
}

/**
 * PROD-11 owns the consume-once/replay contract only. A durable atomic
 * implementation of this boundary is intentionally deferred to PROD-12.
 */
export interface ViraTransactionGrantReplayGuard {
  readonly accept: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly nonce: string;
    readonly grantId: string;
    readonly expiresAtEpochMs: number;
  }) => Promise<unknown> | unknown;
}

export type ViraTransactionApprovalIssueCode =
  | "INVALID_INPUT"
  | "STALE_REVIEW"
  | "INVALID_APPROVER"
  | "CROSS_SCOPE"
  | "INVALID_TIME_WINDOW"
  | "APPROVAL_REJECTED"
  | "APPROVAL_MISMATCH"
  | "UNKNOWN_OPERATION"
  | "INVALID_AUDIENCE"
  | "SIGNER_FAILED"
  | "INVALID_SIGNATURE"
  | "GRANT_MISMATCH"
  | "GRANT_EXPIRED"
  | "VERIFIER_FAILED"
  | "REPLAY_REJECTED"
  | "REPLAY_GUARD_FAILED";

export interface ViraTransactionApprovalIssue {
  readonly code: ViraTransactionApprovalIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraTransactionApprovalResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraTransactionApprovalIssue };

export interface ViraCreateApprovalInput {
  readonly approvalId: string;
  readonly frozen: ViraFrozenTransactionPlan;
  readonly review: ViraTransactionComprehension;
  readonly issuer: ViraEnterprisePrincipal;
  readonly decision: ViraApprovalDecision;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface ViraIssueExecutionGrantInput {
  readonly frozen: ViraFrozenTransactionPlan;
  readonly approval: ViraTransactionApprovalEvidence;
  readonly operationId: string;
  readonly grantId: string;
  readonly nonce: string;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly signer: ViraTransactionGrantSigner;
}

export interface ViraVerifyExecutionGrantInput {
  readonly frozen: ViraFrozenTransactionPlan;
  readonly grant: ViraSignedTransactionExecutionGrant;
  readonly operationId: string;
  readonly audience: string;
  readonly nowEpochMs: number;
  readonly verifier: ViraTransactionGrantVerifier;
  readonly replayGuard: ViraTransactionGrantReplayGuard;
}

function fail<T>(code: ViraTransactionApprovalIssueCode, path: string, message: string): ViraTransactionApprovalResult<T> {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function safeTime(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function exactPlanCoordinates(
  frozen: ViraFrozenTransactionPlan,
  value: { readonly transactionId: string; readonly planDigest: string; readonly planRevision: number },
): boolean {
  return value.transactionId === frozen.plan.transactionId
    && value.planDigest === frozen.planDigest
    && value.planRevision === frozen.planRevision;
}

function cloneJson<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => cloneJson(entry)) as T;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, cloneJson(entry)]),
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

function frozenScope(scope: ViraEnterpriseScope): ViraEnterpriseScope {
  return Object.freeze({
    version: scope.version,
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    environment: scope.environment,
  });
}

function frozenPrincipal(principal: ViraEnterprisePrincipal): ViraEnterprisePrincipal {
  return Object.freeze({
    version: principal.version,
    kind: principal.kind,
    id: principal.id,
    organizationId: principal.organizationId,
  });
}

function operationReview(operation: ViraTransactionOperation): ViraTransactionReviewOperation {
  return deepFreeze({
    operationId: operation.operationId,
    actionRef: { id: operation.actionRef.id, versionRef: operation.actionRef.versionRef },
    providerId: operation.providerId,
    resourceType: operation.resourceType,
    resourceId: operation.resourceId,
    actionIntent: cloneJson(operation.actionIntent),
    observedBefore: {
      ref: operation.observedBefore.ref,
      digest: operation.observedBefore.digest,
      etag: operation.observedBefore.etag,
    },
    expectedPostconditions: operation.expectedPostconditions.map((entry) => cloneJson(entry)),
    risk: operation.risk,
    reversibility: operation.reversibility,
    dependsOn: [...operation.dependsOn],
  });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (typeof value !== "object") throw new TypeError("grant payload contains a non-JSON value");
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function operationById(frozen: ViraFrozenTransactionPlan, operationId: string): ViraTransactionOperation | undefined {
  return frozen.plan.operations.find((operation) => operation.operationId === operationId);
}

function validateFrozen(frozen: ViraFrozenTransactionPlan): ViraTransactionApprovalResult<true> {
  if (
    frozen === null
    || typeof frozen !== "object"
    || frozen.plan === null
    || typeof frozen.plan !== "object"
    || !safeToken(frozen.plan.transactionId)
    || typeof frozen.planDigest !== "string"
    || !SHA256_HEX.test(frozen.planDigest)
    || !Number.isSafeInteger(frozen.planRevision)
    || frozen.planRevision < 1
    || !safeTime(frozen.plan.expiresAtEpochMs)
  ) return fail("INVALID_INPUT", "$.frozen", "a valid frozen TransactionPlan is required");
  return { ok: true, value: true };
}

export function createViraTransactionComprehension(
  frozen: ViraFrozenTransactionPlan,
): ViraTransactionApprovalResult<ViraTransactionComprehension> {
  const valid = validateFrozen(frozen);
  if (!valid.ok) return valid;
  return {
    ok: true,
    value: deepFreeze({
      version: VIRA_TRANSACTION_APPROVAL_VERSION,
      transactionId: frozen.plan.transactionId,
      planDigest: frozen.planDigest,
      planRevision: frozen.planRevision,
      scope: frozenScope(frozen.plan.scope),
      applicationRef: { id: frozen.plan.applicationRef.id, version: frozen.plan.applicationRef.version },
      operations: frozen.plan.operations.map(operationReview),
      policyObligations: cloneJson(frozen.plan.policy.obligations),
      commercialPreflight: cloneJson(frozen.plan.commercial.preflight),
      createdAtEpochMs: frozen.plan.createdAtEpochMs,
      expiresAtEpochMs: frozen.plan.expiresAtEpochMs,
    }),
  };
}

export function createViraHumanApprovalEvidence(
  input: ViraCreateApprovalInput,
): ViraTransactionApprovalResult<ViraTransactionApprovalEvidence> {
  if (input === null || typeof input !== "object" || !safeToken(input.approvalId)) {
    return fail("INVALID_INPUT", "$", "approval input and approvalId are required");
  }
  const valid = validateFrozen(input.frozen);
  if (!valid.ok) return valid;
  if (
    input.review === null
    || typeof input.review !== "object"
    || !exactPlanCoordinates(input.frozen, input.review)
    || !exactScope(input.review.scope, input.frozen.plan.scope)
  ) return fail("STALE_REVIEW", "$.review", "approval review does not bind the exact frozen plan");
  if (
    input.issuer === null
    || typeof input.issuer !== "object"
    || input.issuer.kind !== "user"
    || !safeToken(input.issuer.id)
  ) return fail("INVALID_APPROVER", "$.issuer", "human transaction approval requires a user principal");
  if (input.issuer.organizationId !== input.frozen.plan.scope.organizationId) {
    return fail("CROSS_SCOPE", "$.issuer.organizationId", "approver must belong to the frozen plan organization");
  }
  if (input.decision !== "approved" && input.decision !== "rejected") {
    return fail("INVALID_INPUT", "$.decision", "approval decision is invalid");
  }
  if (
    !safeTime(input.issuedAtEpochMs)
    || !safeTime(input.expiresAtEpochMs)
    || input.expiresAtEpochMs <= input.issuedAtEpochMs
    || input.expiresAtEpochMs > input.frozen.plan.expiresAtEpochMs
  ) return fail("INVALID_TIME_WINDOW", "$.expiresAtEpochMs", "approval validity must be positive and bounded by the frozen plan expiry");

  return {
    ok: true,
    value: deepFreeze({
      version: VIRA_TRANSACTION_APPROVAL_VERSION,
      approvalId: input.approvalId,
      scope: frozenScope(input.frozen.plan.scope),
      transactionId: input.frozen.plan.transactionId,
      planDigest: input.frozen.planDigest,
      planRevision: input.frozen.planRevision,
      issuer: frozenPrincipal(input.issuer),
      decision: input.decision,
      issuedAtEpochMs: input.issuedAtEpochMs,
      expiresAtEpochMs: input.expiresAtEpochMs,
    }),
  };
}

function validateApproval(
  frozen: ViraFrozenTransactionPlan,
  approval: ViraTransactionApprovalEvidence,
  nowEpochMs: number,
): ViraTransactionApprovalResult<true> {
  if (
    approval === null
    || typeof approval !== "object"
    || approval.version !== VIRA_TRANSACTION_APPROVAL_VERSION
    || !safeToken(approval.approvalId)
    || !exactPlanCoordinates(frozen, approval)
    || !exactScope(approval.scope, frozen.plan.scope)
    || approval.issuer.kind !== "user"
    || approval.issuer.organizationId !== frozen.plan.scope.organizationId
  ) return fail("APPROVAL_MISMATCH", "$.approval", "approval does not bind the exact frozen plan and user scope");
  if (approval.decision !== "approved") return fail("APPROVAL_REJECTED", "$.approval.decision", "a rejected plan cannot mint execution authority");
  if (!safeTime(nowEpochMs) || nowEpochMs < approval.issuedAtEpochMs || nowEpochMs >= approval.expiresAtEpochMs) {
    return fail("INVALID_TIME_WINDOW", "$.approval.expiresAtEpochMs", "approval is not currently valid");
  }
  return { ok: true, value: true };
}

export async function issueViraTransactionExecutionGrant(
  input: ViraIssueExecutionGrantInput,
): Promise<ViraTransactionApprovalResult<ViraSignedTransactionExecutionGrant>> {
  if (
    input === null
    || typeof input !== "object"
    || !safeToken(input.operationId)
    || !safeToken(input.grantId)
    || !safeToken(input.nonce)
    || input.signer === null
    || typeof input.signer !== "object"
    || typeof input.signer.sign !== "function"
  ) return fail("INVALID_INPUT", "$", "execution grant input is invalid");
  const valid = validateFrozen(input.frozen);
  if (!valid.ok) return valid;
  const approval = validateApproval(input.frozen, input.approval, input.issuedAtEpochMs);
  if (!approval.ok) return approval;
  const operation = operationById(input.frozen, input.operationId);
  if (!operation) return fail("UNKNOWN_OPERATION", "$.operationId", "execution grant operation is not in the frozen plan");
  const latestExpiry = Math.min(
    input.frozen.plan.expiresAtEpochMs,
    input.approval.expiresAtEpochMs,
    operation.trustValidUntilEpochMs,
    input.issuedAtEpochMs + VIRA_TRANSACTION_GRANT_MAX_LIFETIME_MS,
  );
  if (
    !safeTime(input.issuedAtEpochMs)
    || !safeTime(input.expiresAtEpochMs)
    || input.expiresAtEpochMs <= input.issuedAtEpochMs
    || input.expiresAtEpochMs > latestExpiry
  ) return fail("INVALID_TIME_WINDOW", "$.expiresAtEpochMs", "execution grant expiry exceeds its bounded authority window");

  const payload: ViraTransactionExecutionGrantPayload = deepFreeze({
    version: VIRA_TRANSACTION_APPROVAL_VERSION,
    grantId: input.grantId,
    scope: frozenScope(input.frozen.plan.scope),
    transactionId: input.frozen.plan.transactionId,
    planDigest: input.frozen.planDigest,
    planRevision: input.frozen.planRevision,
    operationId: operation.operationId,
    approvalId: input.approval.approvalId,
    audience: VIRA_TRANSACTION_EXECUTION_AUDIENCE,
    nonce: input.nonce,
    issuedAtEpochMs: input.issuedAtEpochMs,
    expiresAtEpochMs: input.expiresAtEpochMs,
  });
  const message = canonicalJson(payload);

  let signed: unknown;
  try {
    signed = await input.signer.sign({ message, scope: payload.scope });
  } catch {
    return fail("SIGNER_FAILED", "$.signer", "execution grant signer failed closed");
  }
  if (
    signed === null
    || typeof signed !== "object"
    || !("keyId" in signed)
    || !("signature" in signed)
    || !safeToken((signed as { keyId?: unknown }).keyId)
    || typeof (signed as { signature?: unknown }).signature !== "string"
    || !SIGNATURE.test((signed as { signature: string }).signature)
  ) return fail("INVALID_SIGNATURE", "$.signer", "execution grant signer returned invalid keyId/signature evidence");

  return {
    ok: true,
    value: deepFreeze({
      version: VIRA_TRANSACTION_APPROVAL_VERSION,
      payload,
      keyId: (signed as { keyId: string }).keyId,
      signature: (signed as { signature: string }).signature,
    }),
  };
}

function snapshotGrant(grant: ViraSignedTransactionExecutionGrant): ViraSignedTransactionExecutionGrant {
  return deepFreeze({
    version: grant.version,
    payload: {
      version: grant.payload.version,
      grantId: grant.payload.grantId,
      scope: frozenScope(grant.payload.scope),
      transactionId: grant.payload.transactionId,
      planDigest: grant.payload.planDigest,
      planRevision: grant.payload.planRevision,
      operationId: grant.payload.operationId,
      approvalId: grant.payload.approvalId,
      audience: grant.payload.audience,
      nonce: grant.payload.nonce,
      issuedAtEpochMs: grant.payload.issuedAtEpochMs,
      expiresAtEpochMs: grant.payload.expiresAtEpochMs,
    },
    keyId: grant.keyId,
    signature: grant.signature,
  });
}

export async function verifyViraTransactionExecutionGrant(
  input: ViraVerifyExecutionGrantInput,
): Promise<ViraTransactionApprovalResult<ViraSignedTransactionExecutionGrant>> {
  if (
    input === null
    || typeof input !== "object"
    || !safeToken(input.operationId)
    || typeof input.audience !== "string"
    || input.verifier === null
    || typeof input.verifier !== "object"
    || typeof input.verifier.verify !== "function"
    || input.replayGuard === null
    || typeof input.replayGuard !== "object"
    || typeof input.replayGuard.accept !== "function"
  ) return fail("INVALID_INPUT", "$", "execution grant verification input is invalid");
  const valid = validateFrozen(input.frozen);
  if (!valid.ok) return valid;
  if (input.grant === null || typeof input.grant !== "object") return fail("INVALID_INPUT", "$.grant", "signed execution grant is required");

  let grant: ViraSignedTransactionExecutionGrant;
  try {
    grant = snapshotGrant(input.grant);
  } catch {
    return fail("INVALID_INPUT", "$.grant", "signed execution grant snapshot is invalid");
  }
  const payload = grant.payload;
  if (
    grant.version !== VIRA_TRANSACTION_APPROVAL_VERSION
    || payload.version !== VIRA_TRANSACTION_APPROVAL_VERSION
    || !safeToken(payload.grantId)
    || !safeToken(payload.operationId)
    || !safeToken(payload.approvalId)
    || !safeToken(payload.nonce)
    || !safeToken(grant.keyId)
    || !SIGNATURE.test(grant.signature)
    || !exactPlanCoordinates(input.frozen, payload)
    || !exactScope(payload.scope, input.frozen.plan.scope)
    || payload.operationId !== input.operationId
    || operationById(input.frozen, payload.operationId) === undefined
  ) return fail("GRANT_MISMATCH", "$.grant", "signed execution grant does not bind the exact frozen operation");
  if (input.audience !== VIRA_TRANSACTION_EXECUTION_AUDIENCE || payload.audience !== input.audience) {
    return fail("INVALID_AUDIENCE", "$.audience", "execution grant audience is not the exact Action execution audience");
  }
  if (
    !safeTime(input.nowEpochMs)
    || !safeTime(payload.issuedAtEpochMs)
    || !safeTime(payload.expiresAtEpochMs)
    || input.nowEpochMs < payload.issuedAtEpochMs
    || input.nowEpochMs >= payload.expiresAtEpochMs
  ) return fail("GRANT_EXPIRED", "$.grant.payload.expiresAtEpochMs", "execution grant is outside its validity window");

  const message = canonicalJson(payload);
  let verified: unknown;
  try {
    verified = await input.verifier.verify({
      message,
      keyId: grant.keyId,
      signature: grant.signature,
      scope: payload.scope,
    });
  } catch {
    return fail("VERIFIER_FAILED", "$.verifier", "execution grant verifier failed closed");
  }
  if (verified !== true) return fail("INVALID_SIGNATURE", "$.grant.signature", "execution grant signature verification failed");

  let accepted: unknown;
  try {
    accepted = await input.replayGuard.accept({
      scope: payload.scope,
      nonce: payload.nonce,
      grantId: payload.grantId,
      expiresAtEpochMs: payload.expiresAtEpochMs,
    });
  } catch {
    return fail("REPLAY_GUARD_FAILED", "$.replayGuard", "execution grant replay guard failed closed");
  }
  if (accepted !== true) return fail("REPLAY_REJECTED", "$.grant.payload.nonce", "execution grant nonce was already accepted or rejected by replay policy");

  return { ok: true, value: grant };
}
