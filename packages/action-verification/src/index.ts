import {
  createViraEnterpriseContext,
  type ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";
import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";

export const VIRA_ACTION_VERIFICATION_VERSION = "1" as const;
export const VIRA_ACTION_VERIFICATION_MAX_ASSERTIONS = 32 as const;
export const VIRA_ACTION_VERIFICATION_MAX_OBSERVATION_BYTES = 128 * 1024;
export const VIRA_ACTION_VERIFICATION_MAX_WINDOW_MS = 24 * 60 * 60 * 1_000;
export const VIRA_ACTION_PROVIDER_VERSION_KINDS = Object.freeze([
  "etag",
  "blob-sha",
  "version",
  "opaque",
] as const);
export const VIRA_ACTION_VERIFICATION_STRATEGIES = Object.freeze([
  "immediate-readback",
  "eventual-readback",
] as const);
export const VIRA_ACTION_POSTCONDITION_STATUSES = Object.freeze([
  "verified",
  "partial",
  "mismatch",
  "uncertain",
] as const);

export type ViraActionProviderVersionKind = (typeof VIRA_ACTION_PROVIDER_VERSION_KINDS)[number];
export type ViraActionVerificationStrategy = (typeof VIRA_ACTION_VERIFICATION_STRATEGIES)[number];
export type ViraActionPostconditionStatus = (typeof VIRA_ACTION_POSTCONDITION_STATUSES)[number];
export type ViraActionPreconditionStatus = "match" | "mismatch" | "unavailable";

export interface ViraActionProviderVersion {
  readonly kind: ViraActionProviderVersionKind;
  readonly value: string;
}

export interface ViraActionProviderObservation {
  readonly version: typeof VIRA_ACTION_VERIFICATION_VERSION;
  readonly scope: ViraEnterpriseScope;
  readonly providerId: string;
  readonly connectionId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly observedAtEpochMs: number;
  readonly providerVersion: ViraActionProviderVersion;
  readonly canonicalDigest: string;
  readonly data: JsonObject;
}

export type ViraActionVerificationAssertion =
  | {
      readonly path: string;
      readonly operator: "equals";
      readonly value: JsonValue;
    }
  | {
      readonly path: string;
      readonly operator: "absent";
    };

export interface ViraActionVerificationExpectation {
  readonly version: typeof VIRA_ACTION_VERIFICATION_VERSION;
  readonly scope: ViraEnterpriseScope;
  readonly transactionId: string;
  readonly planDigest: string;
  readonly planRevision: number;
  readonly operationId: string;
  readonly executionId: string;
  readonly providerId: string;
  readonly connectionId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly expectedBefore: Readonly<{
    readonly providerVersion?: ViraActionProviderVersion;
    readonly canonicalDigest?: string;
  }>;
  readonly postconditions: readonly ViraActionVerificationAssertion[];
  readonly strategy: ViraActionVerificationStrategy;
  readonly maxVerificationWindowMs: number;
}

export interface ViraActionPreconditionDecision {
  readonly status: ViraActionPreconditionStatus;
  readonly mismatches: readonly ("provider-version" | "canonical-digest")[];
}

export interface ViraActionPostconditionDecision {
  readonly status: ViraActionPostconditionStatus;
  readonly matchedAssertions: number;
  readonly totalAssertions: number;
}

export type ViraActionVerificationIssueCode =
  | "INVALID_INPUT"
  | "INVALID_SCOPE"
  | "INVALID_OBSERVATION"
  | "INVALID_EXPECTATION"
  | "OBSERVATION_IDENTITY_MISMATCH";

export interface ViraActionVerificationIssue {
  readonly code: ViraActionVerificationIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraActionVerificationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraActionVerificationIssue };

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const SCOPE_FIELDS = new Set(["version", "organizationId", "projectId", "environment"]);
const OBSERVATION_FIELDS = new Set([
  "version",
  "scope",
  "providerId",
  "connectionId",
  "resourceType",
  "resourceId",
  "observedAtEpochMs",
  "providerVersion",
  "canonicalDigest",
  "data",
]);
const EXPECTATION_FIELDS = new Set([
  "version",
  "scope",
  "transactionId",
  "planDigest",
  "planRevision",
  "operationId",
  "executionId",
  "providerId",
  "connectionId",
  "resourceType",
  "resourceId",
  "expectedBefore",
  "postconditions",
  "strategy",
  "maxVerificationWindowMs",
]);
const PROVIDER_VERSION_FIELDS = new Set(["kind", "value"]);
const EXPECTED_BEFORE_FIELDS = new Set(["providerVersion", "canonicalDigest"]);
const FORBIDDEN_OBSERVATION_KEYS = new Set([
  "authorization",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "credential",
  "password",
  "secret",
  "secretref",
]);
const FORBIDDEN_POINTER_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

function fail<T>(
  code: ViraActionVerificationIssueCode,
  path: string,
  message: string,
): ViraActionVerificationResult<T> {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function record(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value: JsonObject, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function exactOptionalFields(value: JsonObject, expected: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => expected.has(key));
}

function safeToken(value: JsonValue | undefined): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function positiveSafeInteger(value: JsonValue | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
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

function parseScope(input: JsonValue | undefined): ViraActionVerificationResult<ViraEnterpriseScope> {
  if (!record(input) || !exactFields(input, SCOPE_FIELDS)) {
    return fail("INVALID_SCOPE", "$.scope", "verification scope must use the exact enterprise scope shape");
  }
  if (
    input.version !== "1"
    || typeof input.organizationId !== "string"
    || typeof input.projectId !== "string"
    || typeof input.environment !== "string"
  ) return fail("INVALID_SCOPE", "$.scope", "verification scope identity is invalid");
  const context = createViraEnterpriseContext({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environments: [input.environment as ViraEnterpriseScope["environment"]],
  });
  if (!context.ok) return fail("INVALID_SCOPE", "$.scope", context.issue.message);
  const scope = context.value.scope(input.environment as ViraEnterpriseScope["environment"]);
  if (!scope.ok || scope.value.version !== input.version) {
    return fail("INVALID_SCOPE", "$.scope", scope.ok ? "verification scope version is invalid" : scope.issue.message);
  }
  return { ok: true, value: scope.value };
}

function parseProviderVersion(
  input: JsonValue | undefined,
  path: string,
): ViraActionVerificationResult<ViraActionProviderVersion> {
  if (!record(input) || !exactFields(input, PROVIDER_VERSION_FIELDS)) {
    return fail("INVALID_INPUT", path, "provider version must have exact kind/value fields");
  }
  if (
    typeof input.kind !== "string"
    || !VIRA_ACTION_PROVIDER_VERSION_KINDS.includes(input.kind as ViraActionProviderVersionKind)
    || typeof input.value !== "string"
    || input.value.length < 1
    || input.value.length > 512
    || input.value.trim() !== input.value
  ) return fail("INVALID_INPUT", path, "provider version is invalid");
  if (input.kind === "blob-sha" && !/^[a-fA-F0-9]{40,64}$/.test(input.value)) {
    return fail("INVALID_INPUT", `${path}.value`, "blob-sha provider version must be hexadecimal");
  }
  return {
    ok: true,
    value: Object.freeze({ kind: input.kind as ViraActionProviderVersionKind, value: input.value }),
  };
}

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function containsForbiddenObservationKey(value: JsonValue): boolean {
  if (Array.isArray(value)) return value.some((entry) => containsForbiddenObservationKey(entry));
  if (!record(value)) return false;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_OBSERVATION_KEYS.has(normalizedKey(key))) return true;
    if (containsForbiddenObservationKey(entry)) return true;
  }
  return false;
}

function cloneJsonObject(input: JsonValue | undefined, path: string): JsonObject | undefined {
  if (!record(input)) return undefined;
  const parsed = parseJsonValue(input, path);
  if (!parsed.ok || !record(parsed.value)) return undefined;
  if (new TextEncoder().encode(JSON.stringify(parsed.value)).byteLength > VIRA_ACTION_VERIFICATION_MAX_OBSERVATION_BYTES) {
    return undefined;
  }
  return deepFreeze(parsed.value);
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function exactProviderVersion(left: ViraActionProviderVersion, right: ViraActionProviderVersion): boolean {
  return left.kind === right.kind && left.value === right.value;
}

function exactObservationIdentity(
  expectation: ViraActionVerificationExpectation,
  observation: ViraActionProviderObservation,
): boolean {
  return exactScope(expectation.scope, observation.scope)
    && expectation.providerId === observation.providerId
    && expectation.connectionId === observation.connectionId
    && expectation.resourceType === observation.resourceType
    && expectation.resourceId === observation.resourceId;
}

function validJsonPointer(path: string): boolean {
  if (path.length < 1 || path.length > 256 || !path.startsWith("/")) return false;
  const segments = path.slice(1).split("/");
  if (segments.length > 16) return false;
  for (const raw of segments) {
    if (/~(?!0|1)/.test(raw)) return false;
    const segment = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (FORBIDDEN_POINTER_SEGMENTS.has(segment)) return false;
  }
  return true;
}

function parseAssertion(
  input: JsonValue,
  index: number,
): ViraActionVerificationResult<ViraActionVerificationAssertion> {
  const path = `$.postconditions[${index}]`;
  if (!record(input) || typeof input.path !== "string" || !validJsonPointer(input.path)) {
    return fail("INVALID_EXPECTATION", path, "postcondition assertion path is invalid");
  }
  if (input.operator === "absent") {
    if (!exactFields(input, new Set(["path", "operator"]))) {
      return fail("INVALID_EXPECTATION", path, "absent assertion must have exact path/operator fields");
    }
    return { ok: true, value: Object.freeze({ path: input.path, operator: "absent" as const }) };
  }
  if (input.operator === "equals") {
    if (!exactFields(input, new Set(["path", "operator", "value"]))) {
      return fail("INVALID_EXPECTATION", path, "equals assertion must have exact path/operator/value fields");
    }
    const parsed = parseJsonValue(input.value, `${path}.value`);
    if (!parsed.ok) return fail("INVALID_EXPECTATION", `${path}.value`, "assertion value must be canonical JSON");
    return {
      ok: true,
      value: Object.freeze({ path: input.path, operator: "equals" as const, value: deepFreeze(parsed.value) }),
    };
  }
  return fail("INVALID_EXPECTATION", `${path}.operator`, "postcondition assertion operator is invalid");
}

function decodePointerSegment(value: string): string {
  return value.replace(/~1/g, "/").replace(/~0/g, "~");
}

function resolvePointer(root: JsonObject, path: string): { readonly found: boolean; readonly value?: JsonValue } {
  let current: JsonValue = root;
  for (const raw of path.slice(1).split("/")) {
    const segment = decodePointerSegment(raw);
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/.test(segment)) return { found: false };
      const index = Number(segment);
      if (!Number.isSafeInteger(index) || index >= current.length) return { found: false };
      current = current[index]!;
      continue;
    }
    if (!record(current) || !Object.hasOwn(current, segment)) return { found: false };
    current = current[segment]!;
  }
  return { found: true, value: current };
}

