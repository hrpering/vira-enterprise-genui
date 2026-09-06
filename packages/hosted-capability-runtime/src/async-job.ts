import {
  parseViraCapabilityDefinition,
  parseViraCapabilityExactReference,
  type ViraCapabilityExactReference,
} from "@vira-enterprise-genui/capability-contract";
import {
  createViraEnterpriseContext,
  type ViraEnterpriseEnvironmentName,
  type ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";
import { isSemanticNamespace, parseJsonValue, type JsonValue } from "@vira-enterprise-genui/protocol";
import { parseViraHostedCapabilityBinding } from "./runtime.js";
import {
  VIRA_HOSTED_CAPABILITY_FAILURE_CODE_MAX_LENGTH,
  VIRA_HOSTED_CAPABILITY_INVOCATION_ID_MAX_LENGTH,
  type ViraHostedCapabilityProviderFailure,
  type ViraHostedCapabilityValue,
} from "./types.js";
import {
  VIRA_HOSTED_CAPABILITY_COMPLETION_ID_MAX_LENGTH,
  VIRA_HOSTED_CAPABILITY_JOB_COMPLETION_MODES,
  VIRA_HOSTED_CAPABILITY_JOB_COMPLETION_SOURCES,
  VIRA_HOSTED_CAPABILITY_JOB_ID_MAX_LENGTH,
  VIRA_HOSTED_CAPABILITY_JOB_RETRY_POLICIES,
  VIRA_HOSTED_CAPABILITY_JOB_VERSION,
  VIRA_HOSTED_CAPABILITY_PROVIDER_JOB_REF_MAX_LENGTH,
  type ViraHostedCapabilityJob,
  type ViraHostedCapabilityJobAuthorizedMutationInput,
  type ViraHostedCapabilityJobCompletion,
  type ViraHostedCapabilityJobCompletionInput,
  type ViraHostedCapabilityJobIssue,
  type ViraHostedCapabilityJobIssueCode,
  type ViraHostedCapabilityJobMutationInput,
  type ViraHostedCapabilityJobResult,
  type ViraHostedCapabilityJobService,
  type ViraHostedCapabilityJobServiceConfiguration,
  type ViraHostedCapabilityJobStartInput,
  type ViraHostedCapabilityJobStoreFailureCode,
  type ViraHostedCapabilityJobTerminalResult,
  type ViraHostedCapabilityProviderAuthority,
  type ViraHostedCapabilityQueryRetryGuardInput,
} from "./async-job-types.js";

const digestPattern = /^[a-f0-9]{64}$/;

function fail<T = ViraHostedCapabilityJob>(code: ViraHostedCapabilityJobIssueCode, path: string, message: string): ViraHostedCapabilityJobResult<T> {
  const issue: ViraHostedCapabilityJobIssue = Object.freeze({ code, path, message });
  return { ok: false, issue };
}

function positiveTime(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function safeRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true;
  }
  return false;
}

function safeOpaqueToken(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= maxLength
    && value.trim() === value
    && !hasControlCharacter(value);
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function canonicalScope(input: unknown): ViraHostedCapabilityJobResult<ViraEnterpriseScope> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return fail("INVALID_SCOPE", "$.scope", "async Capability job scope must be an enterprise scope");
  const raw = input as Record<string, unknown>;
  if (
    Object.keys(raw).length !== 4
    || raw.version !== "1"
    || typeof raw.organizationId !== "string"
    || typeof raw.projectId !== "string"
    || typeof raw.environment !== "string"
  ) return fail("INVALID_SCOPE", "$.scope", "async Capability job scope shape is invalid");
  const context = createViraEnterpriseContext({
    organizationId: raw.organizationId,
    projectId: raw.projectId,
    environments: [raw.environment as ViraEnterpriseEnvironmentName],
  });
  if (!context.ok) return fail("INVALID_SCOPE", "$.scope", context.issue.message);
  const scope = context.value.scope(raw.environment as ViraEnterpriseEnvironmentName);
  if (!scope.ok) return fail("INVALID_SCOPE", "$.scope", scope.issue.message);
  return { ok: true, value: scope.value };
}

function exactReference(left: ViraCapabilityExactReference, right: ViraCapabilityExactReference): boolean {
  return left.id === right.id && left.versionRef === right.versionRef;
}

function freezeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => freezeJson(entry)));
  if (value !== null && typeof value === "object") {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, freezeJson(entry)])));
  }
  return value;
}

function parseValue(input: unknown, path: string): ViraHostedCapabilityJobResult<ViraHostedCapabilityValue> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return fail("INVALID_COMPLETION", path, "async Capability output must be an object");
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).length !== 2 || !Object.hasOwn(raw, "typeRef") || !Object.hasOwn(raw, "value")) return fail("INVALID_COMPLETION", path, "async Capability output must have exact typeRef/value fields");
  let typeRef: ViraCapabilityExactReference | null = null;
  if (raw.typeRef !== null) {
    const parsedRef = parseViraCapabilityExactReference(raw.typeRef);
    if (!parsedRef.ok) return fail("INVALID_COMPLETION", `${path}.typeRef${parsedRef.issue.path.slice(1)}`, parsedRef.issue.message);
    typeRef = parsedRef.value;
  }
  const parsedValue = parseJsonValue(raw.value);
  if (!parsedValue.ok) return fail("INVALID_COMPLETION", `${path}.value${parsedValue.issue.path.slice(1)}`, parsedValue.issue.reason);
  return {
    ok: true,
    value: Object.freeze({
      typeRef: typeRef === null ? null : Object.freeze({ ...typeRef }),
      value: freezeJson(parsedValue.value),
    }),
  };
}

function parseTerminalResult(input: unknown, path: string): ViraHostedCapabilityJobResult<ViraHostedCapabilityJobTerminalResult> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return fail("INVALID_COMPLETION", path, "async Capability completion result must be an object");
  const raw = input as Record<string, unknown>;
  if (typeof raw.outcome !== "string" || typeof raw.resultDigest !== "string" || !digestPattern.test(raw.resultDigest)) return fail("INVALID_COMPLETION", path, "async Capability completion outcome or digest is invalid");
  if (raw.outcome === "success") {
    if (Object.keys(raw).length !== 3 || !Object.hasOwn(raw, "output")) return fail("INVALID_COMPLETION", path, "success completion must contain only outcome/output/resultDigest");
    const output = parseValue(raw.output, `${path}.output`);
    if (!output.ok) return output;
    return { ok: true, value: Object.freeze({ outcome: "success", output: output.value, resultDigest: raw.resultDigest }) };
  }
  if (raw.outcome === "empty") {
    if (Object.keys(raw).length !== 2) return fail("INVALID_COMPLETION", path, "empty completion must contain only outcome/resultDigest");
    return { ok: true, value: Object.freeze({ outcome: "empty", resultDigest: raw.resultDigest }) };
  }
  if (raw.outcome === "error") {
    if (Object.keys(raw).length !== 3 || raw.failure === null || typeof raw.failure !== "object" || Array.isArray(raw.failure)) return fail("INVALID_COMPLETION", path, "error completion must contain a failure object");
    const failureRaw = raw.failure as Record<string, unknown>;
    if (Object.keys(failureRaw).length !== 1 || !safeOpaqueToken(failureRaw.code, VIRA_HOSTED_CAPABILITY_FAILURE_CODE_MAX_LENGTH)) return fail("INVALID_COMPLETION", `${path}.failure`, "async Capability provider failure is invalid");
    const failure: ViraHostedCapabilityProviderFailure = Object.freeze({ code: failureRaw.code });
    return { ok: true, value: Object.freeze({ outcome: "error", failure, resultDigest: raw.resultDigest }) };
  }
  return fail("INVALID_COMPLETION", `${path}.outcome`, "async Capability completion outcome is invalid");
}

function parseCompletion(input: unknown): ViraHostedCapabilityJobResult<ViraHostedCapabilityJobCompletion> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return fail("INVALID_COMPLETION", "$.completion", "async Capability completion must be an object");
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).length !== 4) return fail("INVALID_COMPLETION", "$.completion", "async Capability completion shape is invalid");
  if (typeof raw.source !== "string" || !(VIRA_HOSTED_CAPABILITY_JOB_COMPLETION_SOURCES as readonly string[]).includes(raw.source)) return fail("INVALID_COMPLETION", "$.completion.source", "completion source must be poll or webhook");
  if (!safeOpaqueToken(raw.completionId, VIRA_HOSTED_CAPABILITY_COMPLETION_ID_MAX_LENGTH)) return fail("INVALID_COMPLETION", "$.completion.completionId", "completionId is invalid");
  if (!positiveTime(raw.completedAtEpochMs)) return fail("INVALID_COMPLETION", "$.completion.completedAtEpochMs", "completion timestamp is invalid");
  const result = parseTerminalResult(raw.result, "$.completion.result");
  if (!result.ok) return result;
  return {
    ok: true,
    value: Object.freeze({
      source: raw.source as ViraHostedCapabilityJobCompletion["source"],
      completionId: raw.completionId,
      completedAtEpochMs: raw.completedAtEpochMs,
      result: result.value,
    }),
  };
}

