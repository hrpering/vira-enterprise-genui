import {
  VIRA_ENTERPRISE_CONTEXT_VERSION,
  VIRA_ENTERPRISE_ENVIRONMENTS,
  createViraEnterpriseContext,
  type ViraEnterpriseEnvironmentName,
  type ViraEnterprisePrincipal,
  type ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";
import {
  VIRA_APPLICATION_RUN_VERSION,
  type ViraApplicationRun,
  type ViraApplicationRunService,
} from "./types.js";

export const VIRA_HUMAN_TASK_VERSION = "1" as const;
export const VIRA_HUMAN_TASK_STATUSES = Object.freeze(["assigned", "claimed", "completed", "expired"] as const);

export type ViraHumanTaskStatus = (typeof VIRA_HUMAN_TASK_STATUSES)[number];

export interface ViraHumanTask {
  readonly version: typeof VIRA_HUMAN_TASK_VERSION;
  readonly id: string;
  readonly scope: ViraEnterpriseScope;
  readonly revision: number;
  readonly runId: string;
  readonly runRevision: number;
  readonly waitId: string;
  readonly status: ViraHumanTaskStatus;
  readonly assignee: ViraEnterprisePrincipal;
  readonly claimant: ViraEnterprisePrincipal | null;
  readonly resultRef: string | null;
  readonly evidenceRef: string | null;
  readonly escalationCount: number;
  readonly escalateAtUnixMs: number | null;
  readonly expiresAtUnixMs: number | null;
  readonly lastEscalatedAtUnixMs: number | null;
  readonly createdAtUnixMs: number;
  readonly updatedAtUnixMs: number;
  readonly closedAtUnixMs: number | null;
}

export type ViraHumanTaskStoreMutationCode = "ALREADY_EXISTS" | "NOT_FOUND" | "VERSION_CONFLICT";
export type ViraHumanTaskStoreMutationResult =
  | { readonly ok: true; readonly value: ViraHumanTask }
  | { readonly ok: false; readonly code: ViraHumanTaskStoreMutationCode };

/** Durable store boundary. replace() MUST compare expectedRevision atomically in the write itself. */
export interface ViraHumanTaskStore {
  readonly read: (scope: ViraEnterpriseScope, id: string) => Promise<ViraHumanTask | undefined>;
  readonly create: (task: ViraHumanTask) => Promise<ViraHumanTaskStoreMutationResult>;
  readonly replace: (task: ViraHumanTask, expectedRevision: number) => Promise<ViraHumanTaskStoreMutationResult>;
}

export type ViraHumanTaskIssueCode =
  | "INVALID_SERVICE"
  | "INVALID_INPUT"
  | "INVALID_SCOPE"
  | "INVALID_PRINCIPAL"
  | "INVALID_BINDING"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATE"
  | "ACTOR_MISMATCH"
  | "DEADLINE_NOT_REACHED"
  | "REVISION_OVERFLOW"
  | "STORE_FAILURE";

export interface ViraHumanTaskIssue {
  readonly code: ViraHumanTaskIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraHumanTaskResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraHumanTaskIssue };

export interface ViraHumanTaskAssignInput {
  readonly scope: unknown;
  readonly id: string;
  readonly runId: string;
  readonly expectedRunRevision: number;
  readonly assignee: unknown;
  readonly escalateAtUnixMs: number | null;
  readonly expiresAtUnixMs: number | null;
}

export interface ViraHumanTaskVersionedInput {
  readonly scope: unknown;
  readonly id: string;
  readonly expectedRevision: number;
}

export interface ViraHumanTaskActorInput extends ViraHumanTaskVersionedInput {
  readonly actor: unknown;
}

export interface ViraHumanTaskReassignInput extends ViraHumanTaskVersionedInput {
  readonly assignee: unknown;
}

export interface ViraHumanTaskCompleteInput extends ViraHumanTaskActorInput {
  readonly resultRef: string | null;
  readonly evidenceRef: string | null;
}

export interface ViraHumanTaskEscalateInput extends ViraHumanTaskVersionedInput {
  readonly assignee: unknown;
  readonly nextEscalateAtUnixMs: number | null;
}

export interface ViraHumanTaskServiceConfiguration {
  readonly store: ViraHumanTaskStore;
  readonly runService: Pick<ViraApplicationRunService, "read">;
  readonly nowUnixMs: () => number;
}

export interface ViraHumanTaskService {
  readonly assign: (input: ViraHumanTaskAssignInput) => Promise<ViraHumanTaskResult<ViraHumanTask>>;
  readonly read: (scope: unknown, id: string) => Promise<ViraHumanTaskResult<ViraHumanTask>>;
  readonly claim: (input: ViraHumanTaskActorInput) => Promise<ViraHumanTaskResult<ViraHumanTask>>;
  readonly release: (input: ViraHumanTaskActorInput) => Promise<ViraHumanTaskResult<ViraHumanTask>>;
  readonly reassign: (input: ViraHumanTaskReassignInput) => Promise<ViraHumanTaskResult<ViraHumanTask>>;
  readonly complete: (input: ViraHumanTaskCompleteInput) => Promise<ViraHumanTaskResult<ViraHumanTask>>;
  readonly expire: (input: ViraHumanTaskVersionedInput) => Promise<ViraHumanTaskResult<ViraHumanTask>>;
  readonly escalate: (input: ViraHumanTaskEscalateInput) => Promise<ViraHumanTaskResult<ViraHumanTask>>;
}

const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const LOGICAL_REF = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,511}$/;
const ENTERPRISE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const TASK_STATUSES = new Set<string>(VIRA_HUMAN_TASK_STATUSES);

