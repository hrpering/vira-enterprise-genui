import {
  VIRA_ACTION_FRESHNESS_STRATEGIES,
  VIRA_ACTION_IDEMPOTENCY_STRATEGIES,
  VIRA_ACTION_RETRY_SAFETY,
  VIRA_ACTION_VERIFICATION_STRATEGIES,
  type ViraActionFreshnessStrategy,
  type ViraActionIdempotencyStrategy,
  type ViraActionRetrySafety,
  type ViraActionVerificationStrategy,
} from "@vira-enterprise-genui/action-supply";
import {
  parseViraApplicationExactReference,
  parseViraApplicationReleaseReference,
  type ViraApplicationExactReference,
} from "@vira-enterprise-genui/application-package";
import {
  VIRA_DELEGATION_MAX_DEPTH,
  createViraEnterpriseContext,
  type ViraDelegationResolution,
  type ViraEnterprisePrincipal,
  type ViraEnterpriseScope,
  type ViraSecretRef,
} from "@vira-enterprise-genui/enterprise-context";
import { parseJsonValue, type JsonObject, type JsonValue } from "@vira-enterprise-genui/protocol";
import {
  VIRA_TRANSACTION_MAX_COMMERCIAL_REFS,
  VIRA_TRANSACTION_MAX_DEPENDENCIES_PER_OPERATION,
  VIRA_TRANSACTION_MAX_OPERATIONS,
  VIRA_TRANSACTION_MAX_POLICY_REFS,
  VIRA_TRANSACTION_PLAN_CANONICALIZATION_VERSION,
  VIRA_TRANSACTION_PLAN_SCHEMA_VERSION,
  VIRA_TRANSACTION_RECORD_VERSION,
  VIRA_TRANSACTION_REVERSIBILITY,
  VIRA_TRANSACTION_RISK_LEVELS,
  type ViraFrozenTransactionPlan,
  type ViraTransactionCommercialSnapshot,
  type ViraTransactionObservedBefore,
  type ViraTransactionOperation,
  type ViraTransactionOperationEvidence,
  type ViraTransactionPlan,
  type ViraTransactionPlanFreezeOptions,
  type ViraTransactionPlanIssueCode,
  type ViraTransactionPlanResult,
  type ViraTransactionPolicySnapshot,
  type ViraTransactionRecord,
  type ViraTransactionWorkContextBinding,
} from "./types.js";

const SHA256_HEX = /^[a-f0-9]{64}$/;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const PLAN_FIELDS = Object.freeze([
  "planSchemaVersion",
  "canonicalizationVersion",
  "transactionId",
  "applicationRef",
  "applicationDigest",
  "deploymentId",
  "resolutionDigest",
  "actor",
  "agent",
  "workload",
  "delegation",
  "scope",
  "workContext",
  "operations",
  "policy",
  "approvalRequirements",
  "commercial",
  "createdAtEpochMs",
  "expiresAtEpochMs",
] as const);
const OPERATION_FIELDS = Object.freeze([
  "operationId",
  "actionRef",
  "actionIntent",
  "actionBindingRef",
  "providerId",
  "providerIdentityRef",
  "connectionId",
  "connectorId",
  "providerOperationId",
  "adapterRef",
  "runnerRef",
  "secretRef",
  "trustEvidenceRef",
  "trustValidUntilEpochMs",
  "resourceType",
  "resourceId",
  "observedBefore",
  "preconditions",
  "expectedPostconditions",
  "risk",
  "reversibility",
  "dependsOn",
  "idempotencyKey",
  "idempotencyStrategy",
  "retrySafety",
  "verificationStrategy",
  "freshnessStrategy",
  "freshnessMaxAgeMs",
] as const);
const BEFORE_FIELDS = Object.freeze(["ref", "digest", "etag"] as const);
const WORK_CONTEXT_FIELDS = Object.freeze(["id", "revision"] as const);
const POLICY_FIELDS = Object.freeze(["evaluationRefs", "obligations"] as const);
const COMMERCIAL_FIELDS = Object.freeze([
  "entitlementRefs",
  "meteringRefs",
  "pricingRefs",
  "settlementRefs",
  "preflight",
] as const);
const DELEGATION_FIELDS = Object.freeze(["principal", "scope", "audience", "grantIds"] as const);
const SCOPE_FIELDS = Object.freeze(["version", "organizationId", "projectId", "environment"] as const);

function fail<T = ViraFrozenTransactionPlan>(
  code: ViraTransactionPlanIssueCode,
  path: string,
  message: string,
): ViraTransactionPlanResult<T> {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function record(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value: JsonObject, fields: readonly string[]): boolean {
  const allowed = new Set(fields);
  return Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field))
    && Object.keys(value).every((field) => allowed.has(field));
}

