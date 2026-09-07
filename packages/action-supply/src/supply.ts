import { parseViraApplicationExactReference } from "@vira-enterprise-genui/application-package";
import type { ViraApplicationEnvironmentBinding } from "@vira-enterprise-genui/deployment-plane";
import {
  createViraEnterpriseContext,
  type ViraEnterpriseEnvironmentName,
  type ViraEnterpriseScope,
  type ViraSecretRef,
} from "@vira-enterprise-genui/enterprise-context";
import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_PROVIDER_CONNECTION_MAX_BINDINGS,
  VIRA_PROVIDER_CONNECTION_MAX_SCOPES,
  type ViraProviderConnection,
  type ViraProviderOperationBinding,
} from "@vira-enterprise-genui/provider-connection";
import { evaluateViraProviderTrust } from "@vira-enterprise-genui/provider-trust";
import {
  VIRA_ACTION_FRESHNESS_STRATEGIES,
  VIRA_ACTION_IDEMPOTENCY_STRATEGIES,
  VIRA_ACTION_RETRY_SAFETY,
  VIRA_ACTION_SUPPLY_VERSION,
  VIRA_ACTION_VERIFICATION_STRATEGIES,
  type ViraActionSupplyBehavior,
  type ViraActionSupplyIssueCode,
  type ViraActionSupplyResult,
  type ViraResolvedActionSupply,
} from "./types.js";

const INPUT_FIELDS = Object.freeze([
  "version",
  "bindingRef",
  "actionRef",
  "connection",
  "trustEvidence",
  "environmentBinding",
  "operationId",
  "runnerRef",
  "behavior",
  "nowEpochMs",
] as const);
const BEHAVIOR_FIELDS = Object.freeze([
  "idempotencyStrategy",
  "retrySafety",
  "verificationStrategy",
  "freshnessStrategy",
  "freshnessMaxAgeMs",
] as const);
const CONNECTION_FIELDS = Object.freeze([
  "version",
  "id",
  "providerId",
  "connectorId",
  "scope",
  "authProfileId",
  "secretRef",
  "grantedScopes",
  "state",
  "expiresAtEpochMs",
  "bindings",
] as const);
const BINDING_FIELDS = Object.freeze(["operationId", "target"] as const);
const ACTION_TARGET_FIELDS = Object.freeze(["kind", "actionRef"] as const);
const QUERY_TARGET_FIELDS = Object.freeze(["kind", "capabilityRef"] as const);
const EXACT_REF_FIELDS = Object.freeze(["id", "versionRef"] as const);
const SCOPE_FIELDS = Object.freeze(["version", "organizationId", "projectId", "environment"] as const);
const ENVIRONMENT_BINDING_FIELDS = Object.freeze([
  "version",
  "bindingRef",
  "scope",
  "providerIdentityRef",
  "location",
  "adapterRef",
  "secretRef",
  "trustStatus",
  "trustEvidenceRef",
] as const);

function fail(code: ViraActionSupplyIssueCode, path: string, message: string): ViraActionSupplyResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value: JsonObject, fields: readonly string[]): boolean {
  const allowed = new Set(fields);
  return Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field))
    && Object.keys(value).every((field) => allowed.has(field));
}

function safeToken(value: JsonValue | undefined, maxLength = 512): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= maxLength
    && value.trim() === value;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function exactSecret(left: ViraSecretRef, right: ViraSecretRef): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment
    && left.provider === right.provider
    && left.key === right.key
    && left.versionRef === right.versionRef;
}

function exactRef(
  left: { readonly id: string; readonly versionRef: string },
  right: { readonly id: string; readonly versionRef: string },
): boolean {
  return left.id === right.id && left.versionRef === right.versionRef;
}

