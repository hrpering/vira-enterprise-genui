import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  RUNTIME_SESSION_CACHE_STATUSES,
  RUNTIME_SESSION_CONNECTIVITIES,
  RUNTIME_SESSION_CONTINUITIES,
  RUNTIME_SESSION_ID_MAX_LENGTH,
  RUNTIME_SESSION_INITIAL_REVISION,
  RUNTIME_SESSION_STATE_VERSION,
  RUNTIME_SESSION_VISIBILITIES,
  type RuntimeSessionCacheStatus,
  type RuntimeSessionConnectivity,
  type RuntimeSessionContinuity,
  type RuntimeSessionCreateResult,
  type RuntimeSessionParseResult,
  type RuntimeSessionRestoreResult,
  type RuntimeSessionState,
  type RuntimeSessionValidationCode,
  type RuntimeSessionVisibility,
} from "./types.js";

const sessionIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const createFields = new Set(["visibility", "connectivity"]);
const stateFields = new Set([
  "version",
  "sessionId",
  "revision",
  "visibility",
  "connectivity",
  "continuity",
  "cacheStatus",
]);
const visibilityValues = new Set<RuntimeSessionVisibility>(RUNTIME_SESSION_VISIBILITIES);
const connectivityValues = new Set<RuntimeSessionConnectivity>(RUNTIME_SESSION_CONNECTIVITIES);
const continuityValues = new Set<RuntimeSessionContinuity>(RUNTIME_SESSION_CONTINUITIES);
const cacheStatusValues = new Set<RuntimeSessionCacheStatus>(RUNTIME_SESSION_CACHE_STATUSES);

function validationFailure(
  code: RuntimeSessionValidationCode,
  path: string,
  message: string,
): RuntimeSessionCreateResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function restoreFailure(
  code: "INVALID_SESSION_STATE" | "REVISION_OVERFLOW",
  path: string,
  message: string,
): RuntimeSessionRestoreResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseObject(input: unknown): JsonObject | undefined {
  try {
    const parsed = parseJsonValue(input);
    return parsed.ok && isJsonObject(parsed.value) ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}

function hasUnknownField(value: JsonObject, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).some((key) => !allowed.has(key));
}

export function isRuntimeSessionId(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= RUNTIME_SESSION_ID_MAX_LENGTH
    && sessionIdPattern.test(value);
}

export function isRuntimeSessionVisibility(value: unknown): value is RuntimeSessionVisibility {
  return typeof value === "string" && visibilityValues.has(value as RuntimeSessionVisibility);
}

export function isRuntimeSessionConnectivity(value: unknown): value is RuntimeSessionConnectivity {
  return typeof value === "string" && connectivityValues.has(value as RuntimeSessionConnectivity);
}

export function isRuntimeSessionContinuity(value: unknown): value is RuntimeSessionContinuity {
  return typeof value === "string" && continuityValues.has(value as RuntimeSessionContinuity);
}

export function isRuntimeSessionCacheStatus(value: unknown): value is RuntimeSessionCacheStatus {
  return typeof value === "string" && cacheStatusValues.has(value as RuntimeSessionCacheStatus);
}

function canonicalState(
  sessionId: string,
  revision: number,
  visibility: RuntimeSessionVisibility,
  connectivity: RuntimeSessionConnectivity,
  continuity: RuntimeSessionContinuity,
  cacheStatus: RuntimeSessionCacheStatus,
): RuntimeSessionState {
  return Object.freeze({
    version: RUNTIME_SESSION_STATE_VERSION,
    sessionId,
    revision,
    visibility,
    connectivity,
    continuity,
    cacheStatus,
  });
}