function jsonEqual(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== typeof right) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((entry, index) => jsonEqual(entry, right[index]!));
  }
  if (!record(left) || !record(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
  return leftKeys.every((key) => jsonEqual(left[key]!, right[key]!));
}

export function createViraActionProviderObservation(input: unknown): ViraActionVerificationResult<ViraActionProviderObservation> {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !record(parsed.value) || !exactFields(parsed.value, OBSERVATION_FIELDS)) {
    return fail("INVALID_OBSERVATION", "$", "provider observation must be exact canonical JSON");
  }
  const value = parsed.value;
  const scope = parseScope(value.scope);
  if (!scope.ok) return scope;
  const providerVersion = parseProviderVersion(value.providerVersion, "$.providerVersion");
  if (!providerVersion.ok) return providerVersion;
  const data = cloneJsonObject(value.data, "$.data");
  if (
    value.version !== VIRA_ACTION_VERIFICATION_VERSION
    || !safeToken(value.providerId)
    || !safeToken(value.connectionId)
    || !safeToken(value.resourceType)
    || !safeToken(value.resourceId)
    || !positiveSafeInteger(value.observedAtEpochMs)
    || typeof value.canonicalDigest !== "string"
    || !SHA256_HEX.test(value.canonicalDigest)
    || data === undefined
    || containsForbiddenObservationKey(data)
  ) return fail("INVALID_OBSERVATION", "$", "provider observation identity/evidence is invalid");
  return {
    ok: true,
    value: deepFreeze({
      version: VIRA_ACTION_VERIFICATION_VERSION,
      scope: scope.value,
      providerId: value.providerId,
      connectionId: value.connectionId,
      resourceType: value.resourceType,
      resourceId: value.resourceId,
      observedAtEpochMs: value.observedAtEpochMs,
      providerVersion: providerVersion.value,
      canonicalDigest: value.canonicalDigest,
      data,
    }),
  };
}