function parseBehavior(input: JsonValue | undefined): { readonly ok: true; readonly value: ViraActionSupplyBehavior } | { readonly ok: false } {
  if (!object(input) || !exactFields(input, BEHAVIOR_FIELDS)) return { ok: false };
  if (
    typeof input.idempotencyStrategy !== "string"
    || !(VIRA_ACTION_IDEMPOTENCY_STRATEGIES as readonly string[]).includes(input.idempotencyStrategy)
    || typeof input.retrySafety !== "string"
    || !(VIRA_ACTION_RETRY_SAFETY as readonly string[]).includes(input.retrySafety)
    || typeof input.verificationStrategy !== "string"
    || !(VIRA_ACTION_VERIFICATION_STRATEGIES as readonly string[]).includes(input.verificationStrategy)
    || typeof input.freshnessStrategy !== "string"
    || !(VIRA_ACTION_FRESHNESS_STRATEGIES as readonly string[]).includes(input.freshnessStrategy)
  ) return { ok: false };

  const boundedAge = input.freshnessStrategy === "bounded-age";
  if (
    boundedAge
      ? typeof input.freshnessMaxAgeMs !== "number" || !Number.isSafeInteger(input.freshnessMaxAgeMs) || input.freshnessMaxAgeMs <= 0
      : input.freshnessMaxAgeMs !== null
  ) return { ok: false };

  return {
    ok: true,
    value: Object.freeze({
      idempotencyStrategy: input.idempotencyStrategy as ViraActionSupplyBehavior["idempotencyStrategy"],
      retrySafety: input.retrySafety as ViraActionSupplyBehavior["retrySafety"],
      verificationStrategy: input.verificationStrategy as ViraActionSupplyBehavior["verificationStrategy"],
      freshnessStrategy: input.freshnessStrategy as ViraActionSupplyBehavior["freshnessStrategy"],
      freshnessMaxAgeMs: input.freshnessMaxAgeMs as number | null,
    }),
  };
}

function parseScope(input: JsonValue | undefined): ViraEnterpriseScope | null {
  if (!object(input) || !exactFields(input, SCOPE_FIELDS)) return null;
  if (
    input.version !== "1"
    || typeof input.organizationId !== "string"
    || typeof input.projectId !== "string"
    || typeof input.environment !== "string"
  ) return null;
  const context = createViraEnterpriseContext({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environments: [input.environment as ViraEnterpriseEnvironmentName],
  });
  if (!context.ok) return null;
  const scope = context.value.scope(input.environment as ViraEnterpriseEnvironmentName);
  return scope.ok ? scope.value : null;
}

function parseSecret(input: JsonValue | undefined, scope: ViraEnterpriseScope): ViraSecretRef | null {
  const context = createViraEnterpriseContext({
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    environments: [scope.environment],
  });
  if (!context.ok) return null;
  const secret = context.value.secretRef(input);
  if (!secret.ok || secret.value.environment !== scope.environment) return null;
  return secret.value;
}