function safeToken(value: JsonValue | undefined): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function positiveSafeInteger(value: JsonValue | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function exactPrincipal(left: ViraEnterprisePrincipal, right: ViraEnterprisePrincipal): boolean {
  return left.version === right.version
    && left.kind === right.kind
    && left.id === right.id
    && left.organizationId === right.organizationId;
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

function exactReference(
  left: { readonly id: string; readonly versionRef: string },
  right: { readonly id: string; readonly versionRef: string },
): boolean {
  return left.id === right.id && left.versionRef === right.versionRef;
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`);
  return `{${entries.join(",")}}`;
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

function parseScope(input: JsonValue | undefined): ViraTransactionPlanResult<ViraEnterpriseScope> {
  if (!record(input) || !exactFields(input, SCOPE_FIELDS)) return fail("INVALID_SCOPE", "$.scope", "TransactionPlan scope must have the exact enterprise scope shape");
  if (
    typeof input.organizationId !== "string"
    || typeof input.projectId !== "string"
    || typeof input.environment !== "string"
  ) return fail("INVALID_SCOPE", "$.scope", "TransactionPlan enterprise scope is invalid");
  const context = createViraEnterpriseContext({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environments: [input.environment as ViraEnterpriseScope["environment"]],
  });
  if (!context.ok) return fail("INVALID_SCOPE", "$.scope", context.issue.message);
  const scope = context.value.scope(input.environment as ViraEnterpriseScope["environment"]);
  if (!scope.ok || input.version !== scope.value.version) return fail("INVALID_SCOPE", "$.scope", scope.ok ? "TransactionPlan scope version is invalid" : scope.issue.message);
  return { ok: true, value: scope.value };
}

function principalForScope(
  input: JsonValue | undefined,
  scope: ViraEnterpriseScope,
  path: string,
  nullable: boolean,
): ViraTransactionPlanResult<ViraEnterprisePrincipal | null> {
  if (input === null && nullable) return { ok: true, value: null };
  const context = createViraEnterpriseContext({
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    environments: [scope.environment],
  });
  if (!context.ok) return fail("INVALID_PRINCIPAL", path, context.issue.message);
  const principal = context.value.principal(input);
  if (!principal.ok) return fail("INVALID_PRINCIPAL", path, principal.issue.message);
  return { ok: true, value: principal.value };
}

function parseDelegation(
  input: JsonValue | undefined,
  scope: ViraEnterpriseScope,
  actor: ViraEnterprisePrincipal,
): ViraTransactionPlanResult<ViraDelegationResolution> {
  if (!record(input) || !exactFields(input, DELEGATION_FIELDS)) return fail("INVALID_DELEGATION", "$.delegation", "delegation snapshot must have the exact resolved shape");
  const principal = principalForScope(input.principal, scope, "$.delegation.principal", false);
  if (!principal.ok || principal.value === null) return principal.ok ? fail("INVALID_DELEGATION", "$.delegation.principal", "delegation principal is required") : principal;
  const delegatedScope = parseScope(input.scope);
  if (!delegatedScope.ok || !exactScope(delegatedScope.value, scope)) return fail("INVALID_DELEGATION", "$.delegation.scope", "delegation scope must exactly match TransactionPlan scope");
  if (!exactPrincipal(principal.value, actor)) return fail("INVALID_DELEGATION", "$.delegation.principal", "delegation principal must exactly match the effective TransactionPlan actor");
  if (typeof input.audience !== "string" || input.audience.length < 1 || input.audience.length > 256 || input.audience.trim() !== input.audience) {
    return fail("INVALID_DELEGATION", "$.delegation.audience", "delegation audience is invalid");
  }
  if (!Array.isArray(input.grantIds) || input.grantIds.length > VIRA_DELEGATION_MAX_DEPTH) return fail("INVALID_DELEGATION", "$.delegation.grantIds", "delegation grant chain exceeds the canonical maximum depth");
  const grants: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < input.grantIds.length; index += 1) {
    const grantId = input.grantIds[index];
    if (!safeToken(grantId)) return fail("INVALID_DELEGATION", `$.delegation.grantIds[${index}]`, "delegation grant id is invalid");
    if (seen.has(grantId)) return fail("INVALID_DELEGATION", `$.delegation.grantIds[${index}]`, "delegation grant id is duplicated");
    seen.add(grantId);
    grants.push(grantId);
  }
  return {
    ok: true,
    value: Object.freeze({
      principal: principal.value,
      scope,
      audience: input.audience,
      grantIds: Object.freeze(grants),
    }),
  };
}

function parseWorkContext(input: JsonValue | undefined): ViraTransactionPlanResult<ViraTransactionWorkContextBinding> {
  if (!record(input) || !exactFields(input, WORK_CONTEXT_FIELDS) || !safeToken(input.id) || !positiveSafeInteger(input.revision)) {
    return fail("INVALID_WORK_CONTEXT", "$.workContext", "WorkContext binding requires exact id and positive revision");
  }
  return { ok: true, value: Object.freeze({ id: input.id, revision: input.revision }) };
}

function parseJsonObjectArray(input: JsonValue | undefined, path: string): ViraTransactionPlanResult<readonly JsonObject[]> {
  if (!Array.isArray(input) || input.length > 128) return fail("INVALID_OPERATION", path, "condition list must be a bounded array");
  const values: JsonObject[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const entry = input[index];
    if (!record(entry)) return fail("INVALID_OPERATION", `${path}[${index}]`, "condition entry must be a JSON object");
    values.push(deepFreeze(entry));
  }
  return { ok: true, value: Object.freeze(values) };
}

function parseBefore(input: JsonValue | undefined, path: string): ViraTransactionPlanResult<ViraTransactionObservedBefore> {
  if (!record(input) || !exactFields(input, BEFORE_FIELDS)) return fail("INVALID_BEFORE_STATE", path, "observed before-state must have exact ref/digest/etag fields");
  if (input.ref !== null && !safeToken(input.ref)) return fail("INVALID_BEFORE_STATE", `${path}.ref`, "before-state ref is invalid");
  if (input.digest !== null && (typeof input.digest !== "string" || !SHA256_HEX.test(input.digest))) return fail("INVALID_BEFORE_STATE", `${path}.digest`, "before-state digest must be lowercase SHA-256 hex or null");
  if (input.etag !== null && (typeof input.etag !== "string" || input.etag.length < 1 || input.etag.length > 512 || input.etag.trim() !== input.etag)) return fail("INVALID_BEFORE_STATE", `${path}.etag`, "before-state ETag is invalid");
  return { ok: true, value: Object.freeze({ ref: input.ref, digest: input.digest, etag: input.etag }) as ViraTransactionObservedBefore };
}

function parseSecret(input: JsonValue | undefined, scope: ViraEnterpriseScope, path: string): ViraTransactionPlanResult<ViraSecretRef> {
  const context = createViraEnterpriseContext({ organizationId: scope.organizationId, projectId: scope.projectId, environments: [scope.environment] });
  if (!context.ok) return fail("INVALID_SCOPE", "$.scope", context.issue.message);
  const secret = context.value.secretRef(input);
  if (!secret.ok || secret.value.environment !== scope.environment) return fail("INVALID_OPERATION", path, secret.ok ? "operation SecretRef environment does not match TransactionPlan scope" : secret.issue.message);
  return { ok: true, value: secret.value };
}

function parseOperation(
  input: JsonValue,
  index: number,
  scope: ViraEnterpriseScope,
): ViraTransactionPlanResult<ViraTransactionOperation> {
  const path = `$.operations[${index}]`;
  if (!record(input) || !exactFields(input, OPERATION_FIELDS)) return fail("INVALID_OPERATION", path, "Transaction operation must have the exact canonical shape");
  if (!safeToken(input.operationId)) return fail("INVALID_OPERATION", `${path}.operationId`, "operationId is invalid");
  const actionRef = parseViraApplicationExactReference(input.actionRef);
  if (!actionRef.ok) return fail("INVALID_REFERENCE", `${path}.actionRef${actionRef.issue.path.slice(1)}`, actionRef.issue.message);
  const bindingRef = parseViraApplicationExactReference(input.actionBindingRef);
  if (!bindingRef.ok) return fail("INVALID_REFERENCE", `${path}.actionBindingRef${bindingRef.issue.path.slice(1)}`, bindingRef.issue.message);
  if (!record(input.actionIntent)) return fail("INVALID_OPERATION", `${path}.actionIntent`, "Action intent must be a bounded JSON object");
  if (
    !safeToken(input.providerId)
    || !safeToken(input.providerIdentityRef)
    || !safeToken(input.connectionId)
    || !safeToken(input.connectorId)
    || !safeToken(input.providerOperationId)
    || !safeToken(input.adapterRef)
    || !safeToken(input.runnerRef)
    || !safeToken(input.trustEvidenceRef)
    || !positiveSafeInteger(input.trustValidUntilEpochMs)
    || !safeToken(input.resourceType)
    || !safeToken(input.resourceId)
    || !safeToken(input.idempotencyKey)
  ) return fail("INVALID_OPERATION", path, "operation provider/trust/resource/idempotency identity is invalid");
  const secret = parseSecret(input.secretRef, scope, `${path}.secretRef`);
  if (!secret.ok) return secret;
  const before = parseBefore(input.observedBefore, `${path}.observedBefore`);
  if (!before.ok) return before;
  const preconditions = parseJsonObjectArray(input.preconditions, `${path}.preconditions`);
  if (!preconditions.ok) return preconditions;
  const postconditions = parseJsonObjectArray(input.expectedPostconditions, `${path}.expectedPostconditions`);
  if (!postconditions.ok) return postconditions;
  if (typeof input.risk !== "string" || !(VIRA_TRANSACTION_RISK_LEVELS as readonly string[]).includes(input.risk)) return fail("INVALID_OPERATION", `${path}.risk`, "operation risk is invalid");
  if (typeof input.reversibility !== "string" || !(VIRA_TRANSACTION_REVERSIBILITY as readonly string[]).includes(input.reversibility)) return fail("INVALID_OPERATION", `${path}.reversibility`, "operation reversibility is invalid");
  if (!Array.isArray(input.dependsOn)) return fail("INVALID_OPERATION", `${path}.dependsOn`, "operation dependencies must be an array");
  if (input.dependsOn.length > VIRA_TRANSACTION_MAX_DEPENDENCIES_PER_OPERATION) return fail("DEPENDENCY_LIMIT_EXCEEDED", `${path}.dependsOn`, "operation dependency limit exceeded");
  const dependencies: string[] = [];
  const dependencySet = new Set<string>();
  for (let dependencyIndex = 0; dependencyIndex < input.dependsOn.length; dependencyIndex += 1) {
    const dependency = input.dependsOn[dependencyIndex];
    if (!safeToken(dependency)) return fail("INVALID_OPERATION", `${path}.dependsOn[${dependencyIndex}]`, "dependency operation id is invalid");
    if (dependencySet.has(dependency)) return fail("INVALID_OPERATION", `${path}.dependsOn[${dependencyIndex}]`, "dependency operation id is duplicated");
    dependencySet.add(dependency);
    dependencies.push(dependency);
  }
  if (
    typeof input.idempotencyStrategy !== "string"
    || !(VIRA_ACTION_IDEMPOTENCY_STRATEGIES as readonly string[]).includes(input.idempotencyStrategy)
    || typeof input.retrySafety !== "string"
    || !(VIRA_ACTION_RETRY_SAFETY as readonly string[]).includes(input.retrySafety)
    || typeof input.verificationStrategy !== "string"
    || !(VIRA_ACTION_VERIFICATION_STRATEGIES as readonly string[]).includes(input.verificationStrategy)
    || typeof input.freshnessStrategy !== "string"
    || !(VIRA_ACTION_FRESHNESS_STRATEGIES as readonly string[]).includes(input.freshnessStrategy)
  ) return fail("INVALID_OPERATION", path, "operation execution behavior strategy is invalid");
  const boundedAge = input.freshnessStrategy === "bounded-age";
  if (boundedAge ? !positiveSafeInteger(input.freshnessMaxAgeMs) : input.freshnessMaxAgeMs !== null) {
    return fail("INVALID_OPERATION", `${path}.freshnessMaxAgeMs`, "operation freshness age does not match freshness strategy");
  }
  return {
    ok: true,
    value: deepFreeze({
      operationId: input.operationId,
      actionRef: actionRef.value,
      actionIntent: input.actionIntent,
      actionBindingRef: bindingRef.value,
      providerId: input.providerId,
      providerIdentityRef: input.providerIdentityRef,
      connectionId: input.connectionId,
      connectorId: input.connectorId,
      providerOperationId: input.providerOperationId,
      adapterRef: input.adapterRef,
      runnerRef: input.runnerRef,
      secretRef: secret.value,
      trustEvidenceRef: input.trustEvidenceRef,
      trustValidUntilEpochMs: input.trustValidUntilEpochMs,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      observedBefore: before.value,
      preconditions: preconditions.value,
      expectedPostconditions: postconditions.value,
      risk: input.risk as ViraTransactionOperation["risk"],
      reversibility: input.reversibility as ViraTransactionOperation["reversibility"],
      dependsOn: Object.freeze(dependencies),
      idempotencyKey: input.idempotencyKey,
      idempotencyStrategy: input.idempotencyStrategy as ViraActionIdempotencyStrategy,
      retrySafety: input.retrySafety as ViraActionRetrySafety,
      verificationStrategy: input.verificationStrategy as ViraActionVerificationStrategy,
      freshnessStrategy: input.freshnessStrategy as ViraActionFreshnessStrategy,
      freshnessMaxAgeMs: input.freshnessMaxAgeMs as number | null,
    }),
  };
}

function validateGraph(operations: readonly ViraTransactionOperation[]): ViraTransactionPlanResult<readonly ViraTransactionOperation[]> {
  const byId = new Map<string, ViraTransactionOperation>();
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    if (byId.has(operation.operationId)) return fail("DUPLICATE_OPERATION", `$.operations[${index}].operationId`, "TransactionPlan operation id is duplicated");
    byId.set(operation.operationId, operation);
  }
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    for (const dependency of operation.dependsOn) {
      if (dependency === operation.operationId) return fail("SELF_DEPENDENCY", `$.operations[${index}].dependsOn`, "operation cannot depend on itself");
      if (!byId.has(dependency)) return fail("UNKNOWN_DEPENDENCY", `$.operations[${index}].dependsOn`, `unknown dependency operation ${dependency}`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    const operation = byId.get(id);
    if (!operation) return false;
    for (const dependency of operation.dependsOn) if (!visit(dependency)) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  for (const operation of operations) if (!visit(operation.operationId)) return fail("DEPENDENCY_CYCLE", "$.operations", "TransactionPlan operation graph must be acyclic");
  return { ok: true, value: operations };
}

function parsePolicy(input: JsonValue | undefined): ViraTransactionPlanResult<ViraTransactionPolicySnapshot> {
  if (!record(input) || !exactFields(input, POLICY_FIELDS) || !Array.isArray(input.evaluationRefs) || input.evaluationRefs.length > VIRA_TRANSACTION_MAX_POLICY_REFS) {
    return fail("INVALID_POLICY", "$.policy", "policy snapshot is invalid or exceeds reference limits");
  }
  const refs: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < input.evaluationRefs.length; index += 1) {
    const reference = input.evaluationRefs[index];
    if (!safeToken(reference)) return fail("INVALID_POLICY", `$.policy.evaluationRefs[${index}]`, "policy evaluation reference is invalid");
    if (seen.has(reference)) return fail("INVALID_POLICY", `$.policy.evaluationRefs[${index}]`, "policy evaluation reference is duplicated");
    seen.add(reference);
    refs.push(reference);
  }
  return { ok: true, value: deepFreeze({ evaluationRefs: Object.freeze(refs), obligations: input.obligations }) };
}

function parseExactReferenceArray(
  input: JsonValue | undefined,
  path: string,
): ViraTransactionPlanResult<readonly ViraApplicationExactReference[]> {
  if (!Array.isArray(input) || input.length > VIRA_TRANSACTION_MAX_COMMERCIAL_REFS) return fail("INVALID_COMMERCIAL_SNAPSHOT", path, "commercial exact-reference list is invalid or exceeds limits");
  const refs: ViraApplicationExactReference[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < input.length; index += 1) {
    const reference = parseViraApplicationExactReference(input[index]);
    if (!reference.ok) return fail("INVALID_REFERENCE", `${path}[${index}]${reference.issue.path.slice(1)}`, reference.issue.message);
    const key = `${reference.value.id}\u0000${reference.value.versionRef}`;
    if (seen.has(key)) return fail("INVALID_COMMERCIAL_SNAPSHOT", `${path}[${index}]`, "commercial reference is duplicated");
    seen.add(key);
    refs.push(reference.value);
  }
  return { ok: true, value: Object.freeze(refs) };
}

function parseCommercial(input: JsonValue | undefined): ViraTransactionPlanResult<ViraTransactionCommercialSnapshot> {
  if (!record(input) || !exactFields(input, COMMERCIAL_FIELDS)) return fail("INVALID_COMMERCIAL_SNAPSHOT", "$.commercial", "commercial preflight snapshot must have the exact shape");
  const entitlementRefs = parseExactReferenceArray(input.entitlementRefs, "$.commercial.entitlementRefs");
  if (!entitlementRefs.ok) return entitlementRefs;
  const meteringRefs = parseExactReferenceArray(input.meteringRefs, "$.commercial.meteringRefs");
  if (!meteringRefs.ok) return meteringRefs;
  const pricingRefs = parseExactReferenceArray(input.pricingRefs, "$.commercial.pricingRefs");
  if (!pricingRefs.ok) return pricingRefs;
  const settlementRefs = parseExactReferenceArray(input.settlementRefs, "$.commercial.settlementRefs");
  if (!settlementRefs.ok) return settlementRefs;
  return {
    ok: true,
    value: deepFreeze({
      entitlementRefs: entitlementRefs.value,
      meteringRefs: meteringRefs.value,
      pricingRefs: pricingRefs.value,
      settlementRefs: settlementRefs.value,
      preflight: input.preflight,
    }),
  };
}

function parsePlan(input: unknown): ViraTransactionPlanResult<ViraTransactionPlan> {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !record(parsed.value)) return fail("INVALID_INPUT", parsed.ok ? "$" : parsed.issue.path, parsed.ok ? "TransactionPlan must be a canonical JSON object" : parsed.issue.reason);
  const root = parsed.value;
  if (!exactFields(root, PLAN_FIELDS)) return fail("UNKNOWN_FIELD", "$", "TransactionPlan must contain only the exact canonical fields");
  if (root.planSchemaVersion !== VIRA_TRANSACTION_PLAN_SCHEMA_VERSION) return fail("INVALID_SCHEMA_VERSION", "$.planSchemaVersion", `planSchemaVersion must equal ${VIRA_TRANSACTION_PLAN_SCHEMA_VERSION}`);
  if (root.canonicalizationVersion !== VIRA_TRANSACTION_PLAN_CANONICALIZATION_VERSION) return fail("INVALID_CANONICALIZATION_VERSION", "$.canonicalizationVersion", `canonicalizationVersion must equal ${VIRA_TRANSACTION_PLAN_CANONICALIZATION_VERSION}`);
  if (!safeToken(root.transactionId)) return fail("INVALID_TRANSACTION_ID", "$.transactionId", "transactionId is invalid");
  const applicationRef = parseViraApplicationReleaseReference(root.applicationRef);
  if (!applicationRef.ok) return fail("INVALID_APPLICATION_REF", `$.applicationRef${applicationRef.issue.path.slice(1)}`, applicationRef.issue.message);
  if (typeof root.applicationDigest !== "string" || !SHA256_HEX.test(root.applicationDigest)) return fail("INVALID_DIGEST", "$.applicationDigest", "applicationDigest must be lowercase SHA-256 hex");
  if (!safeToken(root.deploymentId)) return fail("INVALID_INPUT", "$.deploymentId", "deploymentId is invalid");
  if (typeof root.resolutionDigest !== "string" || !SHA256_HEX.test(root.resolutionDigest)) return fail("INVALID_DIGEST", "$.resolutionDigest", "resolutionDigest must be lowercase SHA-256 hex");
  const scope = parseScope(root.scope);
  if (!scope.ok) return scope;
  const actor = principalForScope(root.actor, scope.value, "$.actor", false);
  if (!actor.ok || actor.value === null) return actor.ok ? fail("INVALID_PRINCIPAL", "$.actor", "actor is required") : actor;
  const agent = principalForScope(root.agent, scope.value, "$.agent", true);
  if (!agent.ok) return agent;
  const workload = principalForScope(root.workload, scope.value, "$.workload", true);
  if (!workload.ok) return workload;
  const delegation = parseDelegation(root.delegation, scope.value, actor.value);
  if (!delegation.ok) return delegation;
  const workContext = parseWorkContext(root.workContext);
  if (!workContext.ok) return workContext;
  if (!Array.isArray(root.operations)) return fail("INVALID_OPERATION", "$.operations", "TransactionPlan operations must be an array");
  if (root.operations.length < 1 || root.operations.length > VIRA_TRANSACTION_MAX_OPERATIONS) return fail("OPERATION_LIMIT_EXCEEDED", "$.operations", `TransactionPlan requires 1..${VIRA_TRANSACTION_MAX_OPERATIONS} operations`);
  const operations: ViraTransactionOperation[] = [];
  for (let index = 0; index < root.operations.length; index += 1) {
    const operation = parseOperation(root.operations[index] as JsonValue, index, scope.value);
    if (!operation.ok) return operation;
    operations.push(operation.value);
  }
  const graph = validateGraph(operations);
  if (!graph.ok) return graph;
  const policy = parsePolicy(root.policy);
  if (!policy.ok) return policy;
  const commercial = parseCommercial(root.commercial);
  if (!commercial.ok) return commercial;
  if (!positiveSafeInteger(root.createdAtEpochMs) || !positiveSafeInteger(root.expiresAtEpochMs) || root.expiresAtEpochMs <= root.createdAtEpochMs) {
    return fail("INVALID_TIME_WINDOW", "$.expiresAtEpochMs", "TransactionPlan expiry must be after creation time");
  }
  const plan: ViraTransactionPlan = {
    planSchemaVersion: VIRA_TRANSACTION_PLAN_SCHEMA_VERSION,
    canonicalizationVersion: VIRA_TRANSACTION_PLAN_CANONICALIZATION_VERSION,
    transactionId: root.transactionId,
    applicationRef: applicationRef.value,
    applicationDigest: root.applicationDigest,
    deploymentId: root.deploymentId,
    resolutionDigest: root.resolutionDigest,
    actor: actor.value,
    agent: agent.value,
    workload: workload.value,
    delegation: delegation.value,
    scope: scope.value,
    workContext: workContext.value,
    operations: Object.freeze(operations),
    policy: policy.value,
    approvalRequirements: root.approvalRequirements,
    commercial: commercial.value,
    createdAtEpochMs: root.createdAtEpochMs,
    expiresAtEpochMs: root.expiresAtEpochMs,
  };
  return { ok: true, value: deepFreeze(plan) };
}

function exactBehavior(operation: ViraTransactionOperation, evidence: ViraTransactionOperationEvidence): boolean {
  return evidence.supply.behavior.idempotencyStrategy === operation.idempotencyStrategy
    && evidence.supply.behavior.retrySafety === operation.retrySafety
    && evidence.supply.behavior.verificationStrategy === operation.verificationStrategy
    && evidence.supply.behavior.freshnessStrategy === operation.freshnessStrategy
    && evidence.supply.behavior.freshnessMaxAgeMs === operation.freshnessMaxAgeMs;
}

function verifyOperationEvidence(
  plan: ViraTransactionPlan,
  evidenceInput: readonly ViraTransactionOperationEvidence[] | undefined,
): ViraTransactionPlanResult<true> {
  if (!Array.isArray(evidenceInput) || evidenceInput.length !== plan.operations.length) {
    return fail("MISSING_OPERATION_EVIDENCE", "$.operationEvidence", "every TransactionPlan operation requires exactly one ActionSupply and Stage A preflight evidence record");
  }
  const byOperationId = new Map<string, ViraTransactionOperationEvidence>();
  for (let index = 0; index < evidenceInput.length; index += 1) {
    const evidence = evidenceInput[index];
    if (evidence === null || typeof evidence !== "object" || typeof evidence.operationId !== "string" || !SAFE_TOKEN.test(evidence.operationId)) {
      return fail("INVALID_OPERATION_EVIDENCE", `$.operationEvidence[${index}]`, "operation evidence identity is invalid");
    }
    if (byOperationId.has(evidence.operationId)) {
      return fail("INVALID_OPERATION_EVIDENCE", `$.operationEvidence[${index}].operationId`, "operation evidence is duplicated");
    }
    byOperationId.set(evidence.operationId, evidence);
  }

  for (let index = 0; index < plan.operations.length; index += 1) {
    const operation = plan.operations[index];
    const evidence = byOperationId.get(operation.operationId);
    if (!evidence) return fail("MISSING_OPERATION_EVIDENCE", `$.operations[${index}]`, "TransactionPlan operation has no exact supply/preflight evidence");
    const supply = evidence.supply;
    if (
      supply === null
      || typeof supply !== "object"
      || supply.version !== "1"
      || !exactReference(supply.actionRef, operation.actionRef)
      || !exactReference(supply.bindingRef, operation.actionBindingRef)
      || !exactScope(supply.scope, plan.scope)
      || supply.providerId !== operation.providerId
      || supply.providerIdentityRef !== operation.providerIdentityRef
      || supply.connectionId !== operation.connectionId
      || supply.connectorId !== operation.connectorId
      || supply.operationId !== operation.providerOperationId
      || supply.adapterRef !== operation.adapterRef
      || supply.runnerRef !== operation.runnerRef
      || !exactSecret(supply.secretRef, operation.secretRef)
      || supply.trustEvidenceRef !== operation.trustEvidenceRef
      || supply.trustValidUntilEpochMs !== operation.trustValidUntilEpochMs
      || !exactBehavior(operation, evidence)
    ) {
      return fail("SUPPLY_MISMATCH", `$.operationEvidence[${index}].supply`, "resolved ActionSupply does not exactly match the frozen TransactionPlan operation");
    }
    if (operation.trustValidUntilEpochMs < plan.expiresAtEpochMs) {
      return fail("TRUST_WINDOW_TOO_SHORT", `$.operations[${index}].trustValidUntilEpochMs`, "TransactionPlan cannot outlive the provider trust window used to freeze it");
    }

    const preflight = evidence.preflight;
    if (
      preflight === null
      || typeof preflight !== "object"
      || preflight.permission !== "allow" && preflight.permission !== "confirm"
      || preflight.definition.actionType !== operation.actionRef.id
      || preflight.intent.action.type !== operation.actionRef.id
      || preflight.intent.idempotencyKey !== operation.idempotencyKey
      || preflight.currentRevision !== preflight.intent.expectedStateRevision
      || canonicalJson(preflight.intent.action.payload) !== canonicalJson(operation.actionIntent)
    ) {
      return fail("PREFLIGHT_MISMATCH", `$.operationEvidence[${index}].preflight`, "Stage A preflight does not exactly match the frozen TransactionPlan operation");
    }
    if (preflight.permission === "allow" && preflight.challenge !== null) {
      return fail("PREFLIGHT_MISMATCH", `$.operationEvidence[${index}].preflight.challenge`, "allow preflight must not carry an approval challenge");
    }
    if (preflight.permission === "confirm") {
      const challenge = preflight.challenge;
      if (
        challenge === null
        || challenge.instanceId !== preflight.intent.instanceId
        || challenge.actionId !== preflight.intent.action.id
        || challenge.actionType !== preflight.intent.action.type
        || challenge.expectedStateRevision !== preflight.intent.expectedStateRevision
        || challenge.idempotencyKey !== preflight.intent.idempotencyKey
      ) {
        return fail("PREFLIGHT_MISMATCH", `$.operationEvidence[${index}].preflight.challenge`, "confirm preflight challenge must bind the exact ActionIntent");
      }
    }
  }
  return { ok: true, value: true };
}

export async function freezeViraTransactionPlan(
  input: unknown,
  options: ViraTransactionPlanFreezeOptions,
): Promise<ViraTransactionPlanResult> {
  if (
    options === null
    || typeof options !== "object"
    || !Number.isSafeInteger(options.planRevision)
    || options.planRevision < 1
    || typeof options.digest !== "function"
  ) return fail("INVALID_PLAN_REVISION", "$.planRevision", "TransactionPlan freeze requires positive planRevision, digest provider and operation evidence");
  const plan = parsePlan(input);
  if (!plan.ok) return plan;
  const evidence = verifyOperationEvidence(plan.value, options.operationEvidence);
  if (!evidence.ok) return evidence;
  const canonicalPlan = canonicalJson(plan.value as unknown as JsonValue);
  let planDigest: string;
  try {
    planDigest = await options.digest(canonicalPlan);
  } catch {
    return fail("DIGEST_PROVIDER_FAILED", "$digest", "TransactionPlan digest provider failed closed");
  }
  if (!SHA256_HEX.test(planDigest)) return fail("INVALID_PLAN_DIGEST", "$digest", "TransactionPlan digest provider must return lowercase SHA-256 hex");
  return {
    ok: true,
    value: Object.freeze({
      plan: plan.value,
      planRevision: options.planRevision,
      canonicalPlan,
      planDigest,
    }),
  };
}

export function createViraTransactionRecord(
  frozen: ViraFrozenTransactionPlan,
  nowEpochMs: number,
): ViraTransactionPlanResult<ViraTransactionRecord> {
  if (
    frozen === null
    || typeof frozen !== "object"
    || !Number.isSafeInteger(frozen.planRevision)
    || frozen.planRevision < 1
    || typeof frozen.planDigest !== "string"
    || !SHA256_HEX.test(frozen.planDigest)
    || frozen.plan?.transactionId === undefined
    || !Number.isSafeInteger(nowEpochMs)
    || nowEpochMs <= 0
  ) return fail("INVALID_INPUT", "$", "TransactionRecord requires a valid frozen plan and timestamp");
  const recordValue: ViraTransactionRecord = {
    version: VIRA_TRANSACTION_RECORD_VERSION,
    transactionId: frozen.plan.transactionId,
    planDigest: frozen.planDigest,
    planRevision: frozen.planRevision,
    revision: 1,
    status: "planned",
    approvals: Object.freeze([]),
    executionGrantRefs: Object.freeze([]),
    operationStates: Object.freeze([]),
    attempts: Object.freeze([]),
    verificationResults: Object.freeze([]),
    actionLedgerRefs: Object.freeze([]),
    recoveryState: null,
    manualResolution: null,
    createdAtEpochMs: nowEpochMs,
    updatedAtEpochMs: nowEpochMs,
    completedAtEpochMs: null,
  };
  return { ok: true, value: deepFreeze(recordValue) };
}
