import { createConnectorKitContract } from "@vira-enterprise-genui/adapter-sdk";
import { parseViraApplicationExactReference } from "@vira-enterprise-genui/application-package";
import { parseViraCapabilityExactReference } from "@vira-enterprise-genui/capability-contract";
import { createViraEnterpriseContext } from "@vira-enterprise-genui/enterprise-context";
import type { ViraEnterpriseEnvironmentName } from "@vira-enterprise-genui/enterprise-context";
import { isSemanticNamespace, parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import {
  VIRA_PROVIDER_CONNECTION_MAX_BINDINGS,
  VIRA_PROVIDER_CONNECTION_MAX_SCOPES,
  VIRA_PROVIDER_CONNECTION_STATES,
  VIRA_PROVIDER_CONNECTION_VERSION,
} from "./types.js";
import type {
  ViraProviderConnection,
  ViraProviderConnectionIssueCode,
  ViraProviderConnectionResult,
  ViraProviderConnectionTransition,
  ViraProviderOperationBinding,
} from "./types.js";

const fields = new Set(["version", "id", "providerId", "connectorId", "scope", "authProfileId", "secretRef", "grantedScopes", "state", "expiresAtEpochMs", "bindings"]);
const bindingFields = new Set(["operationId", "target"]);
const queryTargetFields = new Set(["kind", "capabilityRef"]);
const actionTargetFields = new Set(["kind", "actionRef"]);
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

function fail(code: ViraProviderConnectionIssueCode, path: string, message: string, sourceCode?: string): ViraProviderConnectionResult {
  return { ok: false, issue: { code, path, message, ...(sourceCode === undefined ? {} : { sourceCode }) } };
}
function object(value: JsonValue | undefined): value is JsonObject { return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value); }
function unknownField(value: JsonObject, allowed: Set<string>): string | undefined { return Object.keys(value).sort().find((key) => !allowed.has(key)); }
function scopeToken(value: unknown): value is string { return typeof value === "string" && value.length >= 1 && value.length <= 256 && value.trim() === value && !value.includes(" ") && !controlCharacterPattern.test(value); }
function frozenQueryBinding(operationId: string, capabilityRef: { readonly id: string; readonly versionRef: string }): ViraProviderOperationBinding {
  return Object.freeze({ operationId, target: Object.freeze({ kind: "query" as const, capabilityRef }) });
}
function frozenActionBinding(operationId: string, actionRef: { readonly id: string; readonly versionRef: string }): ViraProviderOperationBinding {
  return Object.freeze({ operationId, target: Object.freeze({ kind: "action" as const, actionRef }) });
}