function parseConnection(input: JsonValue | undefined): ViraProviderConnection | null {
  if (!object(input) || !exactFields(input, CONNECTION_FIELDS)) return null;
  if (
    input.version !== "1"
    || typeof input.id !== "string" || !isSemanticNamespace(input.id)
    || typeof input.providerId !== "string" || !isSemanticNamespace(input.providerId)
    || typeof input.connectorId !== "string" || !isSemanticNamespace(input.connectorId)
    || !safeToken(input.authProfileId, 256)
    || typeof input.state !== "string"
    || !["pending", "active", "revoked", "expired"].includes(input.state)
    || (input.expiresAtEpochMs !== null && (typeof input.expiresAtEpochMs !== "number" || !Number.isSafeInteger(input.expiresAtEpochMs) || input.expiresAtEpochMs <= 0))
  ) return null;

  const scope = parseScope(input.scope);
  if (scope === null) return null;
  const secretRef = parseSecret(input.secretRef, scope);
  if (secretRef === null) return null;

  if (!Array.isArray(input.grantedScopes) || input.grantedScopes.length > VIRA_PROVIDER_CONNECTION_MAX_SCOPES) return null;
  const grantedScopes: string[] = [];
  for (const grantedScope of input.grantedScopes) {
    if (!safeToken(grantedScope, 256)) return null;
    grantedScopes.push(grantedScope);
  }

  if (!Array.isArray(input.bindings) || input.bindings.length > VIRA_PROVIDER_CONNECTION_MAX_BINDINGS) return null;
  const bindings: ViraProviderOperationBinding[] = [];
  const seenOperations = new Set<string>();
  for (const candidate of input.bindings) {
    if (!object(candidate) || !exactFields(candidate, BINDING_FIELDS) || !safeToken(candidate.operationId, 256) || !object(candidate.target)) return null;
    if (seenOperations.has(candidate.operationId)) return null;
    seenOperations.add(candidate.operationId);

    if (candidate.target.kind === "action") {
      if (!exactFields(candidate.target, ACTION_TARGET_FIELDS)) return null;
      const actionRef = parseViraApplicationExactReference(candidate.target.actionRef);
      if (!actionRef.ok) return null;
      bindings.push(Object.freeze({
        operationId: candidate.operationId,
        target: Object.freeze({ kind: "action" as const, actionRef: actionRef.value }),
      }));
      continue;
    }

    if (candidate.target.kind === "query") {
      if (!exactFields(candidate.target, QUERY_TARGET_FIELDS) || !object(candidate.target.capabilityRef) || !exactFields(candidate.target.capabilityRef, EXACT_REF_FIELDS)) return null;
      if (!safeToken(candidate.target.capabilityRef.id, 512) || !safeToken(candidate.target.capabilityRef.versionRef, 256)) return null;
      bindings.push(Object.freeze({
        operationId: candidate.operationId,
        target: Object.freeze({
          kind: "query" as const,
          capabilityRef: Object.freeze({
            id: candidate.target.capabilityRef.id,
            versionRef: candidate.target.capabilityRef.versionRef,
          }),
        }),
      }));
      continue;
    }

    return null;
  }

  return Object.freeze({
    version: "1" as const,
    id: input.id,
    providerId: input.providerId,
    connectorId: input.connectorId,
    scope,
    authProfileId: input.authProfileId,
    secretRef,
    grantedScopes: Object.freeze(grantedScopes),
    state: input.state as ViraProviderConnection["state"],
    expiresAtEpochMs: input.expiresAtEpochMs as number | null,
    bindings: Object.freeze(bindings),
  });
}

function parseEnvironmentBinding(input: JsonValue | undefined): ViraApplicationEnvironmentBinding | null {
  if (!object(input) || !exactFields(input, ENVIRONMENT_BINDING_FIELDS)) return null;
  if (
    input.version !== "1"
    || !safeToken(input.bindingRef)
    || !safeToken(input.providerIdentityRef)
    || !safeToken(input.location)
    || !safeToken(input.adapterRef)
    || (input.trustStatus !== "trusted" && input.trustStatus !== "untrusted")
    || !safeToken(input.trustEvidenceRef)
  ) return null;
  const scope = parseScope(input.scope);
  if (scope === null) return null;
  const secretRef = parseSecret(input.secretRef, scope);
  if (secretRef === null) return null;
  return Object.freeze({
    version: "1" as const,
    bindingRef: input.bindingRef,
    scope,
    providerIdentityRef: input.providerIdentityRef,
    location: input.location,
    adapterRef: input.adapterRef,
    secretRef,
    trustStatus: input.trustStatus,
    trustEvidenceRef: input.trustEvidenceRef,
  });
}

