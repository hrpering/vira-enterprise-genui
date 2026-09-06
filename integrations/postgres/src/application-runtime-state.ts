import {
  VIRA_APPLICATION_RUN_STATUSES,
  VIRA_APPLICATION_RUN_VERSION,
  VIRA_HUMAN_TASK_STATUSES,
  VIRA_HUMAN_TASK_VERSION,
  VIRA_TRIGGER_INBOX_STATUSES,
  VIRA_TRIGGER_INBOX_VERSION,
  type ViraApplicationRun,
  type ViraApplicationRunStore,
  type ViraApplicationRunStoreMutationResult,
  type ViraHumanTask,
  type ViraHumanTaskStore,
  type ViraHumanTaskStoreMutationResult,
  type ViraTriggerInboxRecord,
  type ViraTriggerInboxStore,
  type ViraTriggerInboxStoreMutationResult,
} from "../../../packages/application-runtime/src/index.js";
import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import { parseJsonValue, type JsonObject, type JsonValue } from "../../../packages/protocol/src/index.js";
import {
  canonicalizeEnterpriseScope,
  withTenantTransaction,
  type PostgresClientLike,
  type PostgresPoolLike,
} from "./transaction.js";

interface StateRow extends Record<string, unknown> {
  readonly organization_id: unknown;
  readonly project_id: unknown;
  readonly environment: unknown;
  readonly revision: unknown;
  readonly status: unknown;
  readonly record: unknown;
  readonly run_id?: unknown;
  readonly task_id?: unknown;
  readonly source_ref?: unknown;
  readonly event_id?: unknown;
}

const RUN_STATUSES = new Set<string>(VIRA_APPLICATION_RUN_STATUSES);
const TASK_STATUSES = new Set<string>(VIRA_HUMAN_TASK_STATUSES);
const TRIGGER_STATUSES = new Set<string>(VIRA_TRIGGER_INBOX_STATUSES);

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function safePositive(value: JsonValue | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function freezeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return Object.freeze(value.map((item) => freezeJson(item)));
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeJson(item)]))) as JsonObject;
  }
  return value;
}

function parseRecord(input: unknown, label: string): JsonObject {
  const parsed = parseJsonValue(input);
  if (!parsed.ok || !isObject(parsed.value)) throw new TypeError(`${label} PostgreSQL record must be canonical JSON`);
  return parsed.value;
}

function recordScope(record: JsonObject, label: string): ViraEnterpriseScope {
  try {
    return canonicalizeEnterpriseScope(record.scope);
  } catch {
    throw new TypeError(`${label} PostgreSQL record has an invalid enterprise scope`);
  }
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function rowScope(row: StateRow, label: string): ViraEnterpriseScope {
  try {
    return canonicalizeEnterpriseScope({
      version: "1",
      organizationId: row.organization_id,
      projectId: row.project_id,
      environment: row.environment,
    });
  } catch {
    throw new TypeError(`${label} PostgreSQL row scope is invalid`);
  }
}

function rowRevision(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1) return value;
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  throw new TypeError(`${label} PostgreSQL row revision is invalid`);
}

function validatePool(pool: PostgresPoolLike): void {
  if (pool === null || typeof pool !== "object" || typeof pool.connect !== "function") {
    throw new TypeError("PostgreSQL Application runtime stores require a pool");
  }
}

function parseApplicationRun(input: unknown): ViraApplicationRun {
  const record = parseRecord(input, "ApplicationRun");
  if (
    record.version !== VIRA_APPLICATION_RUN_VERSION
    || typeof record.id !== "string"
    || record.id.length < 1
    || record.id.length > 128
    || !safePositive(record.revision)
    || typeof record.status !== "string"
    || !RUN_STATUSES.has(record.status)
  ) throw new TypeError("ApplicationRun PostgreSQL record identity is invalid");
  recordScope(record, "ApplicationRun");
  return freezeJson(record) as unknown as ViraApplicationRun;
}

function parseHumanTask(input: unknown): ViraHumanTask {
  const record = parseRecord(input, "Human Task");
  if (
    record.version !== VIRA_HUMAN_TASK_VERSION
    || typeof record.id !== "string"
    || record.id.length < 1
    || record.id.length > 128
    || !safePositive(record.revision)
    || typeof record.status !== "string"
    || !TASK_STATUSES.has(record.status)
  ) throw new TypeError("Human Task PostgreSQL record identity is invalid");
  recordScope(record, "Human Task");
  return freezeJson(record) as unknown as ViraHumanTask;
}

