import type { ViraEnterpriseScope, ViraSecretRef } from "@vira-enterprise-genui/enterprise-context";
import { parseJsonValue, type JsonObject, type JsonValue } from "@vira-enterprise-genui/protocol";
import type { ViraPrivateRunnerSecretProvider } from "./index.js";

export const VIRA_PRIVATE_OBSERVATION_VERSION = "1" as const;
export const VIRA_PRIVATE_OBSERVATION_MAX_CREDENTIAL_LENGTH = 64 * 1024;

export interface ViraPrivateObservationAuthority {
  readonly version: typeof VIRA_PRIVATE_OBSERVATION_VERSION;
  readonly authorityId: string;
  readonly scope: ViraEnterpriseScope;
  readonly providerId: string;
  readonly connectionId: string;
  readonly actionIntent: JsonObject;
  readonly secretRef: ViraSecretRef;
  readonly expiresAtEpochMs: number;
}

export interface ViraPrivateObservationAdapter {
  readonly observe: (input: {
    readonly authority: ViraPrivateObservationAuthority;
    readonly credential: string;
  }) => Promise<unknown> | unknown;
}

export interface ViraPrivateObservationResult {
  readonly version: typeof VIRA_PRIVATE_OBSERVATION_VERSION;
  readonly data: JsonObject;
}

export type ViraPrivateObservationIssueCode =
  | "INVALID_INPUT"
  | "AUTHORITY_EXPIRED"
  | "SECRET_RESOLUTION_FAILED"
  | "INVALID_SECRET_EVIDENCE"
  | "SECRET_SCOPE_MISMATCH"
  | "SECRET_EXPIRED"
  | "ADAPTER_UNAVAILABLE"
  | "INVALID_ADAPTER_RESULT"
  | "SECRET_EXFILTRATION";

export type ViraPrivateObservationResultUnion =
  | { readonly ok: true; readonly value: ViraPrivateObservationResult }
  | { readonly ok: false; readonly issue: Readonly<{ readonly code: ViraPrivateObservationIssueCode; readonly path: string; readonly message: string }> };

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;

function fail(code: ViraPrivateObservationIssueCode, path: string, message: string): ViraPrivateObservationResultUnion {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
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

function snapshotAuthority(input: ViraPrivateObservationAuthority): ViraPrivateObservationAuthority | undefined {
  if (
    input === null
    || typeof input !== "object"
    || input.version !== VIRA_PRIVATE_OBSERVATION_VERSION
    || !safeToken(input.authorityId)
    || input.scope === null
    || typeof input.scope !== "object"
    || input.scope.version !== "1"
    || !safeToken(input.scope.organizationId)
    || !safeToken(input.scope.projectId)
    || (input.scope.environment !== "dev" && input.scope.environment !== "staging" && input.scope.environment !== "production")
    || !safeToken(input.providerId)
    || !safeToken(input.connectionId)
    || input.secretRef === null
    || typeof input.secretRef !== "object"
    || !safeToken(input.secretRef.provider)
    || !safeToken(input.secretRef.key)
    || !exactScope(input.scope, {
      version: input.secretRef.version,
      organizationId: input.secretRef.organizationId,
      projectId: input.secretRef.projectId,
      environment: input.secretRef.environment,
    })
    || !positive(input.expiresAtEpochMs)
  ) return undefined;
  const parsedIntent = parseJsonValue(input.actionIntent, "$.authority.actionIntent");
  if (!parsedIntent.ok || !isObject(parsedIntent.value)) return undefined;
  return Object.freeze({
    version: VIRA_PRIVATE_OBSERVATION_VERSION,
    authorityId: input.authorityId,
    scope: Object.freeze({ ...input.scope }),
    providerId: input.providerId,
    connectionId: input.connectionId,
    actionIntent: freezeJson(parsedIntent.value),
    secretRef: Object.freeze({ ...input.secretRef }),
    expiresAtEpochMs: input.expiresAtEpochMs,
  });
}

function parseCredential(input: unknown): Readonly<{
  readonly scope: ViraEnterpriseScope;
  readonly secretRef: ViraSecretRef;
  readonly credential: string;
  readonly expiresAtEpochMs: number;
}> | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const candidate = input as Partial<{
    scope: ViraEnterpriseScope;
    secretRef: ViraSecretRef;
    credential: string;
    expiresAtEpochMs: number;
  }>;
  if (
    candidate.scope === undefined
    || candidate.secretRef === undefined
    || typeof candidate.credential !== "string"
    || candidate.credential.length < 8
    || candidate.credential.length > VIRA_PRIVATE_OBSERVATION_MAX_CREDENTIAL_LENGTH
    || !positive(candidate.expiresAtEpochMs)
  ) return undefined;
  return candidate as Readonly<{
    scope: ViraEnterpriseScope;
    secretRef: ViraSecretRef;
    credential: string;
    expiresAtEpochMs: number;
  }>;
}