export function createViraActionVerificationExpectation(input: unknown): ViraActionVerificationResult<ViraActionVerificationExpectation> {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !record(parsed.value) || !exactFields(parsed.value, EXPECTATION_FIELDS)) {
    return fail("INVALID_EXPECTATION", "$", "verification expectation must be exact canonical JSON");
  }
  const value = parsed.value;
  const scope = parseScope(value.scope);
  if (!scope.ok) return scope;
  if (!record(value.expectedBefore) || !exactOptionalFields(value.expectedBefore, EXPECTED_BEFORE_FIELDS)) {
    return fail("INVALID_EXPECTATION", "$.expectedBefore", "expectedBefore has invalid fields");
  }
  let expectedProviderVersion: ViraActionProviderVersion | undefined;
  if (Object.hasOwn(value.expectedBefore, "providerVersion")) {
    const parsedVersion = parseProviderVersion(value.expectedBefore.providerVersion, "$.expectedBefore.providerVersion");
    if (!parsedVersion.ok) return parsedVersion;
    expectedProviderVersion = parsedVersion.value;
  }
  const expectedDigest = value.expectedBefore.canonicalDigest;
  if (expectedDigest !== undefined && (typeof expectedDigest !== "string" || !SHA256_HEX.test(expectedDigest))) {
    return fail("INVALID_EXPECTATION", "$.expectedBefore.canonicalDigest", "expected before digest is invalid");
  }
  if (expectedProviderVersion === undefined && expectedDigest === undefined) {
    return fail("INVALID_EXPECTATION", "$.expectedBefore", "at least one before-version or before-digest precondition is required");
  }
  if (!Array.isArray(value.postconditions) || value.postconditions.length < 1 || value.postconditions.length > VIRA_ACTION_VERIFICATION_MAX_ASSERTIONS) {
    return fail("INVALID_EXPECTATION", "$.postconditions", "postcondition assertion count is invalid");
  }
  const assertions: ViraActionVerificationAssertion[] = [];
  const seenPaths = new Set<string>();
  for (let index = 0; index < value.postconditions.length; index += 1) {
    const assertion = parseAssertion(value.postconditions[index]!, index);
    if (!assertion.ok) return assertion;
    if (seenPaths.has(assertion.value.path)) {
      return fail("INVALID_EXPECTATION", `$.postconditions[${index}].path`, "postcondition assertion path is duplicated");
    }
    seenPaths.add(assertion.value.path);
    assertions.push(assertion.value);
  }
  if (
    value.version !== VIRA_ACTION_VERIFICATION_VERSION
    || !safeToken(value.transactionId)
    || typeof value.planDigest !== "string"
    || !SHA256_HEX.test(value.planDigest)
    || !positiveSafeInteger(value.planRevision)
    || !safeToken(value.operationId)
    || !safeToken(value.executionId)
    || !safeToken(value.providerId)
    || !safeToken(value.connectionId)
    || !safeToken(value.resourceType)
    || !safeToken(value.resourceId)
    || typeof value.strategy !== "string"
    || !VIRA_ACTION_VERIFICATION_STRATEGIES.includes(value.strategy as ViraActionVerificationStrategy)
    || !positiveSafeInteger(value.maxVerificationWindowMs)
    || value.maxVerificationWindowMs > VIRA_ACTION_VERIFICATION_MAX_WINDOW_MS
  ) return fail("INVALID_EXPECTATION", "$", "verification expectation identity/strategy is invalid");
  return {
    ok: true,
    value: deepFreeze({
      version: VIRA_ACTION_VERIFICATION_VERSION,
      scope: scope.value,
      transactionId: value.transactionId,
      planDigest: value.planDigest,
      planRevision: value.planRevision,
      operationId: value.operationId,
      executionId: value.executionId,
      providerId: value.providerId,
      connectionId: value.connectionId,
      resourceType: value.resourceType,
      resourceId: value.resourceId,
      expectedBefore: {
        ...(expectedProviderVersion === undefined ? {} : { providerVersion: expectedProviderVersion }),
        ...(expectedDigest === undefined ? {} : { canonicalDigest: expectedDigest }),
      },
      postconditions: Object.freeze(assertions),
      strategy: value.strategy as ViraActionVerificationStrategy,
      maxVerificationWindowMs: value.maxVerificationWindowMs,
    }),
  };
}