export function createRuntimeSessionState(
  sessionId: unknown,
  input: unknown,
): RuntimeSessionCreateResult {
  if (!isRuntimeSessionId(sessionId)) {
    return validationFailure(
      "INVALID_SESSION_ID",
      "$.sessionId",
      `sessionId must use safe identifier characters and be at most ${RUNTIME_SESSION_ID_MAX_LENGTH} characters`,
    );
  }
  const fields = parseObject(input);
  if (!fields) {
    return validationFailure(
      "INVALID_TYPE",
      "$",
      "runtime session creation input must be a canonical JSON object",
    );
  }
  if (hasUnknownField(fields, createFields)) {
    return validationFailure("UNKNOWN_FIELD", "$", "runtime session creation input contains an unsupported field");
  }
  if (!isRuntimeSessionVisibility(fields.visibility)) {
    return validationFailure("INVALID_VISIBILITY", "$.visibility", "runtime session visibility is invalid");
  }
  if (!isRuntimeSessionConnectivity(fields.connectivity)) {
    return validationFailure("INVALID_CONNECTIVITY", "$.connectivity", "runtime session connectivity is invalid");
  }
  return {
    ok: true,
    value: canonicalState(
      sessionId,
      RUNTIME_SESSION_INITIAL_REVISION,
      fields.visibility,
      fields.connectivity,
      "live",
      "inactive",
    ),
  };
}

export function parseRuntimeSessionState(input: unknown): RuntimeSessionParseResult {
  const fields = parseObject(input);
  if (!fields) {
    return validationFailure("INVALID_TYPE", "$", "runtime session state must be a canonical JSON object");
  }
  if (hasUnknownField(fields, stateFields)) {
    return validationFailure("UNKNOWN_FIELD", "$", "runtime session state contains an unsupported field");
  }
  if (fields.version !== RUNTIME_SESSION_STATE_VERSION) {
    return validationFailure(
      "INVALID_VERSION",
      "$.version",
      `runtime session state version must be ${RUNTIME_SESSION_STATE_VERSION}`,
    );
  }
  if (!isRuntimeSessionId(fields.sessionId)) {
    return validationFailure("INVALID_SESSION_ID", "$.sessionId", "runtime session sessionId is invalid");
  }
  if (typeof fields.revision !== "number" || !Number.isSafeInteger(fields.revision) || fields.revision < 0) {
    return validationFailure(
      "INVALID_REVISION",
      "$.revision",
      "runtime session revision must be a non-negative safe integer",
    );
  }
  if (!isRuntimeSessionVisibility(fields.visibility)) {
    return validationFailure("INVALID_VISIBILITY", "$.visibility", "runtime session visibility is invalid");
  }
  if (!isRuntimeSessionConnectivity(fields.connectivity)) {
    return validationFailure("INVALID_CONNECTIVITY", "$.connectivity", "runtime session connectivity is invalid");
  }
  if (!isRuntimeSessionContinuity(fields.continuity)) {
    return validationFailure("INVALID_CONTINUITY", "$.continuity", "runtime session continuity is invalid");
  }
  if (!isRuntimeSessionCacheStatus(fields.cacheStatus)) {
    return validationFailure("INVALID_CACHE_STATUS", "$.cacheStatus", "runtime session cache status is invalid");
  }
  if (
    (fields.continuity === "live" && fields.cacheStatus !== "inactive")
    || (fields.continuity === "restored" && fields.cacheStatus !== "verification-required")
  ) {
    return validationFailure(
      "INVALID_SESSION_INVARIANT",
      "$",
      "runtime session continuity and cache status are inconsistent",
    );
  }
  return {
    ok: true,
    value: canonicalState(
      fields.sessionId,
      fields.revision,
      fields.visibility,
      fields.connectivity,
      fields.continuity,
      fields.cacheStatus,
    ),
  };
}

export function restoreRuntimeSessionState(input: unknown): RuntimeSessionRestoreResult {
  const parsed = parseRuntimeSessionState(input);
  if (!parsed.ok) {
    return restoreFailure("INVALID_SESSION_STATE", "$", "persisted runtime session state is invalid");
  }
  if (parsed.value.revision === Number.MAX_SAFE_INTEGER) {
    return restoreFailure("REVISION_OVERFLOW", "$.revision", "runtime session revision cannot be incremented safely");
  }
  const state = canonicalState(
    parsed.value.sessionId,
    parsed.value.revision + 1,
    parsed.value.visibility,
    parsed.value.connectivity,
    "restored",
    "verification-required",
  );
  return {
    ok: true,
    value: Object.freeze({ state, changed: true }),
  };
}