type Failure = { readonly ok: false; readonly issue: ViraHumanTaskIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function fail<T>(code: ViraHumanTaskIssueCode, path: string, message: string): ViraHumanTaskResult<T> {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const allowed = new Set(fields);
  return Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field))
    && Object.keys(value).every((field) => allowed.has(field));
}

function safePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function safeNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function samePrincipal(left: ViraEnterprisePrincipal, right: ViraEnterprisePrincipal): boolean {
  return left.version === right.version
    && left.kind === right.kind
    && left.id === right.id
    && left.organizationId === right.organizationId;
}

function parseScope(input: unknown): Parsed<ViraEnterpriseScope> {
  if (!record(input) || !exactKeys(input, ["version", "organizationId", "projectId", "environment"])) {
    return fail("INVALID_SCOPE", "$.scope", "Human Task scope must be an exact enterprise scope");
  }
  if (
    input.version !== VIRA_ENTERPRISE_CONTEXT_VERSION
    || typeof input.organizationId !== "string"
    || !ENTERPRISE_ID.test(input.organizationId)
    || typeof input.projectId !== "string"
    || !ENTERPRISE_ID.test(input.projectId)
    || typeof input.environment !== "string"
    || !VIRA_ENTERPRISE_ENVIRONMENTS.includes(input.environment as ViraEnterpriseEnvironmentName)
  ) {
    return fail("INVALID_SCOPE", "$.scope", "Human Task scope is invalid");
  }
  const context = createViraEnterpriseContext({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environments: [input.environment],
  });
  if (!context.ok) return fail("INVALID_SCOPE", "$.scope", "Human Task scope is not canonical");
  const scope = context.value.scope(input.environment as ViraEnterpriseEnvironmentName);
  if (!scope.ok) return fail("INVALID_SCOPE", "$.scope", "Human Task scope is not registered");
  return { ok: true, value: scope.value };
}

function parseUserPrincipal(scope: ViraEnterpriseScope, input: unknown, path: string): Parsed<ViraEnterprisePrincipal> {
  const context = createViraEnterpriseContext({
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    environments: [scope.environment],
  });
  if (!context.ok) return fail("INVALID_SCOPE", "$.scope", "Human Task enterprise context is invalid");
  const principal = context.value.principal(input);
  if (!principal.ok || principal.value.kind !== "user") {
    return fail("INVALID_PRINCIPAL", path, "Human Task principals must be canonical users in the exact organization");
  }
  return { ok: true, value: principal.value };
}

function validRef(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && LOGICAL_REF.test(value));
}

function nextRevision(current: number): number | undefined {
  if (!Number.isSafeInteger(current) || current < 1 || current >= Number.MAX_SAFE_INTEGER) return undefined;
  return current + 1;
}

