import {
  parseViraApplicationExactReference,
  parseViraApplicationReleaseReference,
  type ViraApplicationExactReference,
} from "@vira-enterprise-genui/application-package";
import {
  VIRA_ENTERPRISE_CONTEXT_VERSION,
  VIRA_ENTERPRISE_ENVIRONMENTS,
  createViraEnterpriseContext,
  type ViraEnterpriseEnvironmentName,
  type ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";
import {
  VIRA_APPLICATION_RUN_STATUSES,
  VIRA_APPLICATION_RUN_VERSION,
  VIRA_APPLICATION_RUN_WAIT_KINDS,
  type ViraApplicationRun,
  type ViraApplicationRunIssueCode,
  type ViraApplicationRunResolutionPin,
  type ViraApplicationRunResult,
  type ViraApplicationRunService,
  type ViraApplicationRunServiceConfiguration,
  type ViraApplicationRunStoreMutationResult,
  type ViraApplicationRunWait,
  type ViraApplicationRunWaitKind,
} from "./types.js";

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const LOGICAL_REF = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,511}$/;
const ENTERPRISE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const WAIT_KINDS = new Set<string>(VIRA_APPLICATION_RUN_WAIT_KINDS);
const RUN_STATUSES = new Set<string>(VIRA_APPLICATION_RUN_STATUSES);

