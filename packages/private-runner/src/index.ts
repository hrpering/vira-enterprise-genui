import type { ViraDurableExecutionStageBPermit } from "@vira-enterprise-genui/durable-execution";
import type { ViraEnterpriseScope, ViraSecretRef } from "@vira-enterprise-genui/enterprise-context";
import { parseJsonValue, type JsonObject, type JsonValue } from "@vira-enterprise-genui/protocol";

export const VIRA_PRIVATE_RUNNER_VERSION = "1" as const;
export const VIRA_PRIVATE_RUNNER_MAX_CREDENTIAL_LENGTH = 64 * 1024;

export interface ViraPrivateRunnerResolvedCredential {
  readonly scope: ViraEnterpriseScope;
  readonly secretRef: ViraSecretRef;
  readonly credential: string;
  readonly expiresAtEpochMs: number;
}

export interface ViraPrivateRunnerSecretProvider {
  readonly resolve: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly secretRef: ViraSecretRef;
  }) => Promise<unknown> | unknown;
}

export interface ViraPrivateRunnerAdapter {
  readonly invoke: (input: {
    readonly permit: ViraDurableExecutionStageBPermit;
    readonly credential: string;
  }) => Promise<unknown> | unknown;
}

export interface ViraPrivateRunnerDispatchResult {
  readonly version: typeof VIRA_PRIVATE_RUNNER_VERSION;
  readonly dispatch: "accepted" | "rejected";
  readonly data?: JsonObject;
}

export interface ViraPrivateRunnerInput {
  readonly permit: ViraDurableExecutionStageBPermit;
  readonly nowEpochMs: number;
  readonly secretProvider: ViraPrivateRunnerSecretProvider;
  readonly adapter: ViraPrivateRunnerAdapter;
}

export type ViraPrivateRunnerIssueCode =
  | "INVALID_INPUT"
  | "PERMIT_EXPIRED"
  | "SECRET_RESOLUTION_FAILED"
  | "INVALID_SECRET_EVIDENCE"
  | "SECRET_SCOPE_MISMATCH"
  | "SECRET_EXPIRED"
  | "ADAPTER_UNCERTAIN"
  | "INVALID_ADAPTER_RESULT"
  | "SECRET_EXFILTRATION";

export interface ViraPrivateRunnerIssue {
  readonly code: ViraPrivateRunnerIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraPrivateRunnerResult =
  | { readonly ok: true; readonly value: ViraPrivateRunnerDispatchResult }
  | { readonly ok: false; readonly issue: ViraPrivateRunnerIssue };

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

function fail(code: ViraPrivateRunnerIssueCode, path: string, message: string): ViraPrivateRunnerResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function safePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function exactSecretRef(left: ViraSecretRef, right: ViraSecretRef): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment
    && left.provider === right.provider
    && left.key === right.key
    && left.versionRef === right.versionRef;
}

function freezeJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const entry of value) freezeJson(entry);
    return Object.freeze(value) as T;
  }
  for (const entry of Object.values(value)) freezeJson(entry);
  return Object.freeze(value) as T;
}

function containsCredential(value: JsonValue, credential: string): boolean {
  if (typeof value === "string") return value.includes(credential);
  if (Array.isArray(value)) return value.some((entry) => containsCredential(entry, credential));
  if (value !== null && typeof value === "object") {
    return Object.values(value).some((entry) => containsCredential(entry, credential));
  }
  return false;
}

function validPermit(permit: ViraDurableExecutionStageBPermit): boolean {
  return permit !== null
    && typeof permit === "object"
    && permit.version === "1"
    && safeToken(permit.executionId)
    && safeToken(permit.transactionId)
    && SHA256_HEX.test(permit.planDigest)
    && safePositive(permit.planRevision)
    && safeToken(permit.operationId)
    && safeToken(permit.actionRef?.id)
    && safeToken(permit.actionRef?.versionRef)
    && safeToken(permit.providerId)
    && safeToken(permit.connectionId)
    && safeToken(permit.adapterRef)
    && safeToken(permit.runnerRef)
    && safeToken(permit.secretRef?.provider)
    && safeToken(permit.secretRef?.key)
    && exactScope(permit.scope, {
      version: permit.secretRef.version,
      organizationId: permit.secretRef.organizationId,
      projectId: permit.secretRef.projectId,
      environment: permit.secretRef.environment,
    })
    && safeToken(permit.idempotencyKey)
    && safeToken(permit.grantId)
    && safeToken(permit.grantNonce)
    && safeToken(permit.reservationId)
    && safePositive(permit.reservationRevision)
    && safeToken(permit.workerId)
    && safePositive(permit.leaseEpoch)
    && safePositive(permit.expiresAtEpochMs);
}

function snapshotPermit(input: ViraDurableExecutionStageBPermit): ViraDurableExecutionStageBPermit | undefined {
  if (!validPermit(input)) return undefined;
  const parsedIntent = parseJsonValue(input.actionIntent, "$.permit.actionIntent");
  if (!parsedIntent.ok || !isJsonObject(parsedIntent.value)) return undefined;
  return Object.freeze({
    version: "1",
    executionId: input.executionId,
    scope: Object.freeze({
      version: input.scope.version,
      organizationId: input.scope.organizationId,
      projectId: input.scope.projectId,
      environment: input.scope.environment,
    }),
    transactionId: input.transactionId,
    planDigest: input.planDigest,
    planRevision: input.planRevision,
    operationId: input.operationId,
    actionRef: Object.freeze({ id: input.actionRef.id, versionRef: input.actionRef.versionRef }),
    actionIntent: freezeJson(parsedIntent.value),
    providerId: input.providerId,
    connectionId: input.connectionId,
    adapterRef: input.adapterRef,
    runnerRef: input.runnerRef,
    secretRef: Object.freeze({
      version: input.secretRef.version,
      organizationId: input.secretRef.organizationId,
      projectId: input.secretRef.projectId,
      environment: input.secretRef.environment,
      provider: input.secretRef.provider,
      key: input.secretRef.key,
      ...(input.secretRef.versionRef === undefined ? {} : { versionRef: input.secretRef.versionRef }),
    }),
    idempotencyKey: input.idempotencyKey,
    grantId: input.grantId,
    grantNonce: input.grantNonce,
    reservationId: input.reservationId,
    reservationRevision: input.reservationRevision,
    workerId: input.workerId,
    leaseEpoch: input.leaseEpoch,
    expiresAtEpochMs: input.expiresAtEpochMs,
  });
}