function parseAuthority(input: unknown, nowEpochMs: number): ViraHostedCapabilityJobResult<ViraHostedCapabilityProviderAuthority> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return fail("INVALID_AUTHORITY", "$.authority", "provider authority must be an object");
  const raw = input as Record<string, unknown>;
  if (
    Object.keys(raw).length !== 5
    || raw.version !== VIRA_HOSTED_CAPABILITY_JOB_VERSION
    || typeof raw.connectionId !== "string"
    || !isSemanticNamespace(raw.connectionId)
    || typeof raw.trustEvidenceId !== "string"
    || !isSemanticNamespace(raw.trustEvidenceId)
    || raw.trusted !== true
    || !positiveTime(raw.validUntilEpochMs)
  ) return fail("INVALID_AUTHORITY", "$.authority", "provider authority is invalid");
  if (nowEpochMs >= raw.validUntilEpochMs) return fail("PROVIDER_AUTHORITY_REVOKED", "$.authority.validUntilEpochMs", "provider trust is expired or revoked for this operation");
  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_HOSTED_CAPABILITY_JOB_VERSION,
      connectionId: raw.connectionId,
      trustEvidenceId: raw.trustEvidenceId,
      trusted: true,
      validUntilEpochMs: raw.validUntilEpochMs,
    }),
  };
}

function terminal(status: ViraHostedCapabilityJob["status"]): boolean {
  return status === "completed" || status === "failed" || status === "timed-out" || status === "cancelled";
}

function freezeJob(job: ViraHostedCapabilityJob): ViraHostedCapabilityJob {
  return Object.freeze({
    ...job,
    scope: Object.freeze({ ...job.scope }),
    capabilityRef: Object.freeze({ ...job.capabilityRef }),
    bindingRef: Object.freeze({ ...job.bindingRef }),
    completion: job.completion,
  });
}

function mapStoreFailure(code: ViraHostedCapabilityJobStoreFailureCode): ViraHostedCapabilityJobResult {
  if (code === "ALREADY_EXISTS") return fail("ALREADY_EXISTS", "$.id", "async Capability job already exists");
  if (code === "NOT_FOUND") return fail("NOT_FOUND", "$.id", "async Capability job does not exist");
  return fail("VERSION_CONFLICT", "$.expectedRevision", "async Capability job revision changed concurrently");
}

function validateConfiguration(configuration: ViraHostedCapabilityJobServiceConfiguration): void {
  if (configuration === null || typeof configuration !== "object") throw new TypeError("async Capability job service configuration is required");
  if (configuration.store === null || typeof configuration.store !== "object" || typeof configuration.store.read !== "function" || typeof configuration.store.create !== "function" || typeof configuration.store.replace !== "function") throw new TypeError("async Capability job service requires a store");
  if (typeof configuration.nowEpochMs !== "function") throw new TypeError("async Capability job service requires a clock");
}

function serviceNow(configuration: ViraHostedCapabilityJobServiceConfiguration): number {
  const now = configuration.nowEpochMs();
  if (!positiveTime(now)) throw new TypeError("async Capability job service clock must return a positive safe epoch millisecond");
  return now;
}

async function readCurrent(
  configuration: ViraHostedCapabilityJobServiceConfiguration,
  scopeInput: ViraEnterpriseScope,
  id: string,
): Promise<ViraHostedCapabilityJobResult> {
  const scope = canonicalScope(scopeInput);
  if (!scope.ok) return scope;
  if (!safeOpaqueToken(id, VIRA_HOSTED_CAPABILITY_JOB_ID_MAX_LENGTH) || !isSemanticNamespace(id)) return fail("INVALID_JOB_INPUT", "$.id", "async Capability job id is invalid");
  const current = await configuration.store.read(scope.value, id);
  if (current === undefined) return fail("NOT_FOUND", "$.id", "async Capability job does not exist");
  if (!exactScope(current.scope, scope.value) || current.id !== id) throw new TypeError("async Capability job store returned state outside the requested identity");
  return { ok: true, value: current };
}