function canonicalStoredTask(value: ViraHumanTask | undefined, scope: ViraEnterpriseScope, id: string): ViraHumanTask | undefined {
  if (!record(value)) return undefined;
  const task = value as unknown as ViraHumanTask;
  if (!exactKeys(value, [
    "version", "id", "scope", "revision", "runId", "runRevision", "waitId", "status", "assignee", "claimant",
    "resultRef", "evidenceRef", "escalationCount", "escalateAtUnixMs", "expiresAtUnixMs", "lastEscalatedAtUnixMs",
    "createdAtUnixMs", "updatedAtUnixMs", "closedAtUnixMs",
  ])) return undefined;
  const parsedScope = parseScope(task.scope);
  if (!parsedScope.ok || !exactScope(parsedScope.value, scope)) return undefined;
  if (
    task.version !== VIRA_HUMAN_TASK_VERSION
    || task.id !== id
    || !TASK_ID.test(task.id)
    || !safePositive(task.revision)
    || typeof task.runId !== "string"
    || !TASK_ID.test(task.runId)
    || !safePositive(task.runRevision)
    || typeof task.waitId !== "string"
    || !TASK_ID.test(task.waitId)
    || typeof task.status !== "string"
    || !TASK_STATUSES.has(task.status)
    || !safeNonNegative(task.escalationCount)
    || (task.escalateAtUnixMs !== null && !safeNonNegative(task.escalateAtUnixMs))
    || (task.expiresAtUnixMs !== null && !safeNonNegative(task.expiresAtUnixMs))
    || (task.lastEscalatedAtUnixMs !== null && !safeNonNegative(task.lastEscalatedAtUnixMs))
    || !safeNonNegative(task.createdAtUnixMs)
    || !safeNonNegative(task.updatedAtUnixMs)
    || task.updatedAtUnixMs < task.createdAtUnixMs
    || (task.closedAtUnixMs !== null && (!safeNonNegative(task.closedAtUnixMs) || task.closedAtUnixMs < task.createdAtUnixMs || task.closedAtUnixMs > task.updatedAtUnixMs))
    || !validRef(task.resultRef)
    || !validRef(task.evidenceRef)
  ) return undefined;
  if (task.escalateAtUnixMs !== null && task.expiresAtUnixMs !== null && task.escalateAtUnixMs >= task.expiresAtUnixMs) return undefined;
  if (task.escalateAtUnixMs !== null && task.escalateAtUnixMs < task.createdAtUnixMs) return undefined;
  if (task.expiresAtUnixMs !== null && task.expiresAtUnixMs < task.createdAtUnixMs) return undefined;
  if (task.escalationCount === 0 ? task.lastEscalatedAtUnixMs !== null : task.lastEscalatedAtUnixMs === null) return undefined;
  if (task.lastEscalatedAtUnixMs !== null && task.lastEscalatedAtUnixMs > task.updatedAtUnixMs) return undefined;
  const assignee = parseUserPrincipal(scope, task.assignee, "$.assignee");
  if (!assignee.ok) return undefined;
  const claimant = task.claimant === null ? null : parseUserPrincipal(scope, task.claimant, "$.claimant");
  if (claimant !== null && !claimant.ok) return undefined;
  if (task.status === "assigned" && task.claimant !== null) return undefined;
  if (task.status === "claimed" && task.claimant === null) return undefined;
  if ((task.status === "assigned" || task.status === "claimed") && task.closedAtUnixMs !== null) return undefined;
  if ((task.status === "completed" || task.status === "expired") && task.closedAtUnixMs === null) return undefined;
  if (task.status === "completed" && task.claimant === null) return undefined;
  if (task.status !== "completed" && (task.resultRef !== null || task.evidenceRef !== null)) return undefined;
  return task;
}

function sameAssignment(left: ViraHumanTask, right: ViraHumanTask): boolean {
  return exactScope(left.scope, right.scope)
    && left.id === right.id
    && left.runId === right.runId
    && left.runRevision === right.runRevision
    && left.waitId === right.waitId
    && samePrincipal(left.assignee, right.assignee)
    && left.escalateAtUnixMs === right.escalateAtUnixMs
    && left.expiresAtUnixMs === right.expiresAtUnixMs;
}

function mapMutation(result: ViraHumanTaskStoreMutationResult): ViraHumanTaskResult<ViraHumanTask> {
  if (result.ok) return result;
  if (result.code === "VERSION_CONFLICT" || result.code === "ALREADY_EXISTS") {
    return fail("CONFLICT", "$", "Human Task durable state changed concurrently");
  }
  return fail("NOT_FOUND", "$", "Human Task does not exist");
}

