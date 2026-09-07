import { parseViraCapabilityExactReference } from "../../../packages/capability-contract/src/index.js";
import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import {
  VIRA_HOSTED_CAPABILITY_COMPLETION_ID_MAX_LENGTH,
  VIRA_HOSTED_CAPABILITY_FAILURE_CODE_MAX_LENGTH,
  VIRA_HOSTED_CAPABILITY_INVOCATION_ID_MAX_LENGTH,
  VIRA_HOSTED_CAPABILITY_JOB_COMPLETION_MODES,
  VIRA_HOSTED_CAPABILITY_JOB_ID_MAX_LENGTH,
  VIRA_HOSTED_CAPABILITY_JOB_RETRY_POLICIES,
  VIRA_HOSTED_CAPABILITY_JOB_STATUSES,
  VIRA_HOSTED_CAPABILITY_JOB_VERSION,
  VIRA_HOSTED_CAPABILITY_PROVIDER_JOB_REF_MAX_LENGTH,
  type ViraHostedCapabilityJob,
  type ViraHostedCapabilityJobStore,
  type ViraHostedCapabilityJobStoreMutationResult,
} from "../../../packages/hosted-capability-runtime/src/index.js";
import { isSemanticNamespace, parseJsonValue, type JsonObject, type JsonValue } from "../../../packages/protocol/src/index.js";
import {
  canonicalizeEnterpriseScope,
  withTenantTransaction,
  type PostgresClientLike,
  type PostgresPoolLike,
} from "./transaction.js";

interface HostedCapabilityJobRow extends Record<string, unknown> {
  readonly organization_id: unknown;
  readonly project_id: unknown;
  readonly environment: unknown;
  readonly job_id: unknown;
  readonly revision: unknown;
  readonly status: unknown;
  readonly record: unknown;
}

const JOB_STATUSES = new Set<string>(VIRA_HOSTED_CAPABILITY_JOB_STATUSES);
const COMPLETION_MODES = new Set<string>(VIRA_HOSTED_CAPABILITY_JOB_COMPLETION_MODES);
const RETRY_POLICIES = new Set<string>(VIRA_HOSTED_CAPABILITY_JOB_RETRY_POLICIES);
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function safePositive(value: JsonValue | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function safeNullablePositive(value: JsonValue | undefined): value is number | null {
  return value === null || safePositive(value);
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true;
  }
  return false;
}

function safeOpaqueToken(value: JsonValue | undefined, maxLength: number): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= maxLength
    && value.trim() === value
    && !hasControlCharacter(value);
}

function freezeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => freezeJson(item)));
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeJson(item)]))) as JsonObject;
  }
  return value;
}

function parseRecord(input: unknown): JsonObject {
  const parsed = parseJsonValue(input);
  if (!parsed.ok || !isObject(parsed.value)) throw new TypeError("Hosted Capability job PostgreSQL record must be canonical JSON");
  return parsed.value;
}

function recordScope(record: JsonObject): ViraEnterpriseScope {
  try {
    return canonicalizeEnterpriseScope(record.scope);
  } catch {
    throw new TypeError("Hosted Capability job PostgreSQL record has an invalid enterprise scope");
  }
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function rowScope(row: HostedCapabilityJobRow): ViraEnterpriseScope {
  try {
    return canonicalizeEnterpriseScope({
      version: "1",
      organizationId: row.organization_id,
      projectId: row.project_id,
      environment: row.environment,
    });
  } catch {
    throw new TypeError("Hosted Capability job PostgreSQL row scope is invalid");
  }
}

function rowRevision(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1) return value;
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  throw new TypeError("Hosted Capability job PostgreSQL row revision is invalid");
}

function validateExactReference(value: JsonValue | undefined, label: string): void {
  const parsed = parseViraCapabilityExactReference(value);
  if (!parsed.ok) throw new TypeError(`Hosted Capability job PostgreSQL ${label} is invalid`);
}

function validateOutput(value: JsonValue | undefined): void {
  if (!isObject(value) || Object.keys(value).length !== 2 || !Object.hasOwn(value, "typeRef") || !Object.hasOwn(value, "value")) {
    throw new TypeError("Hosted Capability job PostgreSQL completion output is invalid");
  }
  if (value.typeRef !== null) validateExactReference(value.typeRef, "completion output typeRef");
}