function requireExpectedRevision(job: ViraHostedCapabilityJob, expectedRevision: number): ViraHostedCapabilityJobResult | null {
  if (!safeRevision(expectedRevision)) return fail("INVALID_JOB_INPUT", "$.expectedRevision", "expectedRevision is invalid");
  if (job.revision !== expectedRevision) return fail("VERSION_CONFLICT", "$.expectedRevision", "async Capability job revision changed concurrently");
  return null;
}

function requireAuthority(job: ViraHostedCapabilityJob, input: unknown, now: number): ViraHostedCapabilityJobResult | null {
  const authority = parseAuthority(input, now);
  if (!authority.ok) return authority;
  if (authority.value.connectionId !== job.providerConnectionId) return fail("PROVIDER_AUTHORITY_MISMATCH", "$.authority.connectionId", "provider authority belongs to a different connection");
  return null;
}

function completionReplay(job: ViraHostedCapabilityJob, completion: ViraHostedCapabilityJobCompletion): boolean {
  return job.completion !== null
    && job.completion.completionId === completion.completionId
    && job.completion.result.resultDigest === completion.result.resultDigest;
}

export function authorizeViraHostedCapabilityQueryRetry(
  input: ViraHostedCapabilityQueryRetryGuardInput,
): ViraHostedCapabilityJobResult<{ readonly capabilityRef: ViraCapabilityExactReference; readonly retryPolicy: "query-safe" }> {
  if (input === null || typeof input !== "object") return fail("INVALID_JOB_INPUT", "$", "query retry guard input is invalid");
  const capability = parseViraCapabilityDefinition(input.capability);
  if (!capability.ok) return fail("INVALID_CAPABILITY", "$.capability", capability.issue.message);
  if (capability.value.invocation.kind === "action") return fail("ACTION_BOUNDARY_REQUIRED", "$.capability.invocation", "protected Action retry must remain behind the canonical Action Boundary");
  if (input.retryPolicy !== "query-safe") return fail("RETRY_NOT_QUERY_SAFE", "$.retryPolicy", "automatic async retry is allowed only for query-safe Capability jobs");
  return {
    ok: true,
    value: Object.freeze({
      capabilityRef: Object.freeze({ id: capability.value.id, versionRef: capability.value.version }),
      retryPolicy: "query-safe" as const,
    }),
  };
}