function parseTriggerRecord(input: unknown): ViraTriggerInboxRecord {
  const record = parseRecord(input, "Trigger inbox");
  if (
    record.version !== VIRA_TRIGGER_INBOX_VERSION
    || typeof record.sourceRef !== "string"
    || record.sourceRef.length < 1
    || record.sourceRef.length > 512
    || typeof record.eventId !== "string"
    || record.eventId.length < 1
    || record.eventId.length > 512
    || !safePositive(record.revision)
    || typeof record.status !== "string"
    || !TRIGGER_STATUSES.has(record.status)
  ) throw new TypeError("Trigger inbox PostgreSQL record identity is invalid");
  recordScope(record, "Trigger inbox");
  return freezeJson(record) as unknown as ViraTriggerInboxRecord;
}

function validateApplicationRunRow(row: StateRow, expectedScope: ViraEnterpriseScope, expectedId: string): ViraApplicationRun {
  const run = parseApplicationRun(row.record);
  const persistedScope = rowScope(row, "ApplicationRun");
  const revision = rowRevision(row.revision, "ApplicationRun");
  if (
    !exactScope(persistedScope, expectedScope)
    || !exactScope(run.scope, expectedScope)
    || row.run_id !== expectedId
    || run.id !== expectedId
    || run.revision !== revision
    || row.status !== run.status
  ) throw new TypeError("ApplicationRun PostgreSQL row conflicts with its canonical record");
  return run;
}

function validateHumanTaskRow(row: StateRow, expectedScope: ViraEnterpriseScope, expectedId: string): ViraHumanTask {
  const task = parseHumanTask(row.record);
  const persistedScope = rowScope(row, "Human Task");
  const revision = rowRevision(row.revision, "Human Task");
  if (
    !exactScope(persistedScope, expectedScope)
    || !exactScope(task.scope, expectedScope)
    || row.task_id !== expectedId
    || task.id !== expectedId
    || task.revision !== revision
    || row.status !== task.status
  ) throw new TypeError("Human Task PostgreSQL row conflicts with its canonical record");
  return task;
}

function validateTriggerRow(
  row: StateRow,
  expectedScope: ViraEnterpriseScope,
  expectedSourceRef: string,
  expectedEventId: string,
): ViraTriggerInboxRecord {
  const item = parseTriggerRecord(row.record);
  const persistedScope = rowScope(row, "Trigger inbox");
  const revision = rowRevision(row.revision, "Trigger inbox");
  if (
    !exactScope(persistedScope, expectedScope)
    || !exactScope(item.scope, expectedScope)
    || row.source_ref !== expectedSourceRef
    || row.event_id !== expectedEventId
    || item.sourceRef !== expectedSourceRef
    || item.eventId !== expectedEventId
    || item.revision !== revision
    || row.status !== item.status
  ) throw new TypeError("Trigger inbox PostgreSQL row conflicts with its canonical record");
  return item;
}

async function classifyMissingOrConflict(
  client: PostgresClientLike,
  text: string,
  values: readonly unknown[],
): Promise<"NOT_FOUND" | "VERSION_CONFLICT"> {
  const existing = await client.query<{ revision: unknown }>(text, values);
  return existing.rows.length === 0 ? "NOT_FOUND" : "VERSION_CONFLICT";
}