type Failure = { readonly ok: false; readonly issue: { readonly code: ViraApplicationRunIssueCode; readonly path: string; readonly message: string } };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function fail<T>(code: ViraApplicationRunIssueCode, path: string, message: string): ViraApplicationRunResult<T> {
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

function parseScope(input: unknown): Parsed<ViraEnterpriseScope> {
  if (!record(input) || !exactKeys(input, ["version", "organizationId", "projectId", "environment"])) {
    return fail("INVALID_SCOPE", "$.scope", "run scope must be an exact enterprise scope");
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
    return fail("INVALID_SCOPE", "$.scope", "run scope is invalid");
  }
  const context = createViraEnterpriseContext({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environments: [input.environment],
  });
  if (!context.ok) return fail("INVALID_SCOPE", "$.scope", "run scope is not canonical");
  const scope = context.value.scope(input.environment as ViraEnterpriseEnvironmentName);
  if (!scope.ok) return fail("INVALID_SCOPE", "$.scope", "run scope is not registered");
  return { ok: true, value: scope.value };
}

function parseResolution(
  input: unknown,
  scope: ViraEnterpriseScope,
  entrypointInput: unknown,
): Parsed<{ readonly pin: ViraApplicationRunResolutionPin; readonly entrypoint: ViraApplicationExactReference }> {
  if (!record(input) || !record(input.artifact)) {
    return fail("INVALID_RESOLUTION", "$.resolution", "ApplicationRun requires a canonical Application resolution");
  }
  const artifact = input.artifact;
  if (!record(artifact.release)) {
    return fail("INVALID_RESOLUTION", "$.resolution.artifact.release", "resolution release is invalid");
  }
  const release = parseViraApplicationReleaseReference(artifact.release);
  if (!release.ok) return fail("INVALID_RESOLUTION", "$.resolution.artifact.release", release.issue.message);
  if (
    artifact.environment !== scope.environment
    || typeof artifact.deploymentId !== "string"
    || !LOGICAL_REF.test(artifact.deploymentId)
    || !safePositive(artifact.deploymentRevision)
    || typeof artifact.artifactId !== "string"
    || !LOGICAL_REF.test(artifact.artifactId)
    || typeof artifact.distributionDigest !== "string"
    || !SHA256_HEX.test(artifact.distributionDigest)
    || typeof input.resolutionDigest !== "string"
    || !SHA256_HEX.test(input.resolutionDigest)
    || typeof input.canonicalArtifact !== "string"
    || input.canonicalArtifact.length < 1
    || input.canonicalArtifact.length > 10_000_000
  ) {
    return fail("INVALID_RESOLUTION", "$.resolution", "resolution pin fields are invalid");
  }
  if (!record(artifact.binding) || !record(artifact.binding.scope)) {
    return fail("INVALID_RESOLUTION", "$.resolution.artifact.binding.scope", "resolution binding scope is invalid");
  }
  const bindingScope = parseScope(artifact.binding.scope);
  if (!bindingScope.ok || !exactScope(bindingScope.value, scope)) {
    return fail("INVALID_RESOLUTION", "$.resolution.artifact.binding.scope", "resolution belongs to another enterprise scope");
  }
  if (!record(artifact.distribution) || !record(artifact.distribution.integrity) || !record(artifact.distribution.application)) {
    return fail("INVALID_RESOLUTION", "$.resolution.artifact.distribution", "resolution distribution is invalid");
  }
  const integrity = artifact.distribution.integrity;
  const application = artifact.distribution.application;
  if (
    integrity.algorithm !== "sha256"
    || integrity.digest !== artifact.distributionDigest
    || !record(application.identity)
    || application.identity.id !== release.value.id
    || application.version !== release.value.version
    || !Array.isArray(application.flows)
  ) {
    return fail("INVALID_RESOLUTION", "$.resolution.artifact.distribution", "resolution distribution identity conflicts with the exact release pin");
  }
  const entrypoint = parseViraApplicationExactReference(entrypointInput);
  if (!entrypoint.ok) return fail("INVALID_ENTRYPOINT", "$.entrypointRef", entrypoint.issue.message);
  let found = false;
  for (const flow of application.flows) {
    const parsed = parseViraApplicationExactReference(flow);
    if (!parsed.ok) return fail("INVALID_RESOLUTION", "$.resolution.artifact.distribution.application.flows", "resolution contains an invalid flow reference");
    if (parsed.value.id === entrypoint.value.id && parsed.value.versionRef === entrypoint.value.versionRef) found = true;
  }
  if (!found) return fail("INVALID_ENTRYPOINT", "$.entrypointRef", "entrypointRef is not declared by the resolved Application release");
  const pin: ViraApplicationRunResolutionPin = Object.freeze({
    release: Object.freeze({ ...release.value }),
    environment: scope.environment,
    deploymentId: artifact.deploymentId,
    deploymentRevision: artifact.deploymentRevision,
    artifactId: artifact.artifactId,
    distributionDigest: artifact.distributionDigest,
    resolutionDigest: input.resolutionDigest,
  });
  return { ok: true, value: Object.freeze({ pin, entrypoint: entrypoint.value }) };
}

function parseWait(input: unknown): Parsed<ViraApplicationRunWait> {
  if (!record(input) || !exactKeys(input, ["id", "kind", "reference", "dueAtUnixMs"])) {
    return fail("INVALID_WAIT", "$.wait", "wait must be an exact object");
  }
  if (
    typeof input.id !== "string"
    || !RUN_ID.test(input.id)
    || typeof input.kind !== "string"
    || !WAIT_KINDS.has(input.kind)
    || typeof input.reference !== "string"
    || !LOGICAL_REF.test(input.reference)
    || (input.dueAtUnixMs !== null && !safeNonNegative(input.dueAtUnixMs))
  ) {
    return fail("INVALID_WAIT", "$.wait", "wait identity or timing is invalid");
  }
  if (input.kind === "timer" ? input.dueAtUnixMs === null : input.dueAtUnixMs !== null) {
    return fail("INVALID_WAIT", "$.wait.dueAtUnixMs", "timer waits require dueAtUnixMs; other wait kinds must not carry timer authority");
  }
  return {
    ok: true,
    value: Object.freeze({
      id: input.id,
      kind: input.kind as ViraApplicationRunWaitKind,
      reference: input.reference,
      dueAtUnixMs: input.dueAtUnixMs as number | null,
    }),
  };
}

function nextRevision(current: number): number | undefined {
  if (!Number.isSafeInteger(current) || current < 1 || current >= Number.MAX_SAFE_INTEGER) return undefined;
  return current + 1;
}

function mapMutation<T extends ViraApplicationRun>(result: ViraApplicationRunStoreMutationResult): ViraApplicationRunResult<T> {
  if (result.ok) return { ok: true, value: result.value as T };
  if (result.code === "VERSION_CONFLICT" || result.code === "ALREADY_EXISTS") {
    return fail("CONFLICT", "$", "ApplicationRun durable state changed concurrently");
  }
  return fail("NOT_FOUND", "$", "ApplicationRun does not exist");
}

function canonicalStoredRun(value: ViraApplicationRun | undefined, scope: ViraEnterpriseScope, id: string): ViraApplicationRun | undefined {
  if (value === undefined) return undefined;
  if (
    value.version !== VIRA_APPLICATION_RUN_VERSION
    || value.id !== id
    || !RUN_ID.test(value.id)
    || !exactScope(value.scope, scope)
    || !safePositive(value.revision)
    || !RUN_STATUSES.has(value.status)
    || !safeNonNegative(value.createdAtUnixMs)
    || !safeNonNegative(value.updatedAtUnixMs)
  ) return undefined;
  return value;
}

export function createViraApplicationRunService(
  config: ViraApplicationRunServiceConfiguration,
): ViraApplicationRunResult<ViraApplicationRunService> {
  if (
    config === null
    || typeof config !== "object"
    || config.store === null
    || typeof config.store !== "object"
    || typeof config.store.read !== "function"
    || typeof config.store.create !== "function"
    || typeof config.store.replace !== "function"
    || typeof config.nowUnixMs !== "function"
  ) return fail("INVALID_SERVICE", "$", "ApplicationRun service requires a durable CAS store and clock");
  const store = config.store;
  const nowUnixMs = config.nowUnixMs;

  async function readStored(scope: ViraEnterpriseScope, id: string): Promise<ViraApplicationRunResult<ViraApplicationRun>> {
    let raw: ViraApplicationRun | undefined;
    try {
      raw = await store.read(scope, id);
    } catch {
      return fail("STORE_FAILURE", "$.store", "ApplicationRun store read failed closed");
    }
    if (raw === undefined) return fail("NOT_FOUND", "$.id", "ApplicationRun was not found in the exact enterprise scope");
    const run = canonicalStoredRun(raw, scope, id);
    if (!run) return fail("STORE_FAILURE", "$.store", "ApplicationRun store returned a non-canonical or cross-scope record");
    return { ok: true, value: run };
  }

  const service: ViraApplicationRunService = {
    async create(input) {
      if (!record(input) || typeof input.id !== "string" || !RUN_ID.test(input.id) || (input.workContextId !== null && (typeof input.workContextId !== "string" || !RUN_ID.test(input.workContextId)))) {
        return fail("INVALID_INPUT", "$", "ApplicationRun create input is invalid");
      }
      const scope = parseScope(input.scope);
      if (!scope.ok) return scope;
      const resolution = parseResolution(input.resolution, scope.value, input.entrypointRef);
      if (!resolution.ok) return resolution;
      let now: number;
      try { now = nowUnixMs(); } catch { return fail("INVALID_SERVICE", "$.clock", "ApplicationRun clock failed closed"); }
      if (!safeNonNegative(now)) return fail("INVALID_SERVICE", "$.clock", "ApplicationRun clock must return a non-negative safe integer");
      const run: ViraApplicationRun = Object.freeze({
        version: VIRA_APPLICATION_RUN_VERSION,
        id: input.id,
        scope: scope.value,
        revision: 1,
        status: "running",
        resolution: resolution.value.pin,
        entrypointRef: Object.freeze({ ...resolution.value.entrypoint }),
        workContextId: input.workContextId,
        wait: null,
        createdAtUnixMs: now,
        updatedAtUnixMs: now,
      });
      let stored: ViraApplicationRunStoreMutationResult;
      try { stored = await store.create(run); } catch { return fail("STORE_FAILURE", "$.store", "ApplicationRun create failed closed"); }
      return mapMutation(stored);
    },
    async read(scopeInput, id) {
      if (typeof id !== "string" || !RUN_ID.test(id)) return fail("INVALID_INPUT", "$.id", "ApplicationRun id is invalid");
      const scope = parseScope(scopeInput);
      if (!scope.ok) return scope;
      return readStored(scope.value, id);
    },
    async wait(input) {
      if (!record(input) || typeof input.id !== "string" || !RUN_ID.test(input.id) || !safePositive(input.expectedRevision)) {
        return fail("INVALID_INPUT", "$", "ApplicationRun wait input is invalid");
      }
      const scope = parseScope(input.scope);
      if (!scope.ok) return scope;
      const wait = parseWait(input.wait);
      if (!wait.ok) return wait;
      const current = await readStored(scope.value, input.id);
      if (!current.ok) return current;
      if (current.value.revision !== input.expectedRevision) return fail("CONFLICT", "$.expectedRevision", "ApplicationRun revision is stale");
      if (current.value.status !== "running" || current.value.wait !== null) return fail("INVALID_STATE", "$.status", "only a running ApplicationRun can enter a wait");
      const revision = nextRevision(current.value.revision);
      if (revision === undefined) return fail("REVISION_OVERFLOW", "$.revision", "ApplicationRun revision cannot advance safely");
      let now: number;
      try { now = nowUnixMs(); } catch { return fail("INVALID_SERVICE", "$.clock", "ApplicationRun clock failed closed"); }
      if (!safeNonNegative(now)) return fail("INVALID_SERVICE", "$.clock", "ApplicationRun clock must return a non-negative safe integer");
      const next: ViraApplicationRun = Object.freeze({ ...current.value, revision, status: "waiting", wait: wait.value, updatedAtUnixMs: now });
      let stored: ViraApplicationRunStoreMutationResult;
      try { stored = await store.replace(next, input.expectedRevision); } catch { return fail("STORE_FAILURE", "$.store", "ApplicationRun wait commit failed closed"); }
      return mapMutation(stored);
    },
    async resume(input) {
      if (!record(input) || typeof input.id !== "string" || !RUN_ID.test(input.id) || !safePositive(input.expectedRevision) || typeof input.waitId !== "string" || !RUN_ID.test(input.waitId)) {
        return fail("INVALID_INPUT", "$", "ApplicationRun resume input is invalid");
      }
      const scope = parseScope(input.scope);
      if (!scope.ok) return scope;
      const current = await readStored(scope.value, input.id);
      if (!current.ok) return current;
      if (current.value.revision !== input.expectedRevision) return fail("CONFLICT", "$.expectedRevision", "ApplicationRun revision is stale");
      if (current.value.status !== "waiting" || current.value.wait === null || current.value.wait.id !== input.waitId) {
        return fail("INVALID_STATE", "$.waitId", "ApplicationRun is not waiting on the exact requested wait");
      }
      const revision = nextRevision(current.value.revision);
      if (revision === undefined) return fail("REVISION_OVERFLOW", "$.revision", "ApplicationRun revision cannot advance safely");
      let now: number;
      try { now = nowUnixMs(); } catch { return fail("INVALID_SERVICE", "$.clock", "ApplicationRun clock failed closed"); }
      if (!safeNonNegative(now)) return fail("INVALID_SERVICE", "$.clock", "ApplicationRun clock must return a non-negative safe integer");
      const next: ViraApplicationRun = Object.freeze({ ...current.value, revision, status: "running", wait: null, updatedAtUnixMs: now });
      let stored: ViraApplicationRunStoreMutationResult;
      try { stored = await store.replace(next, input.expectedRevision); } catch { return fail("STORE_FAILURE", "$.store", "ApplicationRun resume commit failed closed"); }
      return mapMutation(stored);
    },
  };
  return { ok: true, value: Object.freeze(service) };
}
