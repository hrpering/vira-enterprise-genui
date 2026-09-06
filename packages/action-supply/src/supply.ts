import { parseViraApplicationExactReference } from "@vira-enterprise-genui/application-package";
import type { ViraApplicationEnvironmentBinding } from "@vira-enterprise-genui/deployment-plane";
import type { ViraEnterpriseScope, ViraSecretRef } from "@vira-enterprise-genui/enterprise-context";
import { isSemanticNamespace } from "@vira-enterprise-genui/protocol";
import type { ViraProviderConnection } from "@vira-enterprise-genui/provider-connection";
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

function fail(code: ViraActionSupplyIssueCode, path: string, message: string): ViraActionSupplyResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const allowed = new Set(fields);
  return Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field))
    && Object.keys(value).every((field) => allowed.has(field));
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

function parseBehavior(input: unknown): { readonly ok: true; readonly value: ViraActionSupplyBehavior } | { readonly ok: false } {
  if (!record(input) || !exactFields(input, BEHAVIOR_FIELDS)) return { ok: false };
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

function canonicalConnection(input: unknown): input is ViraProviderConnection {
  if (!record(input)) return false;
  return input.version === "1"
    && typeof input.id === "string" && isSemanticNamespace(input.id)
    && typeof input.providerId === "string" && isSemanticNamespace(input.providerId)
    && typeof input.connectorId === "string" && isSemanticNamespace(input.connectorId)
    && record(input.scope)
    && record(input.secretRef)
    && Array.isArray(input.bindings)
    && typeof input.state === "string"
    && (input.expiresAtEpochMs === null || (typeof input.expiresAtEpochMs === "number" && Number.isSafeInteger(input.expiresAtEpochMs) && input.expiresAtEpochMs > 0));
}

function canonicalEnvironmentBinding(input: unknown): input is ViraApplicationEnvironmentBinding {
  if (!record(input)) return false;
  return input.version === "1"
    && typeof input.bindingRef === "string" && input.bindingRef.length > 0
    && record(input.scope)
    && typeof input.providerIdentityRef === "string" && input.providerIdentityRef.length > 0
    && typeof input.location === "string"
    && typeof input.adapterRef === "string" && input.adapterRef.length > 0
    && record(input.secretRef)
    && (input.trustStatus === "trusted" || input.trustStatus === "untrusted")
    && typeof input.trustEvidenceRef === "string" && input.trustEvidenceRef.length > 0;
}

export function resolveViraActionSupply(input: unknown): ViraActionSupplyResult {
  if (!record(input) || !exactFields(input, INPUT_FIELDS) || input.version !== VIRA_ACTION_SUPPLY_VERSION) {
    return fail("INVALID_INPUT", "$", "action supply resolution input must have the exact versioned shape");
  }
  if (typeof input.nowEpochMs !== "number" || !Number.isSafeInteger(input.nowEpochMs) || input.nowEpochMs <= 0) {
    return fail("INVALID_INPUT", "$.nowEpochMs", "action supply resolution time must be a positive safe epoch millisecond");
  }

  const actionRef = parseViraApplicationExactReference(input.actionRef);
  if (!actionRef.ok) return fail("INVALID_REFERENCE", `$.actionRef${actionRef.issue.path.slice(1)}`, actionRef.issue.message);
  const bindingRef = parseViraApplicationExactReference(input.bindingRef);
  if (!bindingRef.ok) return fail("INVALID_REFERENCE", `$.bindingRef${bindingRef.issue.path.slice(1)}`, bindingRef.issue.message);
  if (typeof input.operationId !== "string" || !isSemanticNamespace(input.operationId)) {
    return fail("INVALID_OPERATION", "$.operationId", "operationId must be a canonical semantic namespace");
  }
  if (typeof input.runnerRef !== "string" || !isSemanticNamespace(input.runnerRef)) {
    return fail("INVALID_RUNNER", "$.runnerRef", "runnerRef must be a canonical semantic namespace");
  }
  const behavior = parseBehavior(input.behavior);
  if (!behavior.ok) return fail("INVALID_BEHAVIOR", "$.behavior", "provider Action behavior strategy is invalid");
  if (!canonicalConnection(input.connection)) return fail("INVALID_INPUT", "$.connection", "action supply requires a canonical provider connection snapshot");
  if (!canonicalEnvironmentBinding(input.environmentBinding)) return fail("INVALID_INPUT", "$.environmentBinding", "action supply requires a canonical Application environment binding");

  const connection = input.connection;
  const environmentBinding = input.environmentBinding;
  if (connection.state !== "active") return fail("CONNECTION_NOT_ACTIVE", "$.connection.state", "provider connection must be active for Action supply");
  if (connection.expiresAtEpochMs !== null && connection.expiresAtEpochMs <= input.nowEpochMs) {
    return fail("CONNECTION_EXPIRED", "$.connection.expiresAtEpochMs", "provider connection expired before Action supply resolution");
  }
  if (environmentBinding.trustStatus !== "trusted") {
    return fail("UNTRUSTED_ENVIRONMENT_BINDING", "$.environmentBinding.trustStatus", "Action supply requires a trusted Application environment binding");
  }
  if (!exactScope(connection.scope, environmentBinding.scope)) {
    return fail("SCOPE_MISMATCH", "$.environmentBinding.scope", "provider connection and Application environment binding must have exact enterprise scope parity");
  }
  if (!exactSecret(connection.secretRef, environmentBinding.secretRef)) {
    return fail("SECRET_MISMATCH", "$.environmentBinding.secretRef", "provider connection and Application environment binding must reference the same SecretRef metadata");
  }

  const operation = connection.bindings.find((candidate) => candidate.operationId === input.operationId);
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
    operationId: input.operationId,
    adapterRef: environmentBinding.adapterRef,
    runnerRef: input.runnerRef,
    secretRef: Object.freeze({ ...connection.secretRef }),
    trustEvidenceRef: environmentBinding.trustEvidenceRef,
    behavior: behavior.value,
  });
  return { ok: true, value };
}
