import {
  createViraEnterpriseContext,
  type ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";
import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";

export const VIRA_PRODUCTION_ACTION_LEDGER_VERSION = "1" as const;
export const VIRA_PRODUCTION_ACTION_LEDGER_CHECKPOINT_AUDIENCE = "vira.action-ledger.checkpoint" as const;
export const VIRA_PRODUCTION_ACTION_LEDGER_MAX_EVIDENCE_CHARS = 128 * 1024;
export const VIRA_PRODUCTION_ACTION_LEDGER_ENTRY_KINDS = Object.freeze([
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
] as const);

export type ViraProductionActionLedgerEntryKind = (typeof VIRA_PRODUCTION_ACTION_LEDGER_ENTRY_KINDS)[number];

export interface ViraProductionActionLedgerStream {
  readonly version: typeof VIRA_PRODUCTION_ACTION_LEDGER_VERSION;
  readonly scope: ViraEnterpriseScope;
  readonly ledgerId: string;
  readonly transactionId: string;
  readonly planDigest: string;
  readonly planRevision: number;
}

export interface ViraProductionActionLedgerEntry extends ViraProductionActionLedgerStream {
  readonly sequence: number;
  readonly operationId: string;
  readonly executionId: string;
  readonly attemptId?: string;
  readonly executionRevision?: number;
  readonly leaseEpoch?: number;
  readonly kind: ViraProductionActionLedgerEntryKind;
  readonly occurredAtEpochMs: number;
  readonly evidenceDigest: string;
  readonly evidence: JsonObject;
  readonly previousEntryHash: string | null;
  readonly entryHash: string;
}

export interface ViraProductionActionLedgerDigestProvider {
  readonly sha256: (canonicalJson: string) => Promise<unknown> | unknown;
}

export interface ViraProductionActionLedgerCheckpointSigner {
  readonly sign: (input: {
    readonly audience: typeof VIRA_PRODUCTION_ACTION_LEDGER_CHECKPOINT_AUDIENCE;
    readonly payload: string;
  }) => Promise<unknown> | unknown;
}

export interface ViraProductionActionLedgerCheckpointVerifier {
  readonly verify: (input: {
    readonly audience: typeof VIRA_PRODUCTION_ACTION_LEDGER_CHECKPOINT_AUDIENCE;
    readonly keyId: string;
    readonly signature: string;
    readonly payload: string;
  }) => Promise<unknown> | unknown;
}

export interface ViraProductionActionLedgerCheckpoint {
  readonly version: typeof VIRA_PRODUCTION_ACTION_LEDGER_VERSION;
  readonly audience: typeof VIRA_PRODUCTION_ACTION_LEDGER_CHECKPOINT_AUDIENCE;
  readonly scope: ViraEnterpriseScope;
  readonly ledgerId: string;
  readonly transactionId: string;
  readonly planDigest: string;
  readonly planRevision: number;
  readonly sequence: number;
  readonly chainHeadHash: string;
  readonly issuedAtEpochMs: number;
  readonly keyId: string;
  readonly signature: string;
}

export type ViraProductionActionLedgerIssueCode =
  | "INVALID_INPUT"
  | "INVALID_SCOPE"
  | "INVALID_STREAM"
  | "INVALID_PREVIOUS_ENTRY"
  | "INVALID_EVIDENCE"
  | "DIGEST_FAILED"
  | "INVALID_DIGEST"
  | "CHAIN_BROKEN"
  | "SIGNER_FAILED"
  | "INVALID_SIGNATURE_EVIDENCE"
  | "VERIFIER_FAILED"
  | "CHECKPOINT_REJECTED";

export interface ViraProductionActionLedgerIssue {
  readonly code: ViraProductionActionLedgerIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraProductionActionLedgerResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraProductionActionLedgerIssue };

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const SIGNATURE = /^[A-Za-z0-9._~+/=-]{8,4096}$/;
const FORBIDDEN_EVIDENCE_KEYS = new Set([
  "authorization",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "credential",
  "password",
  "secret",
  "secretref",
]);

function fail<T>(
  code: ViraProductionActionLedgerIssueCode,
  path: string,
  message: string,
): ViraProductionActionLedgerResult<T> {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function record(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
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

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const entry of value) deepFreeze(entry);
    return Object.freeze(value) as T;
  }
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  return Object.freeze(value);
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (!record(value)) throw new TypeError("canonical action-ledger JSON value is invalid");
  const entries = Object.entries(value)
    .sort(([left], [right]) => left === right ? 0 : left < right ? -1 : 1)
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
  return `{${entries.join(",")}}`;
}

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function containsForbiddenEvidenceKey(value: JsonValue): boolean {
  if (Array.isArray(value)) return value.some((entry) => containsForbiddenEvidenceKey(entry));
  if (!record(value)) return false;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_EVIDENCE_KEYS.has(normalizedKey(key))) return true;
    if (containsForbiddenEvidenceKey(entry)) return true;
  }
  return false;
}