export async function runViraPrivateObservation(input: {
  readonly authority: ViraPrivateObservationAuthority;
  readonly nowEpochMs: number;
  readonly secretProvider: ViraPrivateRunnerSecretProvider;
  readonly adapter: ViraPrivateObservationAdapter;
}): Promise<ViraPrivateObservationResultUnion> {
  if (
    input === null
    || typeof input !== "object"
    || !positive(input.nowEpochMs)
    || input.secretProvider === null
    || typeof input.secretProvider !== "object"
    || typeof input.secretProvider.resolve !== "function"
    || input.adapter === null
    || typeof input.adapter !== "object"
    || typeof input.adapter.observe !== "function"
  ) return fail("INVALID_INPUT", "$", "Private observation input is invalid");
  const authority = snapshotAuthority(input.authority);
  if (!authority) return fail("INVALID_INPUT", "$.authority", "Private observation authority is invalid");
  if (input.nowEpochMs >= authority.expiresAtEpochMs) {
    return fail("AUTHORITY_EXPIRED", "$.authority.expiresAtEpochMs", "Private observation authority expired");
  }

  let rawCredential: unknown;
  try {
    rawCredential = await input.secretProvider.resolve({ scope: authority.scope, secretRef: authority.secretRef });
  } catch {
    return fail("SECRET_RESOLUTION_FAILED", "$.secretProvider", "private observation credential resolution failed closed");
  }
  const resolved = parseCredential(rawCredential);
  if (!resolved) return fail("INVALID_SECRET_EVIDENCE", "$.secretProvider", "private observation secret evidence is invalid");
  if (!exactScope(resolved.scope, authority.scope) || !exactSecretRef(resolved.secretRef, authority.secretRef)) {
    return fail("SECRET_SCOPE_MISMATCH", "$.secretProvider", "private observation credential scope does not match authority");
  }
  if (resolved.expiresAtEpochMs <= input.nowEpochMs || resolved.expiresAtEpochMs > authority.expiresAtEpochMs) {
    return fail("SECRET_EXPIRED", "$.secretProvider.expiresAtEpochMs", "private observation credential lifetime is invalid");
  }

  let raw: unknown;
  try {
    raw = await input.adapter.observe({ authority, credential: resolved.credential });
  } catch {
    return fail("ADAPTER_UNAVAILABLE", "$.adapter", "private observation adapter failed closed");
  }
  const parsed = parseJsonValue(raw, "$.adapterResult");
  if (!parsed.ok || !isObject(parsed.value)) {
    return fail("INVALID_ADAPTER_RESULT", "$.adapter", "private observation adapter returned invalid canonical JSON");
  }
  const data = freezeJson(parsed.value);
  if (containsCredential(data, resolved.credential)) {
    return fail("SECRET_EXFILTRATION", "$.adapter", "private observation adapter attempted to expose credential material");
  }
  return { ok: true, value: Object.freeze({ version: VIRA_PRIVATE_OBSERVATION_VERSION, data }) };
}