export function createPostgresApplicationRunStore(pool: PostgresPoolLike): ViraApplicationRunStore {
  validatePool(pool);
  return Object.freeze({
    async read(scopeInput, id) {
      const scope = canonicalizeEnterpriseScope(scopeInput);
      if (typeof id !== "string" || id.length < 1 || id.length > 128) throw new TypeError("ApplicationRun PostgreSQL id is invalid");
      return withTenantTransaction(pool, scope, async (client, transactionScope) => {
        const result = await client.query<StateRow>(
          `SELECT organization_id, project_id, environment, run_id, revision, status, record
             FROM vira.application_run_state
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND run_id = $4`,
          [transactionScope.organizationId, transactionScope.projectId, transactionScope.environment, id],
        );
        if (result.rows.length === 0) return undefined;
        if (result.rows.length !== 1) throw new TypeError("ApplicationRun PostgreSQL read returned duplicate state");
        return validateApplicationRunRow(result.rows[0]!, transactionScope, id);
      });
    },
    async create(input) {
      const run = parseApplicationRun(input);
      return withTenantTransaction(pool, run.scope, async (client, scope): Promise<ViraApplicationRunStoreMutationResult> => {
        const result = await client.query<StateRow>(
          `INSERT INTO vira.application_run_state
             (organization_id, project_id, environment, run_id, revision, status, record)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (organization_id, project_id, environment, run_id) DO NOTHING
           RETURNING organization_id, project_id, environment, run_id, revision, status, record`,
          [scope.organizationId, scope.projectId, scope.environment, run.id, run.revision, run.status, JSON.stringify(run)],
        );
        if (result.rows.length === 0) return { ok: false, code: "ALREADY_EXISTS" };
        if (result.rows.length !== 1) throw new TypeError("ApplicationRun PostgreSQL create returned duplicate state");
        return { ok: true, value: validateApplicationRunRow(result.rows[0]!, scope, run.id) };
      });
    },
    async replace(input, expectedRevision) {
      const run = parseApplicationRun(input);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new TypeError("ApplicationRun PostgreSQL expectedRevision is invalid");
      return withTenantTransaction(pool, run.scope, async (client, scope): Promise<ViraApplicationRunStoreMutationResult> => {
        const result = await client.query<StateRow>(
          `UPDATE vira.application_run_state
              SET revision = $5, status = $6, record = $7::jsonb, persistence_updated_at = clock_timestamp()
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND run_id = $4 AND revision = $8
            RETURNING organization_id, project_id, environment, run_id, revision, status, record`,
          [scope.organizationId, scope.projectId, scope.environment, run.id, run.revision, run.status, JSON.stringify(run), expectedRevision],
        );
        if (result.rows.length === 1) return { ok: true, value: validateApplicationRunRow(result.rows[0]!, scope, run.id) };
        if (result.rows.length > 1) throw new TypeError("ApplicationRun PostgreSQL replace returned duplicate state");
        const code = await classifyMissingOrConflict(
          client,
          `SELECT revision FROM vira.application_run_state
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND run_id = $4`,
          [scope.organizationId, scope.projectId, scope.environment, run.id],
        );
        return { ok: false, code };
      });
    },
  });
}

export function createPostgresHumanTaskStore(pool: PostgresPoolLike): ViraHumanTaskStore {
  validatePool(pool);
  return Object.freeze({
    async read(scopeInput, id) {
      const scope = canonicalizeEnterpriseScope(scopeInput);
      if (typeof id !== "string" || id.length < 1 || id.length > 128) throw new TypeError("Human Task PostgreSQL id is invalid");
      return withTenantTransaction(pool, scope, async (client, transactionScope) => {
        const result = await client.query<StateRow>(
          `SELECT organization_id, project_id, environment, task_id, revision, status, record
             FROM vira.human_task_state
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND task_id = $4`,
          [transactionScope.organizationId, transactionScope.projectId, transactionScope.environment, id],
        );
        if (result.rows.length === 0) return undefined;
        if (result.rows.length !== 1) throw new TypeError("Human Task PostgreSQL read returned duplicate state");
        return validateHumanTaskRow(result.rows[0]!, transactionScope, id);
      });
    },
    async create(input) {
      const task = parseHumanTask(input);
      return withTenantTransaction(pool, task.scope, async (client, scope): Promise<ViraHumanTaskStoreMutationResult> => {
        const result = await client.query<StateRow>(
          `INSERT INTO vira.human_task_state
             (organization_id, project_id, environment, task_id, revision, status, record)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (organization_id, project_id, environment, task_id) DO NOTHING
           RETURNING organization_id, project_id, environment, task_id, revision, status, record`,
          [scope.organizationId, scope.projectId, scope.environment, task.id, task.revision, task.status, JSON.stringify(task)],
        );
        if (result.rows.length === 0) return { ok: false, code: "ALREADY_EXISTS" };
        if (result.rows.length !== 1) throw new TypeError("Human Task PostgreSQL create returned duplicate state");
        return { ok: true, value: validateHumanTaskRow(result.rows[0]!, scope, task.id) };
      });
    },
    async replace(input, expectedRevision) {
      const task = parseHumanTask(input);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new TypeError("Human Task PostgreSQL expectedRevision is invalid");
      return withTenantTransaction(pool, task.scope, async (client, scope): Promise<ViraHumanTaskStoreMutationResult> => {
        const result = await client.query<StateRow>(
          `UPDATE vira.human_task_state
              SET revision = $5, status = $6, record = $7::jsonb, persistence_updated_at = clock_timestamp()
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND task_id = $4 AND revision = $8
            RETURNING organization_id, project_id, environment, task_id, revision, status, record`,
          [scope.organizationId, scope.projectId, scope.environment, task.id, task.revision, task.status, JSON.stringify(task), expectedRevision],
        );
        if (result.rows.length === 1) return { ok: true, value: validateHumanTaskRow(result.rows[0]!, scope, task.id) };
        if (result.rows.length > 1) throw new TypeError("Human Task PostgreSQL replace returned duplicate state");
        const code = await classifyMissingOrConflict(
          client,
          `SELECT revision FROM vira.human_task_state
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND task_id = $4`,
          [scope.organizationId, scope.projectId, scope.environment, task.id],
        );
        return { ok: false, code };
      });
    },
  });
}