export function createViraHumanTaskService(
  config: ViraHumanTaskServiceConfiguration,
): ViraHumanTaskResult<ViraHumanTaskService> {
  if (
    config === null
    || typeof config !== "object"
    || config.store === null
    || typeof config.store !== "object"
    || typeof config.store.read !== "function"
    || typeof config.store.create !== "function"
    || typeof config.store.replace !== "function"
    || config.runService === null
    || typeof config.runService !== "object"
    || typeof config.runService.read !== "function"
    || typeof config.nowUnixMs !== "function"
  ) return fail("INVALID_SERVICE", "$", "Human Task service requires durable CAS store, ApplicationRun reader and clock");

  const store = config.store;
  const runService = config.runService;
  const nowUnixMs = config.nowUnixMs;

  function readNow(): Parsed<number> {
    let now: number;
    try { now = nowUnixMs(); } catch { return fail("INVALID_SERVICE", "$.clock", "Human Task clock failed closed"); }
    if (!safeNonNegative(now)) return fail("INVALID_SERVICE", "$.clock", "Human Task clock must return a non-negative safe integer");
    return { ok: true, value: now };
  }

  async function readStored(scope: ViraEnterpriseScope, id: string): Promise<ViraHumanTaskResult<ViraHumanTask>> {
    let raw: ViraHumanTask | undefined;
    try { raw = await store.read(scope, id); } catch { return fail("STORE_FAILURE", "$.store", "Human Task store read failed closed"); }
    if (raw === undefined) return fail("NOT_FOUND", "$.id", "Human Task was not found in the exact enterprise scope");
    const task = canonicalStoredTask(raw, scope, id);
    if (!task) return fail("STORE_FAILURE", "$.store", "Human Task store returned a non-canonical or cross-scope record");
    return { ok: true, value: task };
  }

  async function commit(next: ViraHumanTask, expectedRevision: number, message: string): Promise<ViraHumanTaskResult<ViraHumanTask>> {
    let stored: ViraHumanTaskStoreMutationResult;
    try { stored = await store.replace(next, expectedRevision); } catch { return fail("STORE_FAILURE", "$.store", message); }
    return mapMutation(stored);
  }

  const service: ViraHumanTaskService = {
    async assign(input) {
      if (!record(input) || !exactKeys(input, ["scope", "id", "runId", "expectedRunRevision", "assignee", "escalateAtUnixMs", "expiresAtUnixMs"])) {
        return fail("INVALID_INPUT", "$", "Human Task assign input must be an exact object");
      }
      if (
        typeof input.id !== "string"
        || !TASK_ID.test(input.id)
        || typeof input.runId !== "string"
        || !TASK_ID.test(input.runId)
        || !safePositive(input.expectedRunRevision)
        || (input.escalateAtUnixMs !== null && !safeNonNegative(input.escalateAtUnixMs))
        || (input.expiresAtUnixMs !== null && !safeNonNegative(input.expiresAtUnixMs))
      ) return fail("INVALID_INPUT", "$", "Human Task assignment identity or timing is invalid");
      const scope = parseScope(input.scope);
      if (!scope.ok) return scope;
      const assignee = parseUserPrincipal(scope.value, input.assignee, "$.assignee");
      if (!assignee.ok) return assignee;
      const now = readNow();
      if (!now.ok) return now;
      if (input.escalateAtUnixMs !== null && input.escalateAtUnixMs < now.value) {
        return fail("INVALID_INPUT", "$.escalateAtUnixMs", "Human Task escalation deadline cannot already be in the past");
      }
      if (input.expiresAtUnixMs !== null && input.expiresAtUnixMs < now.value) {
        return fail("INVALID_INPUT", "$.expiresAtUnixMs", "Human Task expiry deadline cannot already be in the past");
      }
      if (input.escalateAtUnixMs !== null && input.expiresAtUnixMs !== null && input.escalateAtUnixMs >= input.expiresAtUnixMs) {
        return fail("INVALID_INPUT", "$.escalateAtUnixMs", "Human Task escalation must precede expiry");
      }
      let runResult;
      try { runResult = await runService.read(scope.value, input.runId); } catch {
        return fail("INVALID_BINDING", "$.runId", "Human Task could not verify its ApplicationRun binding");
      }
      if (!runResult.ok) return fail("INVALID_BINDING", "$.runId", "Human Task requires an existing ApplicationRun in the exact scope");
      const run: ViraApplicationRun = runResult.value;
      if (
        run.version !== VIRA_APPLICATION_RUN_VERSION
        || run.revision !== input.expectedRunRevision
        || run.status !== "waiting"
        || run.wait === null
        || run.wait.kind !== "human-task"
        || run.wait.reference !== input.id
      ) {
        return fail("INVALID_BINDING", "$.runId", "Human Task must bind the exact waiting human-task ApplicationRun revision/reference");
      }
      const task: ViraHumanTask = Object.freeze({
        version: VIRA_HUMAN_TASK_VERSION,
        id: input.id,
        scope: scope.value,
        revision: 1,
        runId: run.id,
        runRevision: run.revision,
        waitId: run.wait.id,
        status: "assigned",
        assignee: assignee.value,
        claimant: null,
        resultRef: null,
        evidenceRef: null,
        escalationCount: 0,
        escalateAtUnixMs: input.escalateAtUnixMs,
        expiresAtUnixMs: input.expiresAtUnixMs,
        lastEscalatedAtUnixMs: null,
        createdAtUnixMs: now.value,
        updatedAtUnixMs: now.value,
        closedAtUnixMs: null,
      });
      let stored: ViraHumanTaskStoreMutationResult;
      try { stored = await store.create(task); } catch { return fail("STORE_FAILURE", "$.store", "Human Task assignment failed closed"); }
      if (!stored.ok && stored.code === "ALREADY_EXISTS") {
        const existing = await readStored(scope.value, input.id);
        if (!existing.ok) return existing;
        return sameAssignment(existing.value, task)
          ? existing
          : fail("CONFLICT", "$.id", "Human Task id is already bound to a different assignment");
      }
      return mapMutation(stored);
    },

    async read(scopeInput, id) {
      if (typeof id !== "string" || !TASK_ID.test(id)) return fail("INVALID_INPUT", "$.id", "Human Task id is invalid");
      const scope = parseScope(scopeInput);
      if (!scope.ok) return scope;
      return readStored(scope.value, id);
    },

    async claim(input) {
      if (!record(input) || !exactKeys(input, ["scope", "id", "expectedRevision", "actor"]) || typeof input.id !== "string" || !TASK_ID.test(input.id) || !safePositive(input.expectedRevision)) {
        return fail("INVALID_INPUT", "$", "Human Task claim input is invalid");
      }
      const scope = parseScope(input.scope); if (!scope.ok) return scope;
      const actor = parseUserPrincipal(scope.value, input.actor, "$.actor"); if (!actor.ok) return actor;
      const current = await readStored(scope.value, input.id); if (!current.ok) return current;
      if (current.value.revision !== input.expectedRevision) return fail("CONFLICT", "$.expectedRevision", "Human Task revision is stale");
      if (current.value.status !== "assigned" || current.value.claimant !== null) return fail("INVALID_STATE", "$.status", "only an assigned Human Task can be claimed");
      if (!samePrincipal(current.value.assignee, actor.value)) return fail("ACTOR_MISMATCH", "$.actor", "only the current assignee may claim this Human Task");
      const revision = nextRevision(current.value.revision); if (revision === undefined) return fail("REVISION_OVERFLOW", "$.revision", "Human Task revision cannot advance safely");
      const now = readNow(); if (!now.ok) return now;
      return commit(Object.freeze({ ...current.value, revision, status: "claimed", claimant: actor.value, updatedAtUnixMs: now.value }), input.expectedRevision, "Human Task claim failed closed");
    },

    async release(input) {
      if (!record(input) || !exactKeys(input, ["scope", "id", "expectedRevision", "actor"]) || typeof input.id !== "string" || !TASK_ID.test(input.id) || !safePositive(input.expectedRevision)) {
        return fail("INVALID_INPUT", "$", "Human Task release input is invalid");
      }
      const scope = parseScope(input.scope); if (!scope.ok) return scope;
      const actor = parseUserPrincipal(scope.value, input.actor, "$.actor"); if (!actor.ok) return actor;
      const current = await readStored(scope.value, input.id); if (!current.ok) return current;
      if (current.value.revision !== input.expectedRevision) return fail("CONFLICT", "$.expectedRevision", "Human Task revision is stale");
      if (current.value.status !== "claimed" || current.value.claimant === null) return fail("INVALID_STATE", "$.status", "only a claimed Human Task can be released");
      if (!samePrincipal(current.value.claimant, actor.value)) return fail("ACTOR_MISMATCH", "$.actor", "only the current claimant may release this Human Task");
      const revision = nextRevision(current.value.revision); if (revision === undefined) return fail("REVISION_OVERFLOW", "$.revision", "Human Task revision cannot advance safely");
      const now = readNow(); if (!now.ok) return now;
      return commit(Object.freeze({ ...current.value, revision, status: "assigned", claimant: null, updatedAtUnixMs: now.value }), input.expectedRevision, "Human Task release failed closed");
    },

    async reassign(input) {
      if (!record(input) || !exactKeys(input, ["scope", "id", "expectedRevision", "assignee"]) || typeof input.id !== "string" || !TASK_ID.test(input.id) || !safePositive(input.expectedRevision)) {
        return fail("INVALID_INPUT", "$", "Human Task reassign input is invalid");
      }
      const scope = parseScope(input.scope); if (!scope.ok) return scope;
      const assignee = parseUserPrincipal(scope.value, input.assignee, "$.assignee"); if (!assignee.ok) return assignee;
      const current = await readStored(scope.value, input.id); if (!current.ok) return current;
      if (current.value.revision !== input.expectedRevision) return fail("CONFLICT", "$.expectedRevision", "Human Task revision is stale");
      if (current.value.status !== "assigned" || current.value.claimant !== null) return fail("INVALID_STATE", "$.status", "claimed or closed Human Tasks cannot be reassigned");
      if (samePrincipal(current.value.assignee, assignee.value)) return fail("INVALID_INPUT", "$.assignee", "Human Task is already assigned to this user");
      const revision = nextRevision(current.value.revision); if (revision === undefined) return fail("REVISION_OVERFLOW", "$.revision", "Human Task revision cannot advance safely");
      const now = readNow(); if (!now.ok) return now;
      return commit(Object.freeze({ ...current.value, revision, assignee: assignee.value, updatedAtUnixMs: now.value }), input.expectedRevision, "Human Task reassign failed closed");
    },

    async complete(input) {
      if (!record(input) || !exactKeys(input, ["scope", "id", "expectedRevision", "actor", "resultRef", "evidenceRef"]) || typeof input.id !== "string" || !TASK_ID.test(input.id) || !safePositive(input.expectedRevision) || !validRef(input.resultRef) || !validRef(input.evidenceRef)) {
        return fail("INVALID_INPUT", "$", "Human Task completion input is invalid");
      }
      const scope = parseScope(input.scope); if (!scope.ok) return scope;
      const actor = parseUserPrincipal(scope.value, input.actor, "$.actor"); if (!actor.ok) return actor;
      const current = await readStored(scope.value, input.id); if (!current.ok) return current;
      if (current.value.revision !== input.expectedRevision) return fail("CONFLICT", "$.expectedRevision", "Human Task revision is stale");
      if (current.value.status !== "claimed" || current.value.claimant === null) return fail("INVALID_STATE", "$.status", "only a claimed Human Task can be completed");
      if (!samePrincipal(current.value.claimant, actor.value)) return fail("ACTOR_MISMATCH", "$.actor", "only the current claimant may complete this Human Task");
      const revision = nextRevision(current.value.revision); if (revision === undefined) return fail("REVISION_OVERFLOW", "$.revision", "Human Task revision cannot advance safely");
      const now = readNow(); if (!now.ok) return now;
      return commit(Object.freeze({
        ...current.value,
        revision,
        status: "completed",
        resultRef: input.resultRef,
        evidenceRef: input.evidenceRef,
        updatedAtUnixMs: now.value,
        closedAtUnixMs: now.value,
      }), input.expectedRevision, "Human Task completion failed closed");
    },

    async expire(input) {
      if (!record(input) || !exactKeys(input, ["scope", "id", "expectedRevision"]) || typeof input.id !== "string" || !TASK_ID.test(input.id) || !safePositive(input.expectedRevision)) {
        return fail("INVALID_INPUT", "$", "Human Task expire input is invalid");
      }
      const scope = parseScope(input.scope); if (!scope.ok) return scope;
      const current = await readStored(scope.value, input.id); if (!current.ok) return current;
      if (current.value.revision !== input.expectedRevision) return fail("CONFLICT", "$.expectedRevision", "Human Task revision is stale");
      if (current.value.status !== "assigned" && current.value.status !== "claimed") return fail("INVALID_STATE", "$.status", "closed Human Tasks cannot expire again");
      if (current.value.expiresAtUnixMs === null) return fail("INVALID_STATE", "$.expiresAtUnixMs", "Human Task has no expiry deadline");
      const now = readNow(); if (!now.ok) return now;
      if (now.value < current.value.expiresAtUnixMs) return fail("DEADLINE_NOT_REACHED", "$.expiresAtUnixMs", "Human Task expiry deadline has not been reached");
      const revision = nextRevision(current.value.revision); if (revision === undefined) return fail("REVISION_OVERFLOW", "$.revision", "Human Task revision cannot advance safely");
      return commit(Object.freeze({
        ...current.value,
        revision,
        status: "expired",
        resultRef: null,
        evidenceRef: null,
        updatedAtUnixMs: now.value,
        closedAtUnixMs: now.value,
      }), input.expectedRevision, "Human Task expiry failed closed");
    },

    async escalate(input) {
      if (!record(input) || !exactKeys(input, ["scope", "id", "expectedRevision", "assignee", "nextEscalateAtUnixMs"]) || typeof input.id !== "string" || !TASK_ID.test(input.id) || !safePositive(input.expectedRevision) || (input.nextEscalateAtUnixMs !== null && !safeNonNegative(input.nextEscalateAtUnixMs))) {
        return fail("INVALID_INPUT", "$", "Human Task escalate input is invalid");
      }
      const scope = parseScope(input.scope); if (!scope.ok) return scope;
      const assignee = parseUserPrincipal(scope.value, input.assignee, "$.assignee"); if (!assignee.ok) return assignee;
      const current = await readStored(scope.value, input.id); if (!current.ok) return current;
      if (current.value.revision !== input.expectedRevision) return fail("CONFLICT", "$.expectedRevision", "Human Task revision is stale");
      if (current.value.status !== "assigned" || current.value.claimant !== null) return fail("INVALID_STATE", "$.status", "only an unclaimed assigned Human Task can escalate");
      if (current.value.escalateAtUnixMs === null) return fail("INVALID_STATE", "$.escalateAtUnixMs", "Human Task has no escalation deadline");
      if (samePrincipal(current.value.assignee, assignee.value)) return fail("INVALID_INPUT", "$.assignee", "Human Task escalation must move to a different user");
      const now = readNow(); if (!now.ok) return now;
      if (now.value < current.value.escalateAtUnixMs) return fail("DEADLINE_NOT_REACHED", "$.escalateAtUnixMs", "Human Task escalation deadline has not been reached");
      if (input.nextEscalateAtUnixMs !== null && input.nextEscalateAtUnixMs <= now.value) {
        return fail("INVALID_INPUT", "$.nextEscalateAtUnixMs", "next escalation deadline must be in the future");
      }
      if (input.nextEscalateAtUnixMs !== null && current.value.expiresAtUnixMs !== null && input.nextEscalateAtUnixMs >= current.value.expiresAtUnixMs) {
        return fail("INVALID_INPUT", "$.nextEscalateAtUnixMs", "next escalation deadline must precede expiry");
      }
      if (current.value.escalationCount >= Number.MAX_SAFE_INTEGER) return fail("REVISION_OVERFLOW", "$.escalationCount", "Human Task escalation count cannot advance safely");
      const revision = nextRevision(current.value.revision); if (revision === undefined) return fail("REVISION_OVERFLOW", "$.revision", "Human Task revision cannot advance safely");
      return commit(Object.freeze({
        ...current.value,
        revision,
        assignee: assignee.value,
        escalationCount: current.value.escalationCount + 1,
        escalateAtUnixMs: input.nextEscalateAtUnixMs,
        lastEscalatedAtUnixMs: now.value,
        updatedAtUnixMs: now.value,
      }), input.expectedRevision, "Human Task escalation failed closed");
    },
  };

  return { ok: true, value: Object.freeze(service) };
}