export function resolveViraActionSupply(input: unknown): ViraActionSupplyResult {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !object(parsed.value) || !exactFields(parsed.value, INPUT_FIELDS) || parsed.value.version !== VIRA_ACTION_SUPPLY_VERSION) {
    return fail("INVALID_INPUT", parsed.ok ? "$" : parsed.issue.path, parsed.ok ? "action supply resolution input must have the exact versioned shape" : parsed.issue.reason);
  }
  const root = parsed.value;
  if (typeof root.nowEpochMs !== "number" || !Number.isSafeInteger(root.nowEpochMs) || root.nowEpochMs <= 0) {
    return fail("INVALID_INPUT", "$.nowEpochMs", "action supply resolution time must be a positive safe epoch millisecond");
  }

  const actionRef = parseViraApplicationExactReference(root.actionRef);
  if (!actionRef.ok) return fail("INVALID_REFERENCE", `$.actionRef${actionRef.issue.path.slice(1)}`, actionRef.issue.message);
  const bindingRef = parseViraApplicationExactReference(root.bindingRef);
  if (!bindingRef.ok) return fail("INVALID_REFERENCE", `$.bindingRef${bindingRef.issue.path.slice(1)}`, bindingRef.issue.message);
  if (typeof root.operationId !== "string" || !isSemanticNamespace(root.operationId)) {
    return fail("INVALID_OPERATION", "$.operationId", "operationId must be a canonical semantic namespace");
  }
  if (typeof root.runnerRef !== "string" || !isSemanticNamespace(root.runnerRef)) {
    return fail("INVALID_RUNNER", "$.runnerRef", "runnerRef must be a canonical semantic namespace");
  }
  const behavior = parseBehavior(root.behavior);
  if (!behavior.ok) return fail("INVALID_BEHAVIOR", "$.behavior", "provider Action behavior strategy is invalid");
  const connection = parseConnection(root.connection);
  if (connection === null) return fail("INVALID_INPUT", "$.connection", "action supply requires an exact canonical provider connection snapshot");
  const environmentBinding = parseEnvironmentBinding(root.environmentBinding);
  if (environmentBinding === null) return fail("INVALID_INPUT", "$.environmentBinding", "action supply requires an exact canonical Application environment binding");

  if (environmentBinding.trustStatus !== "trusted") {
    return fail("UNTRUSTED_ENVIRONMENT_BINDING", "$.environmentBinding.trustStatus", "Action supply requires a trusted Application environment binding");
  }
  if (!exactScope(connection.scope, environmentBinding.scope)) {
    return fail("SCOPE_MISMATCH", "$.environmentBinding.scope", "provider connection and Application environment binding must have exact enterprise scope parity");
  }
  if (!exactSecret(connection.secretRef, environmentBinding.secretRef)) {
    return fail("SECRET_MISMATCH", "$.environmentBinding.secretRef", "provider connection and Application environment binding must reference the same SecretRef metadata");
  }

  const trust = evaluateViraProviderTrust({
    connection,
    evidence: root.trustEvidence,
    nowEpochMs: root.nowEpochMs,
  });
  if (!trust.ok) {
    if (trust.issue.code === "CONNECTION_NOT_ACTIVE") {
      return fail("CONNECTION_NOT_ACTIVE", "$.connection.state", trust.issue.message);
    }
    if (trust.issue.code === "CONNECTION_EXPIRED") {
      return fail("CONNECTION_EXPIRED", "$.connection.expiresAtEpochMs", trust.issue.message);
    }
    return fail("PROVIDER_TRUST_REJECTED", `$.trustEvidence${trust.issue.path === "$" ? "" : trust.issue.path.slice(1)}`, `${trust.issue.code}: ${trust.issue.message}`);
  }
  if (trust.value.evidenceId !== environmentBinding.trustEvidenceRef) {
    return fail("TRUST_EVIDENCE_MISMATCH", "$.environmentBinding.trustEvidenceRef", "Application environment binding must reference the exact provider trust evidence used for Action supply");
  }

  const operation = connection.bindings.find((candidate) => candidate.operationId === root.operationId);
  if (!operation || operation.target.kind !== "action") {
    return fail("ACTION_NOT_BOUND", "$.operationId", "provider connection operation is not bound to a protected Action");
  }
  if (!exactRef(operation.target.actionRef, actionRef.value)) {
    return fail("ACTION_MISMATCH", "$.actionRef", "requested ActionRef does not exactly match the provider operation binding");
  }

  const value: ViraResolvedActionSupply = Object.freeze({
    version: VIRA_ACTION_SUPPLY_VERSION,
    bindingRef: Object.freeze({ ...bindingRef.value }),
    actionRef: Object.freeze({ ...actionRef.value }),
    scope: Object.freeze({ ...connection.scope }),
    providerId: connection.providerId,
    providerIdentityRef: environmentBinding.providerIdentityRef,
    connectionId: connection.id,
    connectorId: connection.connectorId,
    operationId: root.operationId,
    adapterRef: environmentBinding.adapterRef,
    runnerRef: root.runnerRef,
    secretRef: Object.freeze({ ...connection.secretRef }),
    trustEvidenceRef: trust.value.evidenceId,
    trustValidUntilEpochMs: trust.value.validUntilEpochMs,
    behavior: behavior.value,
  });
  return { ok: true, value };
}