function validateCompletion(record: JsonObject): void {
  const completion = record.completion;
  if (completion === null) return;
  if (!isObject(completion) || Object.keys(completion).length !== 4) {
    throw new TypeError("Hosted Capability job PostgreSQL completion is invalid");
  }
  if (completion.source !== "poll" && completion.source !== "webhook") {
    throw new TypeError("Hosted Capability job PostgreSQL completion source is invalid");
  }
  if (!safeOpaqueToken(completion.completionId, VIRA_HOSTED_CAPABILITY_COMPLETION_ID_MAX_LENGTH) || !safePositive(completion.completedAtEpochMs)) {
    throw new TypeError("Hosted Capability job PostgreSQL completion identity is invalid");
  }
  if (!isObject(completion.result) || typeof completion.result.resultDigest !== "string" || !DIGEST_PATTERN.test(completion.result.resultDigest)) {
    throw new TypeError("Hosted Capability job PostgreSQL completion result is invalid");
  }
  const result = completion.result;
  if (result.outcome === "success") {
    if (Object.keys(result).length !== 3) throw new TypeError("Hosted Capability job PostgreSQL success result is invalid");
    validateOutput(result.output);
    return;
  }
  if (result.outcome === "empty") {
    if (Object.keys(result).length !== 2) throw new TypeError("Hosted Capability job PostgreSQL empty result is invalid");
    return;
  }
  if (result.outcome === "error") {
    if (Object.keys(result).length !== 3 || !isObject(result.failure) || Object.keys(result.failure).length !== 1 || !safeOpaqueToken(result.failure.code, VIRA_HOSTED_CAPABILITY_FAILURE_CODE_MAX_LENGTH)) {
      throw new TypeError("Hosted Capability job PostgreSQL error result is invalid");
    }
    return;
  }
  throw new TypeError("Hosted Capability job PostgreSQL completion outcome is invalid");
}

function validateTemporalState(record: JsonObject): void {
  if (
    !safePositive(record.deadlineEpochMs)
    || !safePositive(record.startedAtEpochMs)
    || !safePositive(record.updatedAtEpochMs)
    || !safeNullablePositive(record.cancelRequestedAtEpochMs)
    || !safeNullablePositive(record.cancelledAtEpochMs)
    || !safeNullablePositive(record.timedOutAtEpochMs)
    || record.deadlineEpochMs <= record.startedAtEpochMs
    || record.updatedAtEpochMs < record.startedAtEpochMs
  ) throw new TypeError("Hosted Capability job PostgreSQL temporal state is invalid");

  const cancelRequested = record.cancelRequestedAtEpochMs;
  const cancelled = record.cancelledAtEpochMs;
  const timedOut = record.timedOutAtEpochMs;
  if (cancelRequested !== null && (cancelRequested < record.startedAtEpochMs || cancelRequested > record.updatedAtEpochMs)) {
    throw new TypeError("Hosted Capability job PostgreSQL cancellation request timestamp is invalid");
  }
  if (cancelled !== null && (cancelRequested === null || cancelled < cancelRequested || cancelled > record.updatedAtEpochMs)) {
    throw new TypeError("Hosted Capability job PostgreSQL cancellation timestamp is invalid");
  }
  if (timedOut !== null && (timedOut < record.deadlineEpochMs || timedOut > record.updatedAtEpochMs)) {
    throw new TypeError("Hosted Capability job PostgreSQL timeout timestamp is invalid");
  }

  const completion = record.completion;
  if (completion !== null && isObject(completion)) {
    const completedAt = completion.completedAtEpochMs;
    if (!safePositive(completedAt) || completedAt < record.startedAtEpochMs || completedAt >= record.deadlineEpochMs || completedAt > record.updatedAtEpochMs) {
      throw new TypeError("Hosted Capability job PostgreSQL completion timestamp is invalid");
    }
  }
}