export function evaluateViraActionPrecondition(input: {
  readonly expectation: ViraActionVerificationExpectation;
  readonly observation?: ViraActionProviderObservation;
}): ViraActionVerificationResult<ViraActionPreconditionDecision> {
  if (input === null || typeof input !== "object" || input.expectation === null || typeof input.expectation !== "object") {
    return fail("INVALID_INPUT", "$", "precondition evaluation input is invalid");
  }
  if (input.observation === undefined) {
    return { ok: true, value: Object.freeze({ status: "unavailable" as const, mismatches: Object.freeze([]) }) };
  }
  if (!exactObservationIdentity(input.expectation, input.observation)) {
    return fail("OBSERVATION_IDENTITY_MISMATCH", "$.observation", "provider observation does not match exact expectation identity");
  }
  const mismatches: ("provider-version" | "canonical-digest")[] = [];
  const expectedVersion = input.expectation.expectedBefore.providerVersion;
  if (expectedVersion !== undefined && !exactProviderVersion(expectedVersion, input.observation.providerVersion)) {
    mismatches.push("provider-version");
  }
  const expectedDigest = input.expectation.expectedBefore.canonicalDigest;
  if (expectedDigest !== undefined && expectedDigest !== input.observation.canonicalDigest) {
    mismatches.push("canonical-digest");
  }
  return {
    ok: true,
    value: Object.freeze({
      status: mismatches.length === 0 ? "match" as const : "mismatch" as const,
      mismatches: Object.freeze(mismatches),
    }),
  };
}