function parseResolvedCredential(input: unknown): ViraPrivateRunnerResolvedCredential | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const keys = Object.keys(input);
  if (keys.length !== 4 || keys.some((key) => key !== "scope" && key !== "secretRef" && key !== "credential" && key !== "expiresAtEpochMs")) {
    return undefined;
  }
  const candidate = input as Partial<ViraPrivateRunnerResolvedCredential>;
  if (
    candidate.scope === undefined
    || candidate.secretRef === undefined
    || typeof candidate.credential !== "string"
    || candidate.credential.length < 8
    || candidate.credential.length > VIRA_PRIVATE_RUNNER_MAX_CREDENTIAL_LENGTH
    || !safePositive(candidate.expiresAtEpochMs)
  ) return undefined;
  return candidate as ViraPrivateRunnerResolvedCredential;
}

function parseAdapterResult(input: unknown): ViraPrivateRunnerDispatchResult | undefined {
  const parsed = parseJsonValue(input, "$.adapterResult");
  if (!parsed.ok || !isJsonObject(parsed.value)) return undefined;
  const value = parsed.value;
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "dispatch" && key !== "data") || !Object.hasOwn(value, "dispatch")) return undefined;
  if (value.dispatch !== "accepted" && value.dispatch !== "rejected") return undefined;
  if (Object.hasOwn(value, "data") && !isJsonObject(value.data)) return undefined;
  const data = Object.hasOwn(value, "data") ? freezeJson(value.data as JsonObject) : undefined;
  return Object.freeze({
    version: VIRA_PRIVATE_RUNNER_VERSION,
    dispatch: value.dispatch,
    ...(data === undefined ? {} : { data }),
  });
}

export async function runViraPrivateExecution(input: ViraPrivateRunnerInput): Promise<ViraPrivateRunnerResult> {
  if (
    input === null
    || typeof input !== "object"
    || !safePositive(input.nowEpochMs)
    || input.secretProvider === null
    || typeof input.secretProvider !== "object"
    || typeof input.secretProvider.resolve !== "function"
    || input.adapter === null
    || typeof input.adapter !== "object"
    || typeof input.adapter.invoke !== "function"
  ) return fail("INVALID_INPUT", "$", "Private Runner input is invalid");

  const permit = snapshotPermit(input.permit);
  if (!permit) return fail("INVALID_INPUT", "$.permit", "Private Runner requires an exact canonical Stage B permit");
  const nowEpochMs = input.nowEpochMs;
  const secretProvider = input.secretProvider;
  const adapter = input.adapter;

  if (nowEpochMs >= permit.expiresAtEpochMs) {
    return fail("PERMIT_EXPIRED", "$.permit.expiresAtEpochMs", "Stage B permit expired before private execution");
  }

  let rawCredential: unknown;
  try {
    rawCredential = await secretProvider.resolve({
      scope: permit.scope,
      secretRef: permit.secretRef,
    });
  } catch {
    return fail("SECRET_RESOLUTION_FAILED", "$.secretProvider", "scoped credential resolution failed closed");
  }

  const resolved = parseResolvedCredential(rawCredential);
  if (!resolved) {
    return fail("INVALID_SECRET_EVIDENCE", "$.secretProvider", "secret provider returned invalid scoped credential evidence");
  }
  if (!exactScope(resolved.scope, permit.scope) || !exactSecretRef(resolved.secretRef, permit.secretRef)) {
    return fail("SECRET_SCOPE_MISMATCH", "$.secretProvider", "resolved credential does not bind the exact permit scope and secretRef");
  }
  if (resolved.expiresAtEpochMs <= nowEpochMs || resolved.expiresAtEpochMs > permit.expiresAtEpochMs) {
    return fail("SECRET_EXPIRED", "$.secretProvider.expiresAtEpochMs", "resolved credential lifetime is not bounded by the current Stage B permit");
  }

  let rawResult: unknown;
  try {
    rawResult = await adapter.invoke({
      permit,
      credential: resolved.credential,
    });
  } catch {
    return fail("ADAPTER_UNCERTAIN", "$.adapter", "private adapter dispatch failed with uncertain external effect state");
  }

  const parsed = parseAdapterResult(rawResult);
  if (!parsed) {
    return fail("INVALID_ADAPTER_RESULT", "$.adapter", "private adapter returned a non-canonical dispatch result");
  }

  const resultJson: JsonObject = {
    version: parsed.version,
    dispatch: parsed.dispatch,
    ...(parsed.data === undefined ? {} : { data: parsed.data }),
  };
  if (containsCredential(resultJson, resolved.credential)) {
    return fail("SECRET_EXFILTRATION", "$.adapter", "private adapter result attempted to expose credential material");
  }

  return { ok: true, value: parsed };
}