function canonicalScope(scope: ViraEnterpriseScope): JsonObject {
  return {
    version: scope.version,
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    environment: scope.environment,
  };
}

function validateScope(input: ViraEnterpriseScope): ViraProductionActionLedgerResult<ViraEnterpriseScope> {
  if (input === null || typeof input !== "object") return fail("INVALID_SCOPE", "$.scope", "ledger scope is invalid");
  const context = createViraEnterpriseContext({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environments: [input.environment],
  });
  if (!context.ok) return fail("INVALID_SCOPE", "$.scope", context.issue.message);
  const scope = context.value.scope(input.environment);
  if (!scope.ok || scope.value.version !== input.version) {
    return fail("INVALID_SCOPE", "$.scope", scope.ok ? "ledger scope version is invalid" : scope.issue.message);
  }
  return { ok: true, value: scope.value };
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function exactStream(
  left: ViraProductionActionLedgerStream,
  right: ViraProductionActionLedgerStream,
): boolean {
  return exactScope(left.scope, right.scope)
    && left.version === right.version
    && left.ledgerId === right.ledgerId
    && left.transactionId === right.transactionId
    && left.planDigest === right.planDigest
    && left.planRevision === right.planRevision;
}

function validateStream(input: ViraProductionActionLedgerStream): ViraProductionActionLedgerResult<ViraProductionActionLedgerStream> {
  const scope = validateScope(input.scope);
  if (!scope.ok) return scope;
  if (
    input.version !== VIRA_PRODUCTION_ACTION_LEDGER_VERSION
    || !safeToken(input.ledgerId)
    || !safeToken(input.transactionId)
    || typeof input.planDigest !== "string"
    || !SHA256_HEX.test(input.planDigest)
    || !positive(input.planRevision)
  ) return fail("INVALID_STREAM", "$", "production Action Ledger stream identity is invalid");
  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_PRODUCTION_ACTION_LEDGER_VERSION,
      scope: scope.value,
      ledgerId: input.ledgerId,
      transactionId: input.transactionId,
      planDigest: input.planDigest,
      planRevision: input.planRevision,
    }),
  };
}

function cloneEvidence(input: JsonObject): JsonObject | undefined {
  const parsed = parseJsonValue(input, "$.evidence");
  if (!parsed.ok || !record(parsed.value)) return undefined;
  if (JSON.stringify(parsed.value).length > VIRA_PRODUCTION_ACTION_LEDGER_MAX_EVIDENCE_CHARS) return undefined;
  if (containsForbiddenEvidenceKey(parsed.value)) return undefined;
  return deepFreeze(parsed.value);
}

async function digest(
  provider: ViraProductionActionLedgerDigestProvider,
  canonical: string,
): Promise<ViraProductionActionLedgerResult<string>> {
  if (provider === null || typeof provider !== "object" || typeof provider.sha256 !== "function") {
    return fail("INVALID_INPUT", "$.digestProvider", "ledger digest provider is invalid");
  }
  let result: unknown;
  try {
    result = await provider.sha256(canonical);
  } catch {
    return fail("DIGEST_FAILED", "$.digestProvider", "ledger digest provider failed closed");
  }
  if (typeof result !== "string" || !SHA256_HEX.test(result)) {
    return fail("INVALID_DIGEST", "$.digestProvider", "ledger digest provider returned an invalid SHA-256 digest");
  }
  return { ok: true, value: result };
}