function validateStatusState(record: JsonObject): void {
  const completion = record.completion;
  if (record.status === "running") {
    if (record.cancelRequestedAtEpochMs !== null || record.cancelledAtEpochMs !== null || record.timedOutAtEpochMs !== null || completion !== null) {
      throw new TypeError("Hosted Capability job PostgreSQL running state is inconsistent");
    }
    return;
  }
  if (record.status === "cancel-requested") {
    if (record.cancelRequestedAtEpochMs === null || record.cancelledAtEpochMs !== null || record.timedOutAtEpochMs !== null || completion !== null) {
      throw new TypeError("Hosted Capability job PostgreSQL cancel-requested state is inconsistent");
    }
    return;
  }
  if (record.status === "cancelled") {
    if (record.cancelRequestedAtEpochMs === null || record.cancelledAtEpochMs === null || record.timedOutAtEpochMs !== null || completion !== null) {
      throw new TypeError("Hosted Capability job PostgreSQL cancelled state is inconsistent");
    }
    return;
  }
  if (record.status === "timed-out") {
    if (record.cancelledAtEpochMs !== null || record.timedOutAtEpochMs === null || completion !== null) {
      throw new TypeError("Hosted Capability job PostgreSQL timed-out state is inconsistent");
    }
    return;
  }
  if (!isObject(completion) || record.cancelledAtEpochMs !== null || record.timedOutAtEpochMs !== null || !isObject(completion.result)) {
    throw new TypeError("Hosted Capability job PostgreSQL terminal completion state is inconsistent");
  }
  if (record.status === "completed" && completion.result.outcome !== "success" && completion.result.outcome !== "empty") {
    throw new TypeError("Hosted Capability job PostgreSQL completed outcome is inconsistent");
  }
  if (record.status === "failed" && completion.result.outcome !== "error") {
    throw new TypeError("Hosted Capability job PostgreSQL failed outcome is inconsistent");
  }
}

function parseHostedCapabilityJob(input: unknown): ViraHostedCapabilityJob {
  const record = parseRecord(input);
  if (
    Object.keys(record).length !== 21
    || record.version !== VIRA_HOSTED_CAPABILITY_JOB_VERSION
    || !safeOpaqueToken(record.id, VIRA_HOSTED_CAPABILITY_JOB_ID_MAX_LENGTH)
    || typeof record.id !== "string"
    || !isSemanticNamespace(record.id)
    || !safePositive(record.revision)
    || typeof record.status !== "string"
    || !JOB_STATUSES.has(record.status)
    || !safeOpaqueToken(record.invocationId, VIRA_HOSTED_CAPABILITY_INVOCATION_ID_MAX_LENGTH)
    || typeof record.providerId !== "string"
    || !isSemanticNamespace(record.providerId)
    || typeof record.providerConnectionId !== "string"
    || !isSemanticNamespace(record.providerConnectionId)
    || typeof record.trustEvidenceId !== "string"
    || !isSemanticNamespace(record.trustEvidenceId)
    || !safeOpaqueToken(record.providerJobRef, VIRA_HOSTED_CAPABILITY_PROVIDER_JOB_REF_MAX_LENGTH)
    || typeof record.completionMode !== "string"
    || !COMPLETION_MODES.has(record.completionMode)
    || typeof record.retryPolicy !== "string"
    || !RETRY_POLICIES.has(record.retryPolicy)
  ) throw new TypeError("Hosted Capability job PostgreSQL record identity is invalid");
  recordScope(record);
  validateExactReference(record.capabilityRef, "capabilityRef");
  validateExactReference(record.bindingRef, "bindingRef");
  validateCompletion(record);
  validateTemporalState(record);
  validateStatusState(record);
  return freezeJson(record) as unknown as ViraHostedCapabilityJob;
}

function validateHostedCapabilityJobRow(
  row: HostedCapabilityJobRow,
  expectedScope: ViraEnterpriseScope,
  expectedId: string,
): ViraHostedCapabilityJob {
  const job = parseHostedCapabilityJob(row.record);
  const persistedScope = rowScope(row);
  const revision = rowRevision(row.revision);
  if (
    !exactScope(persistedScope, expectedScope)
    || !exactScope(job.scope, expectedScope)
    || row.job_id !== expectedId
    || job.id !== expectedId
    || job.revision !== revision
    || row.status !== job.status
  ) throw new TypeError("Hosted Capability job PostgreSQL row conflicts with its canonical record");
  return job;
}

