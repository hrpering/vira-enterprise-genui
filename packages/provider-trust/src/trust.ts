import {
  createViraEnterpriseContext,
  type ViraEnterpriseEnvironmentName,
  type ViraEnterpriseScope,
  type ViraSecretRef,
} from "@vira-enterprise-genui/enterprise-context";
import { isSemanticNamespace, parseJsonValue, type JsonObject, type JsonValue } from "@vira-enterprise-genui/protocol";
import type { ViraProviderConnection } from "@vira-enterprise-genui/provider-connection";
import {
  VIRA_PROVIDER_TRUST_HEALTH_STATES,
  VIRA_PROVIDER_TRUST_VERSION,
  type ViraProviderTrustDecisionResult,
  type ViraProviderTrustEvidence,
  type ViraProviderTrustEvidenceResult,
  type ViraProviderTrustEvaluationInput,
  type ViraProviderTrustHealth,
  type ViraProviderTrustIssue,
  type ViraProviderTrustIssueCode,
} from "./types.js";

const EVIDENCE_FIELDS = [
  "version",
  "id",
  "connectionId",
  "providerId",
  "scope",
  "credentialRef",
  "health",
  "issuedAtEpochMs",
  "expiresAtEpochMs",
  "revokedAtEpochMs",
] as const;
const SCOPE_FIELDS = ["version", "organizationId", "projectId", "environment"] as const;
const HEALTH_FIELDS = ["status", "checkedAtEpochMs"] as const;

function fail<T>(code: ViraProviderTrustIssueCode, path: string, message: string): { readonly ok: false; readonly issue: ViraProviderTrustIssue } {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): JsonObject | null {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function exactKeys(value: JsonObject, fields: readonly string[]): boolean {
  const allowed = new Set(fields);
  return Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field))
    && Object.keys(value).every((field) => allowed.has(field));
}

function positiveTime(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function sameScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function sameCredential(left: ViraSecretRef, right: ViraSecretRef): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment
    && left.provider === right.provider
    && left.key === right.key
    && left.versionRef === right.versionRef;
}

function canonicalScope(scopeValue: JsonValue | undefined): ViraProviderTrustEvidenceResult | { readonly ok: true; readonly value: ViraEnterpriseScope; readonly context: ReturnType<typeof createViraEnterpriseContext> extends { readonly ok: true; readonly value: infer T } ? T : never } {
  const scopeObject = object(scopeValue);
  if (!scopeObject || !exactKeys(scopeObject, SCOPE_FIELDS)) return fail("INVALID_SCOPE", "$.scope", "provider trust scope must be an exact enterprise scope");
  if (
    scopeObject.version !== "1"
    || typeof scopeObject.organizationId !== "string"
    || typeof scopeObject.projectId !== "string"
    || typeof scopeObject.environment !== "string"
  ) return fail("INVALID_SCOPE", "$.scope", "provider trust scope values are invalid");
  const context = createViraEnterpriseContext({
    organizationId: scopeObject.organizationId,
    projectId: scopeObject.projectId,
    environments: [scopeObject.environment as ViraEnterpriseEnvironmentName],
  });
  if (!context.ok) return fail("INVALID_SCOPE", "$.scope", context.issue.message);
  const scope = context.value.scope(scopeObject.environment as ViraEnterpriseEnvironmentName);
  if (!scope.ok) return fail("INVALID_SCOPE", "$.scope", scope.issue.message);
  return { ok: true, value: scope.value, context: context.value };
}