function entryCanonicalObject(
  input: Omit<ViraProductionActionLedgerEntry, "entryHash">,
): JsonObject {
  return {
    version: input.version,
    scope: canonicalScope(input.scope),
    ledgerId: input.ledgerId,
    sequence: input.sequence,
    transactionId: input.transactionId,
    planDigest: input.planDigest,
    planRevision: input.planRevision,
    operationId: input.operationId,
    executionId: input.executionId,
    ...(input.attemptId === undefined ? {} : { attemptId: input.attemptId }),
    ...(input.executionRevision === undefined ? {} : { executionRevision: input.executionRevision }),
    ...(input.leaseEpoch === undefined ? {} : { leaseEpoch: input.leaseEpoch }),
    kind: input.kind,
    occurredAtEpochMs: input.occurredAtEpochMs,
    evidenceDigest: input.evidenceDigest,
    evidence: input.evidence,
    previousEntryHash: input.previousEntryHash,
  };
}

function validEntryIdentity(entry: ViraProductionActionLedgerEntry): boolean {
  return entry.version === VIRA_PRODUCTION_ACTION_LEDGER_VERSION
    && safeToken(entry.ledgerId)
    && nonNegative(entry.sequence)
    && safeToken(entry.transactionId)
    && SHA256_HEX.test(entry.planDigest)
    && positive(entry.planRevision)
    && safeToken(entry.operationId)
    && safeToken(entry.executionId)
    && (entry.attemptId === undefined || safeToken(entry.attemptId))
    && (entry.executionRevision === undefined || positive(entry.executionRevision))
    && (entry.leaseEpoch === undefined || positive(entry.leaseEpoch))
    && VIRA_PRODUCTION_ACTION_LEDGER_ENTRY_KINDS.includes(entry.kind)
    && positive(entry.occurredAtEpochMs)
    && SHA256_HEX.test(entry.evidenceDigest)
    && (entry.previousEntryHash === null || SHA256_HEX.test(entry.previousEntryHash))
    && SHA256_HEX.test(entry.entryHash);
}

export async function createViraProductionActionLedgerEntry(input: {
  readonly stream: ViraProductionActionLedgerStream;
  readonly previousEntry: ViraProductionActionLedgerEntry | null;
  readonly operationId: string;
  readonly executionId: string;
  readonly attemptId?: string;
  readonly executionRevision?: number;
  readonly leaseEpoch?: number;
  readonly kind: ViraProductionActionLedgerEntryKind;
  readonly occurredAtEpochMs: number;
  readonly evidence: JsonObject;
  readonly digestProvider: ViraProductionActionLedgerDigestProvider;
}): Promise<ViraProductionActionLedgerResult<ViraProductionActionLedgerEntry>> {
  if (input === null || typeof input !== "object") return fail("INVALID_INPUT", "$", "ledger entry input is invalid");
  const stream = validateStream(input.stream);
  if (!stream.ok) return stream;
  if (
    !safeToken(input.operationId)
    || !safeToken(input.executionId)
    || (input.attemptId !== undefined && !safeToken(input.attemptId))
    || (input.executionRevision !== undefined && !positive(input.executionRevision))
    || (input.leaseEpoch !== undefined && !positive(input.leaseEpoch))
    || !VIRA_PRODUCTION_ACTION_LEDGER_ENTRY_KINDS.includes(input.kind)
    || !positive(input.occurredAtEpochMs)
  ) return fail("INVALID_INPUT", "$", "ledger entry coordinates are invalid");

  if (input.previousEntry !== null) {
    if (!validEntryIdentity(input.previousEntry) || !exactStream(stream.value, input.previousEntry)) {
      return fail("INVALID_PREVIOUS_ENTRY", "$.previousEntry", "previous ledger entry does not belong to the exact stream");
    }
  }

  const evidence = cloneEvidence(input.evidence);
  if (!evidence) return fail("INVALID_EVIDENCE", "$.evidence", "ledger evidence must be bounded canonical secret-free JSON");
  const evidenceHash = await digest(input.digestProvider, canonicalJson(evidence));
  if (!evidenceHash.ok) return evidenceHash;

  const base: Omit<ViraProductionActionLedgerEntry, "entryHash"> = {
    ...stream.value,
    sequence: input.previousEntry === null ? 0 : input.previousEntry.sequence + 1,
    operationId: input.operationId,
    executionId: input.executionId,
    ...(input.attemptId === undefined ? {} : { attemptId: input.attemptId }),
    ...(input.executionRevision === undefined ? {} : { executionRevision: input.executionRevision }),
    ...(input.leaseEpoch === undefined ? {} : { leaseEpoch: input.leaseEpoch }),
    kind: input.kind,
    occurredAtEpochMs: input.occurredAtEpochMs,
    evidenceDigest: evidenceHash.value,
    evidence,
    previousEntryHash: input.previousEntry?.entryHash ?? null,
  };
  const entryHash = await digest(input.digestProvider, canonicalJson(entryCanonicalObject(base)));
  if (!entryHash.ok) return entryHash;
  return {
    ok: true,
    value: deepFreeze({ ...base, entryHash: entryHash.value }),
  };
}

