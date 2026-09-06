import { isSemanticNamespace, parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { freezeAdapterData } from "../internal/freeze.js";
import {
  CONNECTOR_AUTH_KINDS,
  CONNECTOR_COMPLETION_KINDS,
  CONNECTOR_ERROR_NORMALIZATION_KINDS,
  CONNECTOR_HTTP_METHODS,
  CONNECTOR_IDEMPOTENCY_KINDS,
  CONNECTOR_IMPORT_KINDS,
  CONNECTOR_KIT_VERSION,
  CONNECTOR_MAX_AUTH_PROFILES,
  CONNECTOR_MAX_OPERATIONS,
  CONNECTOR_MAX_SCOPES,
  CONNECTOR_OPERATION_CLASSIFICATIONS,
  CONNECTOR_PAGINATION_KINDS,
  CONNECTOR_PROVIDER_EFFECTS,
  CONNECTOR_RATE_LIMIT_KINDS,
  CONNECTOR_RETRY_KINDS,
  CONNECTOR_TEXT_MAX_LENGTH,
  CONNECTOR_VERIFICATION_KINDS,
} from "./types.js";
import type {
  ConnectorAuthProfile,
  ConnectorKitContractResult,
  ConnectorKitValidationCode,
  ConnectorOperationDeclaration,
} from "./types.js";

const contractFields = new Set(["version", "id", "providerId", "source", "authProfiles", "operations", "sandbox"]);
const sourceFields = new Set(["kind", "reference"]);
const authFields = new Set(["id", "kind", "scopes"]);
const operationFields = new Set([
  "id", "providerEffect", "classification", "authProfileId", "requiredScopes", "method", "path",
  "resourceType", "inputSchemaRef", "outputSchemaRef", "pagination", "rateLimit", "completion",
  "idempotency", "retry", "verification", "errorNormalization",
]);
const sandboxFields = new Set(["testOperationId"]);
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

function failure(code: ConnectorKitValidationCode, path: string, message: string): ConnectorKitContractResult {
  return { ok: false, issue: { code, path, message } };
}
function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactFields(value: JsonObject, allowed: Set<string>, path: string): ConnectorKitContractResult | undefined {
  const unknown = Object.keys(value).sort().find((key) => !allowed.has(key));
  return unknown === undefined ? undefined : failure("UNKNOWN_FIELD", `${path}.${unknown}`, `unknown connector field: ${unknown}`);
}
function oneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}
function text(value: unknown, max: number = CONNECTOR_TEXT_MAX_LENGTH): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max && value.trim() === value && !controlCharacterPattern.test(value);
}
function scope(value: unknown): value is string {
  return text(value, 256) && !value.includes(" ");
}
function schemaRef(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && isSemanticNamespace(value));
}
function preflight(input: unknown): ConnectorKitContractResult | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  for (const [key, limit, code] of [
    ["authProfiles", CONNECTOR_MAX_AUTH_PROFILES, "AUTH_PROFILE_LIMIT_EXCEEDED"],
    ["operations", CONNECTOR_MAX_OPERATIONS, "OPERATION_LIMIT_EXCEEDED"],
  ] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor && "value" in descriptor && Array.isArray(descriptor.value) && descriptor.value.length > limit) {
      return failure(code, `$.${key}`, `${key} may contain at most ${limit} entries`);
    }
  }
  return undefined;
}