function canonicalConnectionIdentity(connection: ViraProviderConnection): ViraProviderTrustEvidenceResult | { readonly ok: true; readonly scope: ViraEnterpriseScope; readonly credentialRef: ViraSecretRef } {
  if (
    connection === null
    || typeof connection !== "object"
    || connection.version !== "1"
    || typeof connection.id !== "string"
    || !isSemanticNamespace(connection.id)
    || typeof connection.providerId !== "string"
    || !isSemanticNamespace(connection.providerId)
    || !["pending", "active", "revoked", "expired"].includes(connection.state)
    || (connection.expiresAtEpochMs !== null && !positiveTime(connection.expiresAtEpochMs))
  ) return fail("INVALID_CONNECTION", "$.connection", "provider connection identity or lifecycle is invalid");

  const context = createViraEnterpriseContext({
    organizationId: connection.scope.organizationId,
    projectId: connection.scope.projectId,
    environments: [connection.scope.environment],
  });
  if (!context.ok) return fail("INVALID_CONNECTION", "$.connection.scope", context.issue.message);
  const scope = context.value.scope(connection.scope.environment);
  if (!scope.ok || !sameScope(scope.value, connection.scope)) return fail("INVALID_CONNECTION", "$.connection.scope", "provider connection scope is invalid");
  const credential = context.value.secretRef(connection.secretRef);
  if (!credential.ok) return fail("INVALID_CONNECTION", "$.connection.secretRef", credential.issue.message);
  if (credential.value.environment !== scope.value.environment) return fail("INVALID_CONNECTION", "$.connection.secretRef", "provider connection credential scope is invalid");
  return { ok: true, scope: scope.value, credentialRef: credential.value };
}

export function parseViraProviderTrustEvidence(input: unknown): ViraProviderTrustEvidenceResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return fail("INVALID_EVIDENCE", parsed.issue.path, parsed.issue.reason);
  const root = object(parsed.value);
  if (!root || !exactKeys(root, EVIDENCE_FIELDS)) return fail("INVALID_EVIDENCE", "$", "provider trust evidence must be an exact object");
  if (
    root.version !== VIRA_PROVIDER_TRUST_VERSION
    || typeof root.id !== "string"
    || !isSemanticNamespace(root.id)
    || typeof root.connectionId !== "string"
    || !isSemanticNamespace(root.connectionId)
    || typeof root.providerId !== "string"
    || !isSemanticNamespace(root.providerId)
  ) return fail("INVALID_EVIDENCE", "$", "provider trust evidence identity is invalid");

  const scope = canonicalScope(root.scope);
  if (!scope.ok || !("context" in scope)) return scope;
  const credential = scope.context.secretRef(root.credentialRef);
  if (!credential.ok) return fail("INVALID_CREDENTIAL_REF", "$.credentialRef", credential.issue.message);
  if (credential.value.environment !== scope.value.environment) return fail("INVALID_CREDENTIAL_REF", "$.credentialRef.environment", "credential environment must match trust scope");

  const healthObject = object(root.health);
  if (
    !healthObject
    || !exactKeys(healthObject, HEALTH_FIELDS)
    || typeof healthObject.status !== "string"
    || !(VIRA_PROVIDER_TRUST_HEALTH_STATES as readonly string[]).includes(healthObject.status)
    || !positiveTime(healthObject.checkedAtEpochMs)
  ) return fail("INVALID_EVIDENCE", "$.health", "provider trust health is invalid");

  if (!positiveTime(root.issuedAtEpochMs) || !positiveTime(root.expiresAtEpochMs) || root.expiresAtEpochMs <= root.issuedAtEpochMs) {
    return fail("INVALID_EVIDENCE", "$.expiresAtEpochMs", "provider trust evidence expiry must be after issue time");
  }
  if (healthObject.checkedAtEpochMs < root.issuedAtEpochMs || healthObject.checkedAtEpochMs > root.expiresAtEpochMs) {
    return fail("INVALID_EVIDENCE", "$.health.checkedAtEpochMs", "health observation must fall inside the evidence validity interval");
  }
  if (
    root.revokedAtEpochMs !== null
    && (!positiveTime(root.revokedAtEpochMs) || root.revokedAtEpochMs < root.issuedAtEpochMs || root.revokedAtEpochMs > root.expiresAtEpochMs)
  ) return fail("INVALID_EVIDENCE", "$.revokedAtEpochMs", "revocation time must be null or inside the evidence validity interval");

  const health: ViraProviderTrustHealth = Object.freeze({
    status: healthObject.status as ViraProviderTrustHealth["status"],
    checkedAtEpochMs: healthObject.checkedAtEpochMs,
  });
  const evidence: ViraProviderTrustEvidence = Object.freeze({
    version: VIRA_PROVIDER_TRUST_VERSION,
    id: root.id,
    connectionId: root.connectionId,
    providerId: root.providerId,
    scope: scope.value,
    credentialRef: credential.value,
    health,
    issuedAtEpochMs: root.issuedAtEpochMs,
    expiresAtEpochMs: root.expiresAtEpochMs,
    revokedAtEpochMs: root.revokedAtEpochMs as number | null,
  });
  return { ok: true, value: evidence };
}