export function evaluateViraActionPostcondition(input: {
  readonly expectation: ViraActionVerificationExpectation;
  readonly observation?: ViraActionProviderObservation;
}): ViraActionVerificationResult<ViraActionPostconditionDecision> {
  if (input === null || typeof input !== "object" || input.expectation === null || typeof input.expectation !== "object") {
    return fail("INVALID_INPUT", "$", "postcondition evaluation input is invalid");
  }
  if (input.observation === undefined) {
    return {
      ok: true,
      value: Object.freeze({
        status: "uncertain" as const,
        matchedAssertions: 0,
        totalAssertions: input.expectation.postconditions.length,
      }),
    };
  }
  if (!exactObservationIdentity(input.expectation, input.observation)) {
    return fail("OBSERVATION_IDENTITY_MISMATCH", "$.observation", "provider observation does not match exact expectation identity");
  }
  let matched = 0;
  for (const assertion of input.expectation.postconditions) {
    const resolved = resolvePointer(input.observation.data, assertion.path);
    const passed = assertion.operator === "absent"
      ? !resolved.found
      : resolved.found && resolved.value !== undefined && jsonEqual(resolved.value, assertion.value);
    if (passed) matched += 1;
  }
  const total = input.expectation.postconditions.length;
  const status: ViraActionPostconditionStatus = matched === total
    ? "verified"
    : matched > 0
      ? "partial"
      : "mismatch";
  return {
    ok: true,
    value: Object.freeze({ status, matchedAssertions: matched, totalAssertions: total }),
  };
}