export function createViraHostedCapabilityJobService(
  configuration: ViraHostedCapabilityJobServiceConfiguration,
): ViraHostedCapabilityJobService {
  validateConfiguration(configuration);

  return Object.freeze({
    async start(input: ViraHostedCapabilityJobStartInput): Promise<ViraHostedCapabilityJobResult> {
      const now = serviceNow(configuration);
      if (input === null || typeof input !== "object") return fail("INVALID_JOB_INPUT", "$", "async Capability job start input is invalid");
      if (!safeOpaqueToken(input.id, VIRA_HOSTED_CAPABILITY_JOB_ID_MAX_LENGTH) || !isSemanticNamespace(input.id)) return fail("INVALID_JOB_INPUT", "$.id", "async Capability job id is invalid");
      if (!safeOpaqueToken(input.invocationId, VIRA_HOSTED_CAPABILITY_INVOCATION_ID_MAX_LENGTH)) return fail("INVALID_JOB_INPUT", "$.invocationId", "async Capability invocation id is invalid");
      if (!safeOpaqueToken(input.providerJobRef, VIRA_HOSTED_CAPABILITY_PROVIDER_JOB_REF_MAX_LENGTH)) return fail("INVALID_JOB_INPUT", "$.providerJobRef", "provider job reference is invalid");
      if (!(VIRA_HOSTED_CAPABILITY_JOB_COMPLETION_MODES as readonly string[]).includes(input.completionMode)) return fail("INVALID_JOB_INPUT", "$.completionMode", "async Capability completion mode must be poll or webhook");
      if (!(VIRA_HOSTED_CAPABILITY_JOB_RETRY_POLICIES as readonly string[]).includes(input.retryPolicy)) return fail("INVALID_JOB_INPUT", "$.retryPolicy", "async Capability retry policy is invalid");
      if (!positiveTime(input.deadlineEpochMs) || input.deadlineEpochMs <= now) return fail("INVALID_JOB_INPUT", "$.deadlineEpochMs", "async Capability deadline must be in the future");

      const scope = canonicalScope(input.scope);
      if (!scope.ok) return scope;
      const capability = parseViraCapabilityDefinition(input.capability);
      if (!capability.ok) return fail("INVALID_CAPABILITY", "$.capability", capability.issue.message);
      if (capability.value.invocation.kind === "action") return fail("ACTION_BOUNDARY_REQUIRED", "$.capability.invocation", "action Capability execution must remain behind the canonical Action Boundary");
      const binding = parseViraHostedCapabilityBinding(input.binding);
      if (!binding.ok) return fail("INVALID_BINDING", `$.binding${binding.issue.path.slice(1)}`, binding.issue.message);
      const capabilityRef = Object.freeze({ id: capability.value.id, versionRef: capability.value.version });
      if (!exactReference(binding.value.capabilityRef, capabilityRef)) return fail("CAPABILITY_MISMATCH", "$.binding.capabilityRef", "async Capability binding must exactly match the requested Capability");
      const authority = parseAuthority(input.authority, now);
      if (!authority.ok) return authority;

      const job = freezeJob({
        version: VIRA_HOSTED_CAPABILITY_JOB_VERSION,
        id: input.id,
        scope: scope.value,
        revision: 1,
        status: "running",
        invocationId: input.invocationId,
        capabilityRef,
        bindingRef: binding.value.bindingRef,
        providerId: binding.value.providerId,
        providerConnectionId: authority.value.connectionId,
        trustEvidenceId: authority.value.trustEvidenceId,
        providerJobRef: input.providerJobRef,
        completionMode: input.completionMode,
        retryPolicy: input.retryPolicy,
        deadlineEpochMs: input.deadlineEpochMs,
        startedAtEpochMs: now,
        updatedAtEpochMs: now,
        cancelRequestedAtEpochMs: null,
        cancelledAtEpochMs: null,
        timedOutAtEpochMs: null,
        completion: null,
      });
      const created = await configuration.store.create(job);
      return created.ok ? { ok: true, value: created.value } : mapStoreFailure(created.code);
    },

    async read(scope: ViraEnterpriseScope, id: string): Promise<ViraHostedCapabilityJobResult> {
      return readCurrent(configuration, scope, id);
    },

    async authorizePoll(input: ViraHostedCapabilityJobAuthorizedMutationInput): Promise<ViraHostedCapabilityJobResult> {
      const now = serviceNow(configuration);
      const current = await readCurrent(configuration, input.scope, input.id);
      if (!current.ok) return current;
      const revisionIssue = requireExpectedRevision(current.value, input.expectedRevision);
      if (revisionIssue) return revisionIssue;
      if (terminal(current.value.status)) return fail("TERMINAL_STATE", "$.status", "terminal async Capability jobs cannot be polled");
      const authorityIssue = requireAuthority(current.value, input.authority, now);
      if (authorityIssue) return authorityIssue;
      return { ok: true, value: current.value };
    },

    async requestCancel(input: ViraHostedCapabilityJobAuthorizedMutationInput): Promise<ViraHostedCapabilityJobResult> {
      const now = serviceNow(configuration);
      const current = await readCurrent(configuration, input.scope, input.id);
      if (!current.ok) return current;
      const revisionIssue = requireExpectedRevision(current.value, input.expectedRevision);
      if (revisionIssue) return revisionIssue;
      const authorityIssue = requireAuthority(current.value, input.authority, now);
      if (authorityIssue) return authorityIssue;
      if (current.value.status === "cancel-requested") return { ok: true, value: current.value, replay: true };
      if (terminal(current.value.status)) return fail("TERMINAL_STATE", "$.status", "terminal async Capability jobs cannot request cancellation");
      const next = freezeJob({
        ...current.value,
        revision: current.value.revision + 1,
        status: "cancel-requested",
        updatedAtEpochMs: now,
        cancelRequestedAtEpochMs: now,
      });
      const replaced = await configuration.store.replace(next, current.value.revision);
      return replaced.ok ? { ok: true, value: replaced.value } : mapStoreFailure(replaced.code);
    },

    async confirmCancelled(input: ViraHostedCapabilityJobMutationInput): Promise<ViraHostedCapabilityJobResult> {
      const now = serviceNow(configuration);
      const current = await readCurrent(configuration, input.scope, input.id);
      if (!current.ok) return current;
      const revisionIssue = requireExpectedRevision(current.value, input.expectedRevision);
      if (revisionIssue) return revisionIssue;
      if (current.value.status === "cancelled") return { ok: true, value: current.value, replay: true };
      if (current.value.status !== "cancel-requested") return fail("CANCEL_NOT_REQUESTED", "$.status", "provider cancellation cannot be confirmed before cancellation is requested");
      const next = freezeJob({
        ...current.value,
        revision: current.value.revision + 1,
        status: "cancelled",
        updatedAtEpochMs: now,
        cancelledAtEpochMs: now,
      });
      const replaced = await configuration.store.replace(next, current.value.revision);
      return replaced.ok ? { ok: true, value: replaced.value } : mapStoreFailure(replaced.code);
    },

    async timeout(input: ViraHostedCapabilityJobMutationInput): Promise<ViraHostedCapabilityJobResult> {
      const now = serviceNow(configuration);
      const current = await readCurrent(configuration, input.scope, input.id);
      if (!current.ok) return current;
      const revisionIssue = requireExpectedRevision(current.value, input.expectedRevision);
      if (revisionIssue) return revisionIssue;
      if (current.value.status === "timed-out") return { ok: true, value: current.value, replay: true };
      if (terminal(current.value.status)) return fail("TERMINAL_STATE", "$.status", "terminal async Capability job cannot time out again");
      if (now < current.value.deadlineEpochMs) return fail("TIMEOUT_NOT_REACHED", "$.deadlineEpochMs", "async Capability job deadline has not been reached");
      const next = freezeJob({
        ...current.value,
        revision: current.value.revision + 1,
        status: "timed-out",
        updatedAtEpochMs: now,
        timedOutAtEpochMs: now,
      });
      const replaced = await configuration.store.replace(next, current.value.revision);
      return replaced.ok ? { ok: true, value: replaced.value } : mapStoreFailure(replaced.code);
    },

    async complete(input: ViraHostedCapabilityJobCompletionInput): Promise<ViraHostedCapabilityJobResult> {
      const now = serviceNow(configuration);
      const completion = parseCompletion(input.completion);
      if (!completion.ok) return completion;
      const current = await readCurrent(configuration, input.scope, input.id);
      if (!current.ok) return current;
      if (completionReplay(current.value, completion.value)) return { ok: true, value: current.value, replay: true };
      if (current.value.status === "timed-out" || current.value.status === "cancelled") return fail("LATE_COMPLETION", "$.completion", "provider completion arrived after the async Capability job became terminal");
      if (terminal(current.value.status)) return fail("TERMINAL_STATE", "$.status", "async Capability job already has a different terminal result");
      const revisionIssue = requireExpectedRevision(current.value, input.expectedRevision);
      if (revisionIssue) return revisionIssue;
      if (completion.value.source !== current.value.completionMode) return fail("INVALID_COMPLETION", "$.completion.source", "completion source does not match the job completion mode");
      if (completion.value.completedAtEpochMs < current.value.startedAtEpochMs || completion.value.completedAtEpochMs > now) return fail("INVALID_COMPLETION", "$.completion.completedAtEpochMs", "completion timestamp is outside the accepted observation window");
      if (completion.value.completedAtEpochMs >= current.value.deadlineEpochMs) return fail("LATE_COMPLETION", "$.completion.completedAtEpochMs", "completion occurred at or after the async Capability deadline");
      const status = completion.value.result.outcome === "error" ? "failed" as const : "completed" as const;
      const next = freezeJob({
        ...current.value,
        revision: current.value.revision + 1,
        status,
        updatedAtEpochMs: now,
        completion: completion.value,
      });
      const replaced = await configuration.store.replace(next, current.value.revision);
      return replaced.ok ? { ok: true, value: replaced.value } : mapStoreFailure(replaced.code);
    },
  });
}
