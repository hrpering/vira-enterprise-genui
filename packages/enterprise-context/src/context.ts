import { isSemanticNamespace, parseJsonValue, type JsonObject, type JsonValue } from "@vira-enterprise-genui/protocol";
import {
  VIRA_ENTERPRISE_CONTEXT_VERSION,
  VIRA_ENTERPRISE_ENVIRONMENTS,
  VIRA_ENTERPRISE_PRINCIPAL_KINDS,
  type ViraEnterpriseContext,
  type ViraEnterpriseContextCreateResult,
  type ViraEnterpriseContextIssue,
  type ViraEnterpriseContextIssueCode,
  type ViraEnterpriseEnvironmentName,
  type ViraEnterprisePrincipal,
  type ViraEnterpriseScope,
  type ViraSecretLease,
  type ViraSecretRef,
} from "./types.js";

const idPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const principalPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const secretKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/;
const leasePattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/;
function issue(code: ViraEnterpriseContextIssueCode, path: string, message: string): ViraEnterpriseContextIssue { return Object.freeze({ code, path, message }); }
function object(value: JsonValue | undefined): value is JsonObject { return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value); }
function validId(value: unknown): value is string { return typeof value === "string" && idPattern.test(value); }
function validEnvironment(value: unknown): value is ViraEnterpriseEnvironmentName { return typeof value === "string" && VIRA_ENTERPRISE_ENVIRONMENTS.includes(value as ViraEnterpriseEnvironmentName); }
function parseScope(input: unknown): ViraEnterpriseScope | undefined {
  const parsed = parseJsonValue(input, "$.scope"); if (!parsed.ok || !object(parsed.value)) return undefined;
  const keys = Object.keys(parsed.value); if (keys.length !== 4 || !["version", "organizationId", "projectId", "environment"].every((key) => Object.hasOwn(parsed.value, key))) return undefined;
  if (parsed.value.version !== VIRA_ENTERPRISE_CONTEXT_VERSION || !validId(parsed.value.organizationId) || !validId(parsed.value.projectId) || !validEnvironment(parsed.value.environment)) return undefined;
  return Object.freeze({ version: VIRA_ENTERPRISE_CONTEXT_VERSION, organizationId: parsed.value.organizationId, projectId: parsed.value.projectId, environment: parsed.value.environment });
}
function parsePrincipal(input: unknown): ViraEnterprisePrincipal | undefined {
  const parsed = parseJsonValue(input, "$.principal"); if (!parsed.ok || !object(parsed.value)) return undefined;
  const keys = Object.keys(parsed.value); if (keys.length !== 4 || !["version", "kind", "id", "organizationId"].every((key) => Object.hasOwn(parsed.value, key))) return undefined;
  if (parsed.value.version !== VIRA_ENTERPRISE_CONTEXT_VERSION || typeof parsed.value.kind !== "string" || !VIRA_ENTERPRISE_PRINCIPAL_KINDS.includes(parsed.value.kind as ViraEnterprisePrincipal["kind"]) || typeof parsed.value.id !== "string" || !principalPattern.test(parsed.value.id) || !validId(parsed.value.organizationId)) return undefined;
  return Object.freeze({ version: VIRA_ENTERPRISE_CONTEXT_VERSION, kind: parsed.value.kind as ViraEnterprisePrincipal["kind"], id: parsed.value.id, organizationId: parsed.value.organizationId });
}
function parseSecret(input: unknown): ViraSecretRef | undefined {
  const parsed = parseJsonValue(input, "$.secret"); if (!parsed.ok || !object(parsed.value)) return undefined;
  const allowed = new Set(["version", "organizationId", "projectId", "environment", "provider", "key", "versionRef"]); const keys = Object.keys(parsed.value); if (keys.some((key) => !allowed.has(key))) return undefined;
  for (const required of ["version", "organizationId", "projectId", "environment", "provider", "key"]) if (!Object.hasOwn(parsed.value, required)) return undefined;
  if (parsed.value.version !== VIRA_ENTERPRISE_CONTEXT_VERSION || !validId(parsed.value.organizationId) || !validId(parsed.value.projectId) || !validEnvironment(parsed.value.environment) || typeof parsed.value.provider !== "string" || !isSemanticNamespace(parsed.value.provider) || typeof parsed.value.key !== "string" || !secretKeyPattern.test(parsed.value.key)) return undefined;
  const versionRef = Object.hasOwn(parsed.value, "versionRef") ? parsed.value.versionRef : undefined; if (versionRef !== undefined && (typeof versionRef !== "string" || !secretKeyPattern.test(versionRef))) return undefined;
  return Object.freeze({ version: VIRA_ENTERPRISE_CONTEXT_VERSION, organizationId: parsed.value.organizationId, projectId: parsed.value.projectId, environment: parsed.value.environment, provider: parsed.value.provider, key: parsed.value.key, ...(versionRef === undefined ? {} : { versionRef }) });
}
function parseLease(input: unknown, scope: ViraEnterpriseScope, secret: ViraSecretRef): ViraSecretLease | undefined {
  const parsed = parseJsonValue(input, "$.lease"); if (!parsed.ok || !object(parsed.value)) return undefined;
  const required = ["version", "leaseRef", "organizationId", "projectId", "environment", "provider", "key"];
  const allowed = new Set([...required, "versionRef"]); const keys = Object.keys(parsed.value);
  if (keys.some((key) => !allowed.has(key)) || !required.every((key) => Object.hasOwn(parsed.value, key))) return undefined;
  if (parsed.value.version !== VIRA_ENTERPRISE_CONTEXT_VERSION || typeof parsed.value.leaseRef !== "string" || !leasePattern.test(parsed.value.leaseRef) || parsed.value.organizationId !== scope.organizationId || parsed.value.projectId !== scope.projectId || parsed.value.environment !== scope.environment || parsed.value.provider !== secret.provider || parsed.value.key !== secret.key) return undefined;
  const leaseVersionRef = Object.hasOwn(parsed.value, "versionRef") ? parsed.value.versionRef : undefined;
  if (secret.versionRef === undefined ? leaseVersionRef !== undefined : leaseVersionRef !== secret.versionRef) return undefined;
  return Object.freeze({ version: VIRA_ENTERPRISE_CONTEXT_VERSION, leaseRef: parsed.value.leaseRef, organizationId: scope.organizationId, projectId: scope.projectId, environment: scope.environment, provider: secret.provider, key: secret.key, ...(secret.versionRef === undefined ? {} : { versionRef: secret.versionRef }) });
}
export function createViraEnterpriseContext(input: unknown): ViraEnterpriseContextCreateResult {
  const parsed = parseJsonValue(input, "$" ); if (!parsed.ok || !object(parsed.value)) return { ok: false, issue: issue("INVALID_CONTEXT", "$", "enterprise context input must be canonical JSON") };
  const keys = Object.keys(parsed.value); if (keys.length !== 3 || !["organizationId", "projectId", "environments"].every((key) => Object.hasOwn(parsed.value, key))) return { ok: false, issue: issue("INVALID_CONTEXT", "$", "enterprise context input has invalid shape") };
  if (!validId(parsed.value.organizationId) || !validId(parsed.value.projectId) || !Array.isArray(parsed.value.environments) || parsed.value.environments.length < 1 || parsed.value.environments.length > VIRA_ENTERPRISE_ENVIRONMENTS.length) return { ok: false, issue: issue("INVALID_CONTEXT", "$", "organization, project, or environment set is invalid") };
  const environments = new Set<ViraEnterpriseEnvironmentName>(); for (const environment of parsed.value.environments) { if (!validEnvironment(environment) || environments.has(environment)) return { ok: false, issue: issue("INVALID_CONTEXT", "$.environments", "environment set contains invalid or duplicate entries") }; environments.add(environment); }
  const organizationId = parsed.value.organizationId; const projectId = parsed.value.projectId;
  const context: ViraEnterpriseContext = {
    version: VIRA_ENTERPRISE_CONTEXT_VERSION, organizationId, projectId,
    scope(environment) { if (!validEnvironment(environment)) return { ok: false, issue: issue("INVALID_SCOPE", "$.environment", "environment is invalid") }; if (!environments.has(environment)) return { ok: false, issue: issue("ENVIRONMENT_NOT_REGISTERED", "$.environment", "environment is not registered for this project") }; return { ok: true, value: Object.freeze({ version: VIRA_ENTERPRISE_CONTEXT_VERSION, organizationId, projectId, environment }) }; },
    principal(principalInput) { const principal = parsePrincipal(principalInput); if (!principal) return { ok: false, issue: issue("INVALID_PRINCIPAL", "$.principal", "enterprise principal is invalid") }; if (principal.organizationId !== organizationId) return { ok: false, issue: issue("CROSS_ORGANIZATION", "$.principal.organizationId", "principal belongs to another organization") }; return { ok: true, value: principal }; },
    secretRef(secretInput) { const secret = parseSecret(secretInput); if (!secret) return { ok: false, issue: issue("INVALID_SECRET_REF", "$.secret", "SecretRef is invalid") }; if (secret.organizationId !== organizationId || secret.projectId !== projectId) return { ok: false, issue: issue("CROSS_PROJECT_SECRET", "$.secret", "SecretRef belongs to another organization/project") }; if (!environments.has(secret.environment)) return { ok: false, issue: issue("ENVIRONMENT_NOT_REGISTERED", "$.secret.environment", "SecretRef environment is not registered for this project") }; return { ok: true, value: secret }; },
    async leaseSecret(scopeInput, secretInput, broker) {
      const scope = parseScope(scopeInput); if (!scope || scope.organizationId !== organizationId || scope.projectId !== projectId || !environments.has(scope.environment)) return { ok: false, issue: issue("INVALID_SCOPE", "$.scope", "secret lease scope does not belong to this project context") };
      const secretResult = context.secretRef(secretInput); if (!secretResult.ok) return secretResult; const secret = secretResult.value;
      if (secret.environment !== scope.environment) return { ok: false, issue: issue("CROSS_PROJECT_SECRET", "$.secret.environment", "SecretRef environment does not match the exact execution scope") };
      if (broker === null || typeof broker !== "object" || typeof broker.issueLease !== "function") return { ok: false, issue: issue("INVALID_SECRET_LEASE", "$.broker", "secret broker is invalid") };
      let raw: unknown; try { raw = await broker.issueLease({ scope, secret }); } catch { return { ok: false, issue: issue("SECRET_BROKER_FAILED", "$.broker", "secret broker failed closed") }; }
      const lease = parseLease(raw, scope, secret); if (!lease) return { ok: false, issue: issue("INVALID_SECRET_LEASE", "$.lease", "secret broker returned an invalid or cross-scope/version lease") };
      return { ok: true, value: lease };
    },
  };
  return { ok: true, value: Object.freeze(context) };
}