export function createPostgresTriggerInboxStore(pool: PostgresPoolLike): ViraTriggerInboxStore {
  validatePool(pool);
  return Object.freeze({
    async read(scopeInput, sourceRef, eventId) {
      const scope = canonicalizeEnterpriseScope(scopeInput);
      if (typeof sourceRef !== "string" || sourceRef.length < 1 || sourceRef.length > 512) throw new TypeError("Trigger inbox PostgreSQL sourceRef is invalid");
      if (typeof eventId !== "string" || eventId.length < 1 || eventId.length > 512) throw new TypeError("Trigger inbox PostgreSQL eventId is invalid");
      return withTenantTransaction(pool, scope, async (client, transactionScope) => {
        const result = await client.query<StateRow>(
          `SELECT organization_id, project_id, environment, source_ref, event_id, revision, status, record
             FROM vira.trigger_inbox_state
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND source_ref = $4 AND event_id = $5`,
          [transactionScope.organizationId, transactionScope.projectId, transactionScope.environment, sourceRef, eventId],
        );
        if (result.rows.length === 0) return undefined;
        if (result.rows.length !== 1) throw new TypeError("Trigger inbox PostgreSQL read returned duplicate state");
        return validateTriggerRow(result.rows[0]!, transactionScope, sourceRef, eventId);
      });
    },
    async create(input) {
      const item = parseTriggerRecord(input);
      return withTenantTransaction(pool, item.scope, async (client, scope): Promise<ViraTriggerInboxStoreMutationResult> => {
        const result = await client.query<StateRow>(
          `INSERT INTO vira.trigger_inbox_state
             (organization_id, project_id, environment, source_ref, event_id, revision, status, record)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
           ON CONFLICT (organization_id, project_id, environment, source_ref, event_id) DO NOTHING
           RETURNING organization_id, project_id, environment, source_ref, event_id, revision, status, record`,
          [scope.organizationId, scope.projectId, scope.environment, item.sourceRef, item.eventId, item.revision, item.status, JSON.stringify(item)],
        );
        if (result.rows.length === 0) return { ok: false, code: "ALREADY_EXISTS" };
        if (result.rows.length !== 1) throw new TypeError("Trigger inbox PostgreSQL create returned duplicate state");
        return { ok: true, value: validateTriggerRow(result.rows[0]!, scope, item.sourceRef, item.eventId) };
      });
    },
    async replace(input, expectedRevision) {
      const item = parseTriggerRecord(input);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new TypeError("Trigger inbox PostgreSQL expectedRevision is invalid");
      return withTenantTransaction(pool, item.scope, async (client, scope): Promise<ViraTriggerInboxStoreMutationResult> => {
        const result = await client.query<StateRow>(
          `UPDATE vira.trigger_inbox_state
              SET revision = $6, status = $7, record = $8::jsonb, persistence_updated_at = clock_timestamp()
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND source_ref = $4 AND event_id = $5 AND revision = $9
            RETURNING organization_id, project_id, environment, source_ref, event_id, revision, status, record`,
          [scope.organizationId, scope.projectId, scope.environment, item.sourceRef, item.eventId, item.revision, item.status, JSON.stringify(item), expectedRevision],
        );
        if (result.rows.length === 1) return { ok: true, value: validateTriggerRow(result.rows[0]!, scope, item.sourceRef, item.eventId) };
        if (result.rows.length > 1) throw new TypeError("Trigger inbox PostgreSQL replace returned duplicate state");
        const code = await classifyMissingOrConflict(
          client,
          `SELECT revision FROM vira.trigger_inbox_state
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND source_ref = $4 AND event_id = $5`,
          [scope.organizationId, scope.projectId, scope.environment, item.sourceRef, item.eventId],
        );
        return { ok: false, code };
      });
    },
  });
}