export function createConnectorKitContract(input: unknown): ConnectorKitContractResult {
  const bounded = preflight(input);
  if (bounded) return bounded;
  const parsed = parseJsonValue(input);
  if (!parsed.ok || !object(parsed.value)) return failure("INVALID_TYPE", parsed.ok ? "$" : parsed.issue.path, parsed.ok ? "connector contract must be a canonical JSON object" : parsed.issue.reason);
  const root = parsed.value;
  const rootUnknown = exactFields(root, contractFields, "$");
  if (rootUnknown) return rootUnknown;
  if (root.version !== CONNECTOR_KIT_VERSION) return failure("INVALID_VERSION", "$.version", `connector version must be ${CONNECTOR_KIT_VERSION}`);
  if (typeof root.id !== "string" || !isSemanticNamespace(root.id)) return failure("INVALID_ID", "$.id", "connector id must be a semantic namespace");
  if (typeof root.providerId !== "string" || !isSemanticNamespace(root.providerId)) return failure("INVALID_PROVIDER_ID", "$.providerId", "providerId must be a semantic namespace");

  if (!object(root.source)) return failure("INVALID_SOURCE", "$.source", "source must be an object");
  const sourceUnknown = exactFields(root.source, sourceFields, "$.source"); if (sourceUnknown) return sourceUnknown;
  if (!oneOf(CONNECTOR_IMPORT_KINDS, root.source.kind) || !text(root.source.reference)) return failure("INVALID_SOURCE", "$.source", "source kind/reference is invalid");

  if (!Array.isArray(root.authProfiles) || root.authProfiles.length < 1) return failure("INVALID_AUTH_PROFILES", "$.authProfiles", "authProfiles must be non-empty");
  if (root.authProfiles.length > CONNECTOR_MAX_AUTH_PROFILES) return failure("AUTH_PROFILE_LIMIT_EXCEEDED", "$.authProfiles", `authProfiles may contain at most ${CONNECTOR_MAX_AUTH_PROFILES} entries`);
  const authProfiles: ConnectorAuthProfile[] = [];
  const authIds = new Set<string>();
  for (let index = 0; index < root.authProfiles.length; index += 1) {
    const raw = root.authProfiles[index];
    if (!object(raw)) return failure("INVALID_AUTH_PROFILE", `$.authProfiles[${index}]`, "auth profile must be an object");
    const unknown = exactFields(raw, authFields, `$.authProfiles[${index}]`); if (unknown) return unknown;
    if (typeof raw.id !== "string" || !isSemanticNamespace(raw.id) || !oneOf(CONNECTOR_AUTH_KINDS, raw.kind) || !Array.isArray(raw.scopes)) return failure("INVALID_AUTH_PROFILE", `$.authProfiles[${index}]`, "auth profile declaration is invalid");
    if (authIds.has(raw.id)) return failure("DUPLICATE_AUTH_PROFILE", `$.authProfiles[${index}].id`, "duplicate auth profile id");
    if (raw.scopes.length > CONNECTOR_MAX_SCOPES) return failure("SCOPE_LIMIT_EXCEEDED", `$.authProfiles[${index}].scopes`, `auth profile may declare at most ${CONNECTOR_MAX_SCOPES} scopes`);
    const scopes: string[] = []; const seenScopes = new Set<string>();
    for (let scopeIndex = 0; scopeIndex < raw.scopes.length; scopeIndex += 1) {
      const candidate = raw.scopes[scopeIndex];
      if (!scope(candidate)) return failure("INVALID_SCOPE", `$.authProfiles[${index}].scopes[${scopeIndex}]`, "scope must be a trimmed bounded token");
      if (seenScopes.has(candidate)) return failure("DUPLICATE_SCOPE", `$.authProfiles[${index}].scopes[${scopeIndex}]`, "duplicate auth scope");
      seenScopes.add(candidate); scopes.push(candidate);
    }
    authIds.add(raw.id); authProfiles.push({ id: raw.id, kind: raw.kind, scopes });
  }

  if (!Array.isArray(root.operations) || root.operations.length < 1) return failure("INVALID_OPERATIONS", "$.operations", "operations must be non-empty");
  if (root.operations.length > CONNECTOR_MAX_OPERATIONS) return failure("OPERATION_LIMIT_EXCEEDED", "$.operations", `operations may contain at most ${CONNECTOR_MAX_OPERATIONS} entries`);
  const operations: ConnectorOperationDeclaration[] = []; const operationIds = new Set<string>();
  for (let index = 0; index < root.operations.length; index += 1) {
    const raw = root.operations[index];
    if (!object(raw)) return failure("INVALID_OPERATION", `$.operations[${index}]`, "operation must be an object");
    const unknown = exactFields(raw, operationFields, `$.operations[${index}]`); if (unknown) return unknown;
    if (typeof raw.id !== "string" || !isSemanticNamespace(raw.id)) return failure("INVALID_OPERATION", `$.operations[${index}].id`, "operation id must be a semantic namespace");
    if (operationIds.has(raw.id)) return failure("DUPLICATE_OPERATION", `$.operations[${index}].id`, "duplicate operation id");
    if (!oneOf(CONNECTOR_PROVIDER_EFFECTS, raw.providerEffect) || !oneOf(CONNECTOR_OPERATION_CLASSIFICATIONS, raw.classification)) return failure("INVALID_OPERATION", `$.operations[${index}]`, "operation effect/classification is invalid");
    if ((raw.providerEffect === "write") !== (raw.classification === "effect")) return failure("WRITE_AS_QUERY", `$.operations[${index}].classification`, "provider write effects must be classified as effect and reads must be query");
    if (!oneOf(CONNECTOR_HTTP_METHODS, raw.method)) return failure("INVALID_OPERATION", `$.operations[${index}].method`, "HTTP method is invalid");
    if ((raw.method === "GET" || raw.method === "HEAD") && raw.providerEffect !== "read") return failure("METHOD_EFFECT_MISMATCH", `$.operations[${index}].providerEffect`, `${raw.method} operations must be declared read`);
    if ((raw.method === "PUT" || raw.method === "PATCH" || raw.method === "DELETE") && raw.providerEffect !== "write") return failure("METHOD_EFFECT_MISMATCH", `$.operations[${index}].providerEffect`, `${raw.method} operations must be declared write`);
    if (typeof raw.authProfileId !== "string" || !authIds.has(raw.authProfileId)) return failure("UNKNOWN_AUTH_PROFILE", `$.operations[${index}].authProfileId`, "operation references an unknown auth profile");
    if (!Array.isArray(raw.requiredScopes) || raw.requiredScopes.length > CONNECTOR_MAX_SCOPES) return failure("SCOPE_LIMIT_EXCEEDED", `$.operations[${index}].requiredScopes`, "requiredScopes exceeds connector scope limit");
    const auth = authProfiles.find((candidate) => candidate.id === raw.authProfileId)!; const requiredScopes: string[] = []; const requiredSeen = new Set<string>();
    for (let scopeIndex = 0; scopeIndex < raw.requiredScopes.length; scopeIndex += 1) {
      const candidate = raw.requiredScopes[scopeIndex];
      if (!scope(candidate)) return failure("INVALID_SCOPE", `$.operations[${index}].requiredScopes[${scopeIndex}]`, "required scope is invalid");
      if (requiredSeen.has(candidate)) return failure("DUPLICATE_SCOPE", `$.operations[${index}].requiredScopes[${scopeIndex}]`, "duplicate required scope");
      if (!auth.scopes.includes(candidate)) return failure("UNDECLARED_SCOPE", `$.operations[${index}].requiredScopes[${scopeIndex}]`, "operation requires a scope not declared by its auth profile");
      requiredSeen.add(candidate); requiredScopes.push(candidate);
    }
    if (!text(raw.path) || !raw.path.startsWith("/") || raw.path.includes("://")) return failure("INVALID_OPERATION", `$.operations[${index}].path`, "operation path must be a bounded relative provider path");
    if (typeof raw.resourceType !== "string" || !isSemanticNamespace(raw.resourceType) || !schemaRef(raw.inputSchemaRef) || !schemaRef(raw.outputSchemaRef)) return failure("INVALID_OPERATION", `$.operations[${index}]`, "resource/schema mapping is invalid");
    if (!oneOf(CONNECTOR_PAGINATION_KINDS, raw.pagination) || !oneOf(CONNECTOR_RATE_LIMIT_KINDS, raw.rateLimit) || !oneOf(CONNECTOR_COMPLETION_KINDS, raw.completion) || !oneOf(CONNECTOR_IDEMPOTENCY_KINDS, raw.idempotency) || !oneOf(CONNECTOR_RETRY_KINDS, raw.retry) || !oneOf(CONNECTOR_VERIFICATION_KINDS, raw.verification) || !oneOf(CONNECTOR_ERROR_NORMALIZATION_KINDS, raw.errorNormalization)) return failure("INVALID_OPERATION", `$.operations[${index}]`, "operation execution declarations are invalid");
    if (raw.classification === "effect" && (raw.verification !== "postcondition" || raw.idempotency === "none" || raw.retry === "query-safe")) return failure("UNSAFE_EFFECT_POLICY", `$.operations[${index}]`, "effect operations require postcondition verification, explicit idempotency, and non-query retry semantics");
    operationIds.add(raw.id);
    operations.push({
      id: raw.id, providerEffect: raw.providerEffect, classification: raw.classification,
      authProfileId: raw.authProfileId, requiredScopes, method: raw.method, path: raw.path,
      resourceType: raw.resourceType, inputSchemaRef: raw.inputSchemaRef as string | null, outputSchemaRef: raw.outputSchemaRef as string | null,
      pagination: raw.pagination, rateLimit: raw.rateLimit, completion: raw.completion,
      idempotency: raw.idempotency, retry: raw.retry, verification: raw.verification, errorNormalization: raw.errorNormalization,
    });
  }

  const sandbox = root.sandbox;
  if (!object(sandbox)) return failure("INVALID_SANDBOX", "$.sandbox", "sandbox declaration must be an object");
  const sandboxUnknown = exactFields(sandbox, sandboxFields, "$.sandbox"); if (sandboxUnknown) return sandboxUnknown;
  if (typeof sandbox.testOperationId !== "string" || !operationIds.has(sandbox.testOperationId)) return failure("INVALID_SANDBOX", "$.sandbox.testOperationId", "sandbox must reference an existing operation");
  const sandboxOperation = operations.find((candidate) => candidate.id === sandbox.testOperationId)!;
  if (sandboxOperation.classification !== "query") return failure("UNSAFE_SANDBOX_OPERATION", "$.sandbox.testOperationId", "sandbox test operation must be query-only");

  return { ok: true, value: freezeAdapterData({
    version: CONNECTOR_KIT_VERSION, id: root.id, providerId: root.providerId,
    source: { kind: root.source.kind, reference: root.source.reference as string },
    authProfiles, operations, sandbox: { testOperationId: sandbox.testOperationId },
  }) };
}