function validatePool(pool: PostgresPoolLike): void {
  if (pool === null || typeof pool !== "object" || typeof pool.connect !== "function") {
    throw new TypeError("PostgreSQL Hosted Capability job store requires a pool");
  }
}

async function classifyMissingOrConflict(
  client: PostgresClientLike,
  text: string,
  values: readonly unknown[],
): Promise<"NOT_FOUND" | "VERSION_CONFLICT"> {
  const existing = await client.query<{ revision: unknown }>(text, values);
  return existing.rows.length === 0 ? "NOT_FOUND" : "VERSION_CONFLICT";
}

export function createPostgresHostedCapabilityJobStore(pool: PostgresPoolLike): ViraHostedCapabilityJobStore {
  validatePool(pool);
  return Object.freeze({
    async read(scopeInput: ViraEnterpriseScope, id: string) {
      const scope = canonicalizeEnterpriseScope(scopeInput);
      if (typeof id !== "string" || id.length < 1 || id.length > VIRA_HOSTED_CAPABILITY_JOB_ID_MAX_LENGTH || !isSemanticNamespace(id)) {
        throw new TypeError("Hosted Capability job PostgreSQL id is invalid");
      }
      return withTenantTransaction(pool, scope, async (client, transactionScope) => {
        const result = await client.query<HostedCapabilityJobRow>(
          `SELECT organization_id, project_id, environment, job_id, revision, status, record
             FROM vira.hosted_capability_job_state
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND job_id = $4`,
          [transactionScope.organizationId, transactionScope.projectId, transactionScope.environment, id],
        );
        if (result.rows.length === 0) return undefined;
        if (result.rows.length !== 1) throw new TypeError("Hosted Capability job PostgreSQL read returned duplicate state");
        return validateHostedCapabilityJobRow(result.rows[0]!, transactionScope, id);
      });
    },
    async create(input: ViraHostedCapabilityJob) {
      const job = parseHostedCapabilityJob(input);
      return withTenantTransaction(pool, job.scope, async (client, scope): Promise<ViraHostedCapabilityJobStoreMutationResult> => {
        const result = await client.query<HostedCapabilityJobRow>(
          `INSERT INTO vira.hosted_capability_job_state
             (organization_id, project_id, environment, job_id, revision, status, record)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (organization_id, project_id, environment, job_id) DO NOTHING
           RETURNING organization_id, project_id, environment, job_id, revision, status, record`,
          [scope.organizationId, scope.projectId, scope.environment, job.id, job.revision, job.status, JSON.stringify(job)],
        );
        if (result.rows.length === 0) return { ok: false, code: "ALREADY_EXISTS" };
        if (result.rows.length !== 1) throw new TypeError("Hosted Capability job PostgreSQL create returned duplicate state");
        return { ok: true, value: validateHostedCapabilityJobRow(result.rows[0]!, scope, job.id) };
      });
    },
    async replace(input: ViraHostedCapabilityJob, expectedRevision: number) {
      const job = parseHostedCapabilityJob(input);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
        throw new TypeError("Hosted Capability job PostgreSQL expectedRevision is invalid");
      }
      return withTenantTransaction(pool, job.scope, async (client, scope): Promise<ViraHostedCapabilityJobStoreMutationResult> => {
        const result = await client.query<HostedCapabilityJobRow>(
          `UPDATE vira.hosted_capability_job_state
              SET revision = $5, status = $6, record = $7::jsonb, persistence_updated_at = clock_timestamp()
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND job_id = $4 AND revision = $8
            RETURNING organization_id, project_id, environment, job_id, revision, status, record`,
          [scope.organizationId, scope.projectId, scope.environment, job.id, job.revision, job.status, JSON.stringify(job), expectedRevision],
        );
        if (result.rows.length === 1) return { ok: true, value: validateHostedCapabilityJobRow(result.rows[0]!, scope, job.id) };
        if (result.rows.length > 1) throw new TypeError("Hosted Capability job PostgreSQL replace returned duplicate state");
        const code = await classifyMissingOrConflict(
          client,
          `SELECT revision FROM vira.hosted_capability_job_state
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND job_id = $4`,
          [scope.organizationId, scope.projectId, scope.environment, job.id],
        );
        return { ok: false, code };
      });
    },
  });
}