export async function verifyViraProductionActionLedgerChain(input: {
  readonly entries: readonly ViraProductionActionLedgerEntry[];
  readonly digestProvider: ViraProductionActionLedgerDigestProvider;
}): Promise<ViraProductionActionLedgerResult<Readonly<{
  readonly entriesVerified: number;
  readonly chainHeadHash: string | null;
}>>> {
  if (input === null || typeof input !== "object" || !Array.isArray(input.entries)) {
    return fail("INVALID_INPUT", "$", "ledger chain verification input is invalid");
  }
  let previous: ViraProductionActionLedgerEntry | null = null;
  for (let index = 0; index < input.entries.length; index += 1) {
    const entry = input.entries[index]!;
    if (!validEntryIdentity(entry)) return fail("CHAIN_BROKEN", `$.entries[${index}]`, "ledger entry identity/hash format is invalid");
    if (entry.sequence !== index) return fail("CHAIN_BROKEN", `$.entries[${index}].sequence`, "ledger sequence is not contiguous from genesis");
    if (previous !== null && !exactStream(previous, entry)) {
      return fail("CHAIN_BROKEN", `$.entries[${index}]`, "ledger stream identity changed inside one chain");
    }
    if (entry.previousEntryHash !== (previous?.entryHash ?? null)) {
      return fail("CHAIN_BROKEN", `$.entries[${index}].previousEntryHash`, "ledger previous hash does not bind the exact prior entry");
    }
    const evidenceHash = await digest(input.digestProvider, canonicalJson(entry.evidence));
    if (!evidenceHash.ok) return evidenceHash;
    if (evidenceHash.value !== entry.evidenceDigest) {
      return fail("CHAIN_BROKEN", `$.entries[${index}].evidenceDigest`, "ledger evidence digest does not match canonical evidence");
    }
    const { entryHash: _entryHash, ...base } = entry;
    void _entryHash;
    const recomputed = await digest(input.digestProvider, canonicalJson(entryCanonicalObject(base)));
    if (!recomputed.ok) return recomputed;
    if (recomputed.value !== entry.entryHash) {
      return fail("CHAIN_BROKEN", `$.entries[${index}].entryHash`, "ledger entry hash does not match canonical entry contents");
    }
    previous = entry;
  }
  return {
    ok: true,
    value: Object.freeze({
      entriesVerified: input.entries.length,
      chainHeadHash: previous?.entryHash ?? null,
    }),
  };
}

function checkpointPayloadObject(input: Omit<ViraProductionActionLedgerCheckpoint, "keyId" | "signature">): JsonObject {
  return {
    version: input.version,
    audience: input.audience,
    scope: canonicalScope(input.scope),
    ledgerId: input.ledgerId,
    transactionId: input.transactionId,
    planDigest: input.planDigest,
    planRevision: input.planRevision,
    sequence: input.sequence,
    chainHeadHash: input.chainHeadHash,
    issuedAtEpochMs: input.issuedAtEpochMs,
  };
}

export async function issueViraProductionActionLedgerCheckpoint(input: {
  readonly head: ViraProductionActionLedgerEntry;
  readonly issuedAtEpochMs: number;
  readonly signer: ViraProductionActionLedgerCheckpointSigner;
}): Promise<ViraProductionActionLedgerResult<ViraProductionActionLedgerCheckpoint>> {
  if (
    input === null
    || typeof input !== "object"
    || !validEntryIdentity(input.head)
    || !positive(input.issuedAtEpochMs)
    || input.signer === null
    || typeof input.signer !== "object"
    || typeof input.signer.sign !== "function"
  ) return fail("INVALID_INPUT", "$", "ledger checkpoint issuance input is invalid");
  const payloadBase = {
    version: VIRA_PRODUCTION_ACTION_LEDGER_VERSION,
    audience: VIRA_PRODUCTION_ACTION_LEDGER_CHECKPOINT_AUDIENCE,
    scope: input.head.scope,
    ledgerId: input.head.ledgerId,
    transactionId: input.head.transactionId,
    planDigest: input.head.planDigest,
    planRevision: input.head.planRevision,
    sequence: input.head.sequence,
    chainHeadHash: input.head.entryHash,
    issuedAtEpochMs: input.issuedAtEpochMs,
  } as const;
  const payload = canonicalJson(checkpointPayloadObject(payloadBase));
  let signed: unknown;
  try {
    signed = await input.signer.sign({
      audience: VIRA_PRODUCTION_ACTION_LEDGER_CHECKPOINT_AUDIENCE,
      payload,
    });
  } catch {
    return fail("SIGNER_FAILED", "$.signer", "ledger checkpoint signer failed closed");
  }
  if (
    signed === null
    || typeof signed !== "object"
    || !safeToken((signed as { keyId?: unknown }).keyId)
    || typeof (signed as { signature?: unknown }).signature !== "string"
    || !SIGNATURE.test((signed as { signature: string }).signature)
  ) return fail("INVALID_SIGNATURE_EVIDENCE", "$.signer", "ledger checkpoint signer returned invalid evidence");
  return {
    ok: true,
    value: deepFreeze({
      ...payloadBase,
      keyId: (signed as { keyId: string }).keyId,
      signature: (signed as { signature: string }).signature,
    }),
  };
}