export function evaluateViraProviderTrust(input: ViraProviderTrustEvaluationInput): ViraProviderTrustDecisionResult {
  if (!positiveTime(input.nowEpochMs)) return fail("INVALID_CLOCK", "$.nowEpochMs", "provider trust evaluation clock is invalid");
  const connection = canonicalConnectionIdentity(input.connection);
  if (!connection.ok || !("scope" in connection)) return connection;
  const evidence = parseViraProviderTrustEvidence(input.evidence);
  if (!evidence.ok) return evidence;

  if (input.connection.id !== evidence.value.connectionId) return fail("CONNECTION_MISMATCH", "$.evidence.connectionId", "trust evidence connectionId must match the exact provider connection");
  if (input.connection.providerId !== evidence.value.providerId) return fail("PROVIDER_MISMATCH", "$.evidence.providerId", "trust evidence providerId must match the exact provider connection");
  if (!sameScope(connection.scope, evidence.value.scope)) return fail("SCOPE_MISMATCH", "$.evidence.scope", "trust evidence scope must match the exact provider connection scope");
  if (!sameCredential(connection.credentialRef, evidence.value.credentialRef)) return fail("CREDENTIAL_MISMATCH", "$.evidence.credentialRef", "trust evidence credentialRef must match the exact provider connection credential");
  if (input.connection.state !== "active") return fail("CONNECTION_NOT_ACTIVE", "$.connection.state", "provider connection must be active before it can be trusted");
  if (input.connection.expiresAtEpochMs !== null && input.nowEpochMs >= input.connection.expiresAtEpochMs) return fail("CONNECTION_EXPIRED", "$.connection.expiresAtEpochMs", "provider connection has expired");
  if (input.nowEpochMs < evidence.value.issuedAtEpochMs || input.nowEpochMs < evidence.value.health.checkedAtEpochMs) return fail("EVIDENCE_NOT_YET_VALID", "$.evidence", "provider trust evidence or health observation is from the future");
  if (input.nowEpochMs >= evidence.value.expiresAtEpochMs) return fail("EVIDENCE_EXPIRED", "$.evidence.expiresAtEpochMs", "provider trust evidence has expired");
  if (evidence.value.revokedAtEpochMs !== null && input.nowEpochMs >= evidence.value.revokedAtEpochMs) return fail("EVIDENCE_REVOKED", "$.evidence.revokedAtEpochMs", "provider trust evidence has been revoked");
  if (evidence.value.health.status !== "healthy") return fail("HEALTH_NOT_TRUSTED", "$.evidence.health.status", "only healthy provider trust evidence is accepted by the minimum trust boundary");

  const validUntilEpochMs = input.connection.expiresAtEpochMs === null
    ? evidence.value.expiresAtEpochMs
    : Math.min(input.connection.expiresAtEpochMs, evidence.value.expiresAtEpochMs);
  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_PROVIDER_TRUST_VERSION,
      trusted: true as const,
      evidenceId: evidence.value.id,
      connectionId: evidence.value.connectionId,
      providerId: evidence.value.providerId,
      scope: evidence.value.scope,
      validUntilEpochMs,
    }),
  };
}