export function createProviderConnection(input: unknown, connectorInput: unknown): ViraProviderConnectionResult {
  const connector = createConnectorKitContract(connectorInput);
  if (!connector.ok) return fail("INVALID_CONNECTOR", `$.connector${connector.issue.path.slice(1)}`, connector.issue.message, connector.issue.code);
  const parsed = parseJsonValue(input);
  if (!parsed.ok || !object(parsed.value)) return fail("INVALID_CONNECTION", parsed.ok ? "$" : parsed.issue.path, parsed.ok ? "provider connection must be canonical JSON object" : parsed.issue.reason);
  const root = parsed.value; const unknown = unknownField(root, fields);
  if (unknown) return fail("INVALID_CONNECTION", `$.${unknown}`, `unknown provider connection field: ${unknown}`);
  if (Object.keys(root).length !== fields.size || ![...fields].every((key) => Object.hasOwn(root, key))) return fail("INVALID_CONNECTION", "$", "provider connection is missing required fields");
  if (root.version !== VIRA_PROVIDER_CONNECTION_VERSION || typeof root.id !== "string" || !isSemanticNamespace(root.id) || typeof root.providerId !== "string" || !isSemanticNamespace(root.providerId) || typeof root.connectorId !== "string" || !isSemanticNamespace(root.connectorId)) return fail("INVALID_CONNECTION", "$", "provider connection identity is invalid");
  if (root.providerId !== connector.value.providerId) return fail("PROVIDER_MISMATCH", "$.providerId", "connection providerId must equal connector providerId");
  if (root.connectorId !== connector.value.id) return fail("CONNECTOR_MISMATCH", "$.connectorId", "connection connectorId must equal connector id");

  if (!object(root.scope) || root.scope.version !== "1" || typeof root.scope.organizationId !== "string" || typeof root.scope.projectId !== "string" || typeof root.scope.environment !== "string") return fail("INVALID_SCOPE", "$.scope", "enterprise scope is invalid");
  const context = createViraEnterpriseContext({ organizationId: root.scope.organizationId, projectId: root.scope.projectId, environments: [root.scope.environment] });
  if (!context.ok) return fail("INVALID_SCOPE", "$.scope", context.issue.message, context.issue.code);
  const canonicalScope = context.value.scope(root.scope.environment as ViraEnterpriseEnvironmentName);
  if (!canonicalScope.ok || Object.keys(root.scope).length !== 4) return fail("INVALID_SCOPE", "$.scope", canonicalScope.ok ? "enterprise scope has invalid shape" : canonicalScope.issue.message, canonicalScope.ok ? undefined : canonicalScope.issue.code);
  const secret = context.value.secretRef(root.secretRef);
  if (!secret.ok) return fail("INVALID_SECRET_REF", "$.secretRef", secret.issue.message, secret.issue.code);
  if (secret.value.environment !== canonicalScope.value.environment) return fail("SECRET_SCOPE_MISMATCH", "$.secretRef.environment", "SecretRef environment must match connection scope");

  if (typeof root.authProfileId !== "string") return fail("UNKNOWN_AUTH_PROFILE", "$.authProfileId", "authProfileId is invalid");
  const auth = connector.value.authProfiles.find((candidate) => candidate.id === root.authProfileId);
  if (!auth) return fail("UNKNOWN_AUTH_PROFILE", "$.authProfileId", "authProfileId does not exist in connector");
  const eligibleOperations = connector.value.operations.filter((operation) => operation.authProfileId === root.authProfileId);
  if (eligibleOperations.length < 1) return fail("INVALID_BINDINGS", "$.authProfileId", "selected auth profile has no connector operations");
  if (!Array.isArray(root.grantedScopes) || root.grantedScopes.length > VIRA_PROVIDER_CONNECTION_MAX_SCOPES) return fail("INVALID_GRANTED_SCOPE", "$.grantedScopes", "grantedScopes is invalid or exceeds limit");
  const grantedScopes: string[] = []; const granted = new Set<string>();
  for (let index = 0; index < root.grantedScopes.length; index += 1) {
    const candidate = root.grantedScopes[index];
    if (!scopeToken(candidate) || !auth.scopes.includes(candidate)) return fail("INVALID_GRANTED_SCOPE", `$.grantedScopes[${index}]`, "granted scope is invalid or not declared by auth profile");
    if (granted.has(candidate)) return fail("DUPLICATE_GRANTED_SCOPE", `$.grantedScopes[${index}]`, "duplicate granted scope");
    granted.add(candidate); grantedScopes.push(candidate);
  }

  if (typeof root.state !== "string" || !(VIRA_PROVIDER_CONNECTION_STATES as readonly string[]).includes(root.state)) return fail("INVALID_STATE", "$.state", "provider connection state is invalid");
  if (root.state !== "pending") return fail("INITIAL_STATE_REQUIRED", "$.state", "new provider connections must begin pending and transition explicitly");
  if (root.expiresAtEpochMs !== null && (typeof root.expiresAtEpochMs !== "number" || !Number.isSafeInteger(root.expiresAtEpochMs) || root.expiresAtEpochMs <= 0)) return fail("INVALID_EXPIRY", "$.expiresAtEpochMs", "expiry must be null or a positive safe epoch millisecond integer");
  if (!Array.isArray(root.bindings)) return fail("INVALID_BINDINGS", "$.bindings", "operation bindings must be an array");
  if (root.bindings.length > VIRA_PROVIDER_CONNECTION_MAX_BINDINGS) return fail("BINDING_LIMIT_EXCEEDED", "$.bindings", `operation bindings may contain at most ${VIRA_PROVIDER_CONNECTION_MAX_BINDINGS} entries`);

  const bindings: ViraProviderOperationBinding[] = []; const bound = new Set<string>();
  for (let index = 0; index < root.bindings.length; index += 1) {
    const raw = root.bindings[index];
    if (!object(raw) || unknownField(raw, bindingFields) !== undefined || Object.keys(raw).length !== bindingFields.size || typeof raw.operationId !== "string" || !object(raw.target)) return fail("INVALID_BINDINGS", `$.bindings[${index}]`, "operation binding is invalid");
    const operation = connector.value.operations.find((candidate) => candidate.id === raw.operationId);
    if (!operation) return fail("UNKNOWN_OPERATION", `$.bindings[${index}].operationId`, "binding references an unknown connector operation");
    if (operation.authProfileId !== root.authProfileId) return fail("OPERATION_AUTH_PROFILE_MISMATCH", `$.bindings[${index}].operationId`, "operation belongs to a different connector auth profile");
    if (bound.has(raw.operationId)) return fail("DUPLICATE_OPERATION_BINDING", `$.bindings[${index}].operationId`, "operation has more than one target binding");
    for (const requiredScope of operation.requiredScopes) if (!granted.has(requiredScope)) return fail("MISSING_REQUIRED_SCOPE", "$.grantedScopes", `connection is missing required scope ${requiredScope} for ${operation.id}`);

    if (operation.classification === "query") {
      if (raw.target.kind !== "query" || unknownField(raw.target, queryTargetFields) !== undefined || Object.keys(raw.target).length !== queryTargetFields.size) return fail("QUERY_REQUIRES_CAPABILITY", `$.bindings[${index}].target`, "query connector operations must bind to an exact Capability reference");
      const reference = parseViraCapabilityExactReference(raw.target.capabilityRef);
      if (!reference.ok) return fail("INVALID_TARGET_REFERENCE", `$.bindings[${index}].target.capabilityRef${reference.issue.path.slice(1)}`, reference.issue.message, reference.issue.code);
      bindings.push(frozenQueryBinding(operation.id, reference.value));
    } else {
      if (raw.target.kind !== "action" || unknownField(raw.target, actionTargetFields) !== undefined || Object.keys(raw.target).length !== actionTargetFields.size) return fail("EFFECT_REQUIRES_ACTION", `$.bindings[${index}].target`, "effect connector operations must bind to an exact Action reference");
      const reference = parseViraApplicationExactReference(raw.target.actionRef);
      if (!reference.ok) return fail("INVALID_TARGET_REFERENCE", `$.bindings[${index}].target.actionRef${reference.issue.path.slice(1)}`, reference.issue.message, reference.issue.code);
      bindings.push(frozenActionBinding(operation.id, reference.value));
    }
    bound.add(operation.id);
  }
  const missing = eligibleOperations.find((operation) => !bound.has(operation.id));
  if (missing) return fail("MISSING_OPERATION_BINDING", "$.bindings", `connector operation ${missing.id} has no canonical target binding for the selected auth profile`);

  const value: ViraProviderConnection = {
    version: VIRA_PROVIDER_CONNECTION_VERSION, id: root.id, providerId: root.providerId, connectorId: root.connectorId,
    scope: canonicalScope.value, authProfileId: root.authProfileId, secretRef: secret.value,
    grantedScopes: Object.freeze(grantedScopes), state: "pending",
    expiresAtEpochMs: root.expiresAtEpochMs as number | null, bindings: Object.freeze(bindings),
  };
  return { ok: true, value: Object.freeze(value) };
}

export function transitionProviderConnection(connection: ViraProviderConnection, transition: ViraProviderConnectionTransition, nowEpochMs: number): ViraProviderConnectionResult {
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs <= 0) return fail("INVALID_TRANSITION", "$.nowEpochMs", "transition time must be a positive safe epoch millisecond integer");
  const current = connection.state;
  let next: ViraProviderConnection["state"] | undefined;
  if (transition === "activate" && current === "pending" && (connection.expiresAtEpochMs === null || connection.expiresAtEpochMs > nowEpochMs)) next = "active";
  if (transition === "revoke" && (current === "pending" || current === "active")) next = "revoked";
  if (transition === "expire" && (current === "pending" || current === "active")) next = "expired";
  if (!next) return fail("INVALID_TRANSITION", "$.state", `cannot ${transition} provider connection from ${current}`);
  return { ok: true, value: Object.freeze({ ...connection, state: next }) };
}