export async function verifyViraProductionActionLedgerCheckpoint(input: {
  readonly checkpoint: ViraProductionActionLedgerCheckpoint;
  readonly expectedHead: ViraProductionActionLedgerEntry;
  readonly verifier: ViraProductionActionLedgerCheckpointVerifier;
}): Promise<ViraProductionActionLedgerResult<true>> {
  const checkpoint = input?.checkpoint;
  const expectedHead = input?.expectedHead;
  if (
    checkpoint === null
    || typeof checkpoint !== "object"
    || expectedHead === null
    || typeof expectedHead !== "object"
    || !validEntryIdentity(expectedHead)
    || checkpoint.version !== VIRA_PRODUCTION_ACTION_LEDGER_VERSION
    || checkpoint.audience !== VIRA_PRODUCTION_ACTION_LEDGER_CHECKPOINT_AUDIENCE
    || !safeToken(checkpoint.ledgerId)
    || !safeToken(checkpoint.transactionId)
    || !SHA256_HEX.test(checkpoint.planDigest)
    || !positive(checkpoint.planRevision)
    || !nonNegative(checkpoint.sequence)
    || !SHA256_HEX.test(checkpoint.chainHeadHash)
    || !positive(checkpoint.issuedAtEpochMs)
    || !safeToken(checkpoint.keyId)
    || !SIGNATURE.test(checkpoint.signature)
    || input.verifier === null
    || typeof input.verifier !== "object"
    || typeof input.verifier.verify !== "function"
  ) return fail("INVALID_INPUT", "$", "ledger checkpoint verification input is invalid");
  if (
    !exactScope(checkpoint.scope, expectedHead.scope)
    || checkpoint.ledgerId !== expectedHead.ledgerId
    || checkpoint.transactionId !== expectedHead.transactionId
    || checkpoint.planDigest !== expectedHead.planDigest
    || checkpoint.planRevision !== expectedHead.planRevision
    || checkpoint.sequence !== expectedHead.sequence
    || checkpoint.chainHeadHash !== expectedHead.entryHash
  ) return fail("CHECKPOINT_REJECTED", "$.checkpoint", "ledger checkpoint does not bind the expected chain head");
  const payload = canonicalJson(checkpointPayloadObject({
    version: checkpoint.version,
    audience: checkpoint.audience,
    scope: checkpoint.scope,
    ledgerId: checkpoint.ledgerId,
    transactionId: checkpoint.transactionId,
    planDigest: checkpoint.planDigest,
    planRevision: checkpoint.planRevision,
    sequence: checkpoint.sequence,
    chainHeadHash: checkpoint.chainHeadHash,
    issuedAtEpochMs: checkpoint.issuedAtEpochMs,
  }));
  let verified: unknown;
  try {
    verified = await input.verifier.verify({
      audience: VIRA_PRODUCTION_ACTION_LEDGER_CHECKPOINT_AUDIENCE,
      keyId: checkpoint.keyId,
      signature: checkpoint.signature,
      payload,
    });
  } catch {
    return fail("VERIFIER_FAILED", "$.verifier", "ledger checkpoint verifier failed closed");
  }
  if (verified !== true) return fail("CHECKPOINT_REJECTED", "$.checkpoint.signature", "ledger checkpoint signature was rejected");
  return { ok: true, value: true };
}
