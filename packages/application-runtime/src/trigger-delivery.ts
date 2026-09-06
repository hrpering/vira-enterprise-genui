import {
  parseViraArtifactMetadata,
  parseViraArtifactRevisionReference,
  type ViraArtifactMetadata,
  type ViraArtifactRevisionReference,
} from "@vira-enterprise-genui/artifact-contract";
import {
  VIRA_APPLICATION_TRIGGER_TYPES,
  parseViraApplicationExactReference,
  parseViraApplicationPackageV2,
  parseViraApplicationReleaseReference,
  type ViraApplicationExactReference,
  type ViraApplicationTriggerType,
} from "@vira-enterprise-genui/application-package";
import {
  VIRA_APPLICATION_RESOLUTION_SCHEMA_VERSION,
} from "@vira-enterprise-genui/application-resolution";
import {
  VIRA_ENTERPRISE_CONTEXT_VERSION,
  VIRA_ENTERPRISE_ENVIRONMENTS,
  createViraEnterpriseContext,
  type ViraEnterpriseEnvironmentName,
  type ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";
import type { ViraApplicationRunResolutionPin } from "./types.js";

export const VIRA_TRIGGER_INBOX_VERSION = "1" as const;
export const VIRA_TRIGGER_INBOX_STATUSES = Object.freeze(["pending", "processing", "processed"] as const);
export const VIRA_TRIGGER_PAYLOAD_MAX_BYTES = 1_048_576 as const;
export const VIRA_TRIGGER_RESOLUTION_ARTIFACT_MAX_BYTES = 10_000_000 as const;
export const VIRA_TRIGGER_REPLAY_WINDOW_MAX_MS = 2_592_000_000 as const;
export const VIRA_TRIGGER_CLOCK_SKEW_MAX_MS = 3_600_000 as const;
export const VIRA_TRIGGER_PROCESSING_LEASE_MAX_MS = 3_600_000 as const;

export type ViraTriggerInboxStatus = (typeof VIRA_TRIGGER_INBOX_STATUSES)[number];

export interface ViraTriggerInboxRecord {
  readonly version: typeof VIRA_TRIGGER_INBOX_VERSION;
  readonly sourceRef: string;
  readonly eventId: string;
  readonly scope: ViraEnterpriseScope;
  readonly revision: number;
  readonly status: ViraTriggerInboxStatus;
  readonly triggerType: ViraApplicationTriggerType;
  readonly entrypointRef: ViraApplicationExactReference;
  readonly resolution: ViraApplicationRunResolutionPin;
  readonly resolutionArtifactRef: ViraArtifactRevisionReference;
  readonly payloadArtifactRef: ViraArtifactRevisionReference | null;
  readonly occurredAtUnixMs: number;
  readonly receivedAtUnixMs: number;
  readonly replayExpiresAtUnixMs: number;
  readonly processingRef: string | null;
  readonly leaseUntilUnixMs: number | null;
  readonly processedRunId: string | null;
  readonly updatedAtUnixMs: number;
}

export type ViraTriggerInboxStoreMutationCode = "ALREADY_EXISTS" | "NOT_FOUND" | "VERSION_CONFLICT";
export type ViraTriggerInboxStoreMutationResult =
  | { readonly ok: true; readonly value: ViraTriggerInboxRecord }
  | { readonly ok: false; readonly code: ViraTriggerInboxStoreMutationCode };

/** Durable event inbox boundary. Store keys MUST include exact scope + sourceRef + eventId. */
export interface ViraTriggerInboxStore {
  readonly read: (
    scope: ViraEnterpriseScope,
    sourceRef: string,
    eventId: string,
  ) => Promise<ViraTriggerInboxRecord | undefined>;
  readonly create: (record: ViraTriggerInboxRecord) => Promise<ViraTriggerInboxStoreMutationResult>;
  readonly replace: (
    record: ViraTriggerInboxRecord,
    expectedRevision: number,
  ) => Promise<ViraTriggerInboxStoreMutationResult>;
}

export type ViraTriggerInboxIssueCode =
  | "INVALID_SERVICE"
  | "INVALID_INPUT"
  | "INVALID_SCOPE"
  | "INVALID_RESOLUTION"
  | "INVALID_TRIGGER"
  | "INVALID_PAYLOAD"
  | "REPLAY_EXPIRED"
  | "REPLAY_CONFLICT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATE"
  | "LEASE_ACTIVE"
  | "LEASE_MISMATCH"
  | "REVISION_OVERFLOW"
  | "STORE_FAILURE";

export interface ViraTriggerInboxIssue {
  readonly code: ViraTriggerInboxIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraTriggerInboxResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraTriggerInboxIssue };

export interface ViraTriggerInboxReceiveInput {
  readonly scope: unknown;
  readonly sourceRef: string;
  readonly eventId: string;
  readonly triggerType: unknown;
  readonly resolution: unknown;
  readonly entrypointRef: unknown;
  readonly resolutionArtifact: unknown;
  readonly payloadArtifact: unknown | null;
  readonly occurredAtUnixMs: number;
}

export interface ViraTriggerInboxReceiveReceipt {
  readonly record: ViraTriggerInboxRecord;
  readonly duplicate: boolean;
}

export interface ViraTriggerInboxVersionedInput {
  readonly scope: unknown;
  readonly sourceRef: string;
  readonly eventId: string;
  readonly expectedRevision: number;
}

export interface ViraTriggerInboxClaimInput extends ViraTriggerInboxVersionedInput {
  readonly processingRef: string;
}

export interface ViraTriggerInboxCompleteInput extends ViraTriggerInboxClaimInput {
  readonly runId: string;
}

export interface ViraTriggerInboxServiceConfiguration {
  readonly store: ViraTriggerInboxStore;
  readonly nowUnixMs: () => number;
  readonly replayWindowMs: number;
  readonly allowedClockSkewMs: number;
  readonly processingLeaseMs: number;
}

export interface ViraTriggerInboxService {
  readonly receive: (input: ViraTriggerInboxReceiveInput) => Promise<ViraTriggerInboxResult<ViraTriggerInboxReceiveReceipt>>;
  readonly read: (scope: unknown, sourceRef: string, eventId: string) => Promise<ViraTriggerInboxResult<ViraTriggerInboxRecord>>;
  readonly claim: (input: ViraTriggerInboxClaimInput) => Promise<ViraTriggerInboxResult<ViraTriggerInboxRecord>>;
  readonly release: (input: ViraTriggerInboxClaimInput) => Promise<ViraTriggerInboxResult<ViraTriggerInboxRecord>>;
  readonly complete: (input: ViraTriggerInboxCompleteInput) => Promise<ViraTriggerInboxResult<ViraTriggerInboxRecord>>;
}

const LOGICAL_REF = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,511}$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ENTERPRISE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const STATUSES = new Set<string>(VIRA_TRIGGER_INBOX_STATUSES);

type Failure = { readonly ok: false; readonly issue: ViraTriggerInboxIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function fail<T>(code: ViraTriggerInboxIssueCode, path: string, message: string): ViraTriggerInboxResult<T> {
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

function safeAdd(left: number, right: number): number | undefined {
  const sum = left + right;
  return Number.isSafeInteger(sum) && sum >= 0 ? sum : undefined;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function exactApplicationRef(left: ViraApplicationExactReference, right: ViraApplicationExactReference): boolean {
  return left.id === right.id && left.versionRef === right.versionRef;
}

function exactArtifactRef(left: ViraArtifactRevisionReference | null, right: ViraArtifactRevisionReference | null): boolean {
  if (left === null || right === null) return left === right;
  return left.id === right.id && left.revision === right.revision && left.digest === right.digest;
}

function exactResolutionPin(left: ViraApplicationRunResolutionPin, right: ViraApplicationRunResolutionPin): boolean {
  return left.release.id === right.release.id
    && left.release.version === right.release.version
    && left.environment === right.environment
    && left.deploymentId === right.deploymentId
    && left.deploymentRevision === right.deploymentRevision
    && left.artifactId === right.artifactId
    && left.distributionDigest === right.distributionDigest
    && left.resolutionDigest === right.resolutionDigest;
}

function parseScope(input: unknown): Parsed<ViraEnterpriseScope> {
  if (!record(input) || !exactKeys(input, ["version", "organizationId", "projectId", "environment"])) {
    return fail("INVALID_SCOPE", "$.scope", "trigger scope must be an exact enterprise scope");
  }
  if (
    input.version !== VIRA_ENTERPRISE_CONTEXT_VERSION
    || typeof input.organizationId !== "string"
    || !ENTERPRISE_ID.test(input.organizationId)
    || typeof input.projectId !== "string"
    || !ENTERPRISE_ID.test(input.projectId)
    || typeof input.environment !== "string"
    || !VIRA_ENTERPRISE_ENVIRONMENTS.includes(input.environment as ViraEnterpriseEnvironmentName)
  ) return fail("INVALID_SCOPE", "$.scope", "trigger scope is invalid");
  const context = createViraEnterpriseContext({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environments: [input.environment],
  });
  if (!context.ok) return fail("INVALID_SCOPE", "$.scope", "trigger scope is not canonical");
  const scope = context.value.scope(input.environment as ViraEnterpriseEnvironmentName);
  if (!scope.ok) return fail("INVALID_SCOPE", "$.scope", "trigger scope is not registered");
  return { ok: true, value: scope.value };
}

function artifactReference(metadata: ViraArtifactMetadata): ViraArtifactRevisionReference {
  return Object.freeze({ id: metadata.id, revision: metadata.revision, digest: metadata.digest });
}

function parseResolutionBinding(
  input: unknown,
  scope: ViraEnterpriseScope,
  triggerTypeInput: unknown,
  entrypointInput: unknown,
): Parsed<{
  readonly triggerType: ViraApplicationTriggerType;
  readonly entrypointRef: ViraApplicationExactReference;
  readonly pin: ViraApplicationRunResolutionPin;
  readonly resolutionDigest: string;
  readonly canonicalArtifact: string;
}> {
  if (typeof triggerTypeInput !== "string" || !VIRA_APPLICATION_TRIGGER_TYPES.includes(triggerTypeInput as ViraApplicationTriggerType)) {
    return fail("INVALID_TRIGGER", "$.triggerType", "trigger type must be api, webhook, schedule or application-call");
  }
  if (!record(input) || !exactKeys(input, ["artifact", "canonicalArtifact", "resolutionDigest"]) || !record(input.artifact)) {
    return fail("INVALID_RESOLUTION", "$.resolution", "trigger delivery requires a canonical Application resolution");
  }
  const artifact = input.artifact;
  if (!exactKeys(artifact, [
    "schemaVersion", "release", "environment", "deploymentId", "deploymentRevision", "artifactId",
    "distributionDigest", "publisherId", "distribution", "provenance", "binding",
  ])) return fail("INVALID_RESOLUTION", "$.resolution.artifact", "resolution artifact shape is invalid");
  if (artifact.schemaVersion !== VIRA_APPLICATION_RESOLUTION_SCHEMA_VERSION || !record(artifact.release)) {
    return fail("INVALID_RESOLUTION", "$.resolution.artifact", "resolution artifact version/release is invalid");
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
    || typeof artifact.publisherId !== "string"
    || !LOGICAL_REF.test(artifact.publisherId)
    || typeof input.resolutionDigest !== "string"
    || !SHA256_HEX.test(input.resolutionDigest)
    || typeof input.canonicalArtifact !== "string"
    || input.canonicalArtifact.length < 1
    || input.canonicalArtifact.length > VIRA_TRIGGER_RESOLUTION_ARTIFACT_MAX_BYTES
  ) return fail("INVALID_RESOLUTION", "$.resolution", "resolution pin fields are invalid");
  if (!record(artifact.binding) || !record(artifact.binding.scope)) {
    return fail("INVALID_RESOLUTION", "$.resolution.artifact.binding.scope", "resolution binding scope is invalid");
  }
  const bindingScope = parseScope(artifact.binding.scope);
  if (!bindingScope.ok || !exactScope(bindingScope.value, scope)) {
    return fail("INVALID_RESOLUTION", "$.resolution.artifact.binding.scope", "resolution belongs to another enterprise scope");
  }
  if (!record(artifact.distribution) || !record(artifact.distribution.integrity)) {
    return fail("INVALID_RESOLUTION", "$.resolution.artifact.distribution", "resolution distribution is invalid");
  }
  const application = parseViraApplicationPackageV2(artifact.distribution.application);
  if (!application.ok) {
    return fail("INVALID_RESOLUTION", "$.resolution.artifact.distribution.application", `resolved Application V2 is invalid: ${application.issue.code}`);
  }
  if (
    artifact.distribution.schemaVersion !== "2"
    || artifact.distribution.integrity.algorithm !== "sha256"
    || artifact.distribution.integrity.digest !== artifact.distributionDigest
    || application.value.identity.id !== release.value.id
    || application.value.version !== release.value.version
    || application.value.publisher.id !== artifact.publisherId
  ) return fail("INVALID_RESOLUTION", "$.resolution.artifact.distribution", "resolved Application identity/integrity conflicts with the exact resolution");
  const entrypoint = parseViraApplicationExactReference(entrypointInput);
  if (!entrypoint.ok) return fail("INVALID_TRIGGER", "$.entrypointRef", entrypoint.issue.message);
  const triggerType = triggerTypeInput as ViraApplicationTriggerType;
  const declared = application.value.triggers.some((trigger) =>
    trigger.type === triggerType && exactApplicationRef(trigger.entrypointRef, entrypoint.value));
  if (!declared) return fail("INVALID_TRIGGER", "$.entrypointRef", "trigger type/entrypoint is not declared by the resolved Application release");
  const pin: ViraApplicationRunResolutionPin = Object.freeze({
    release: Object.freeze({ ...release.value }),
    environment: scope.environment,
    deploymentId: artifact.deploymentId,
    deploymentRevision: artifact.deploymentRevision,
    artifactId: artifact.artifactId,
    distributionDigest: artifact.distributionDigest,
    resolutionDigest: input.resolutionDigest,
  });
  return {
    ok: true,
    value: Object.freeze({
      triggerType,
      entrypointRef: entrypoint.value,
      pin,
      resolutionDigest: input.resolutionDigest,
      canonicalArtifact: input.canonicalArtifact,
    }),
  };
}

function parseStoredResolutionPin(input: unknown, scope: ViraEnterpriseScope): Parsed<ViraApplicationRunResolutionPin> {
  if (!record(input) || !exactKeys(input, [
    "release", "environment", "deploymentId", "deploymentRevision", "artifactId", "distributionDigest", "resolutionDigest",
  ]) || !record(input.release)) return fail("STORE_FAILURE", "$.store.resolution", "stored trigger resolution pin is invalid");
  const release = parseViraApplicationReleaseReference(input.release);
  if (!release.ok) return fail("STORE_FAILURE", "$.store.resolution.release", "stored trigger release pin is invalid");
  if (
    input.environment !== scope.environment
    || typeof input.deploymentId !== "string" || !LOGICAL_REF.test(input.deploymentId)
    || !safePositive(input.deploymentRevision)
    || typeof input.artifactId !== "string" || !LOGICAL_REF.test(input.artifactId)
    || typeof input.distributionDigest !== "string" || !SHA256_HEX.test(input.distributionDigest)
    || typeof input.resolutionDigest !== "string" || !SHA256_HEX.test(input.resolutionDigest)
  ) return fail("STORE_FAILURE", "$.store.resolution", "stored trigger resolution pin fields are invalid");
  return {
    ok: true,
    value: Object.freeze({
      release: release.value,
      environment: scope.environment,
      deploymentId: input.deploymentId,
      deploymentRevision: input.deploymentRevision,
      artifactId: input.artifactId,
      distributionDigest: input.distributionDigest,
      resolutionDigest: input.resolutionDigest,
    }),
  };
}

function canonicalStoredRecord(
  value: ViraTriggerInboxRecord | undefined,
  scope: ViraEnterpriseScope,
  sourceRef: string,
  eventId: string,
): ViraTriggerInboxRecord | undefined {
  if (!record(value) || !exactKeys(value, [
    "version", "sourceRef", "eventId", "scope", "revision", "status", "triggerType", "entrypointRef", "resolution",
    "resolutionArtifactRef", "payloadArtifactRef", "occurredAtUnixMs", "receivedAtUnixMs", "replayExpiresAtUnixMs",
    "processingRef", "leaseUntilUnixMs", "processedRunId", "updatedAtUnixMs",
  ])) return undefined;
  const item = value as unknown as ViraTriggerInboxRecord;
  const storedScope = parseScope(item.scope);
  if (!storedScope.ok || !exactScope(storedScope.value, scope)) return undefined;
  if (
    item.version !== VIRA_TRIGGER_INBOX_VERSION
    || item.sourceRef !== sourceRef
    || item.eventId !== eventId
    || !LOGICAL_REF.test(item.sourceRef)
    || !LOGICAL_REF.test(item.eventId)
    || !safePositive(item.revision)
    || typeof item.status !== "string" || !STATUSES.has(item.status)
    || typeof item.triggerType !== "string" || !VIRA_APPLICATION_TRIGGER_TYPES.includes(item.triggerType)
    || !safeNonNegative(item.occurredAtUnixMs)
    || !safeNonNegative(item.receivedAtUnixMs)
    || !safeNonNegative(item.replayExpiresAtUnixMs)
    || item.replayExpiresAtUnixMs < item.occurredAtUnixMs
    || !safeNonNegative(item.updatedAtUnixMs)
    || item.updatedAtUnixMs < item.receivedAtUnixMs
    || (item.processingRef !== null && (typeof item.processingRef !== "string" || !LOGICAL_REF.test(item.processingRef)))
    || (item.leaseUntilUnixMs !== null && !safeNonNegative(item.leaseUntilUnixMs))
    || (item.processedRunId !== null && (typeof item.processedRunId !== "string" || !RUN_ID.test(item.processedRunId)))
  ) return undefined;
  const entrypoint = parseViraApplicationExactReference(item.entrypointRef);
  const resolution = parseStoredResolutionPin(item.resolution, scope);
  const resolutionArtifact = parseViraArtifactRevisionReference(item.resolutionArtifactRef);
  const payloadArtifact = item.payloadArtifactRef === null
    ? null
    : parseViraArtifactRevisionReference(item.payloadArtifactRef);
  if (!entrypoint.ok || !resolution.ok || !resolutionArtifact.ok || (payloadArtifact !== null && !payloadArtifact.ok)) return undefined;
  if (resolutionArtifact.value.digest !== `sha256:${resolution.value.resolutionDigest}`) return undefined;
  if (item.status === "pending" && (item.processingRef !== null || item.leaseUntilUnixMs !== null || item.processedRunId !== null)) return undefined;
  if (item.status === "processing" && (item.processingRef === null || item.leaseUntilUnixMs === null || item.processedRunId !== null)) return undefined;
  if (item.status === "processed" && (item.processingRef !== null || item.leaseUntilUnixMs !== null || item.processedRunId === null)) return undefined;
  return item;
}

function sameDelivery(left: ViraTriggerInboxRecord, right: ViraTriggerInboxRecord): boolean {
  return exactScope(left.scope, right.scope)
    && left.sourceRef === right.sourceRef
    && left.eventId === right.eventId
    && left.triggerType === right.triggerType
    && exactApplicationRef(left.entrypointRef, right.entrypointRef)
    && exactResolutionPin(left.resolution, right.resolution)
    && exactArtifactRef(left.resolutionArtifactRef, right.resolutionArtifactRef)
    && exactArtifactRef(left.payloadArtifactRef, right.payloadArtifactRef)
    && left.occurredAtUnixMs === right.occurredAtUnixMs;
}

function nextRevision(current: number): number | undefined {
  if (!Number.isSafeInteger(current) || current < 1 || current >= Number.MAX_SAFE_INTEGER) return undefined;
  return current + 1;
}

function mapMutation(result: ViraTriggerInboxStoreMutationResult): ViraTriggerInboxResult<ViraTriggerInboxRecord> {
  if (result.ok) return result;
  if (result.code === "VERSION_CONFLICT" || result.code === "ALREADY_EXISTS") {
    return fail("CONFLICT", "$", "trigger inbox durable state changed concurrently");
  }
  return fail("NOT_FOUND", "$", "trigger inbox record does not exist");
}

export function createViraTriggerInboxService(
  config: ViraTriggerInboxServiceConfiguration,
): ViraTriggerInboxResult<ViraTriggerInboxService> {
  if (
    config === null || typeof config !== "object"
    || config.store === null || typeof config.store !== "object"
    || typeof config.store.read !== "function" || typeof config.store.create !== "function" || typeof config.store.replace !== "function"
    || typeof config.nowUnixMs !== "function"
    || !safePositive(config.replayWindowMs) || config.replayWindowMs > VIRA_TRIGGER_REPLAY_WINDOW_MAX_MS
    || !safeNonNegative(config.allowedClockSkewMs) || config.allowedClockSkewMs > VIRA_TRIGGER_CLOCK_SKEW_MAX_MS
    || !safePositive(config.processingLeaseMs) || config.processingLeaseMs > VIRA_TRIGGER_PROCESSING_LEASE_MAX_MS
  ) return fail("INVALID_SERVICE", "$", "trigger inbox requires durable store, clock and bounded replay/lease configuration");

  const store = config.store;
  const nowUnixMs = config.nowUnixMs;

  function readNow(): Parsed<number> {
    let now: number;
    try { now = nowUnixMs(); } catch { return fail("INVALID_SERVICE", "$.clock", "trigger inbox clock failed closed"); }
    if (!safeNonNegative(now)) return fail("INVALID_SERVICE", "$.clock", "trigger inbox clock must return a non-negative safe integer");
    return { ok: true, value: now };
  }

  async function readStored(scope: ViraEnterpriseScope, sourceRef: string, eventId: string): Promise<ViraTriggerInboxResult<ViraTriggerInboxRecord>> {
    let raw: ViraTriggerInboxRecord | undefined;
    try { raw = await store.read(scope, sourceRef, eventId); } catch { return fail("STORE_FAILURE", "$.store", "trigger inbox read failed closed"); }
    if (raw === undefined) return fail("NOT_FOUND", "$.eventId", "trigger event was not found in the exact source/scope");
    const item = canonicalStoredRecord(raw, scope, sourceRef, eventId);
    if (!item) return fail("STORE_FAILURE", "$.store", "trigger inbox returned a non-canonical or cross-scope record");
    return { ok: true, value: item };
  }

  async function commit(next: ViraTriggerInboxRecord, expectedRevision: number, message: string): Promise<ViraTriggerInboxResult<ViraTriggerInboxRecord>> {
    let stored: ViraTriggerInboxStoreMutationResult;
    try { stored = await store.replace(next, expectedRevision); } catch { return fail("STORE_FAILURE", "$.store", message); }
    return mapMutation(stored);
  }

  const service: ViraTriggerInboxService = {
    async receive(input) {
      if (!record(input) || !exactKeys(input, [
        "scope", "sourceRef", "eventId", "triggerType", "resolution", "entrypointRef", "resolutionArtifact", "payloadArtifact", "occurredAtUnixMs",
      ])) return fail("INVALID_INPUT", "$", "trigger receive input must be an exact object");
      if (
        typeof input.sourceRef !== "string" || !LOGICAL_REF.test(input.sourceRef)
        || typeof input.eventId !== "string" || !LOGICAL_REF.test(input.eventId)
        || !safeNonNegative(input.occurredAtUnixMs)
      ) return fail("INVALID_INPUT", "$", "trigger source/event identity or timestamp is invalid");
      const scope = parseScope(input.scope); if (!scope.ok) return scope;
      const now = readNow(); if (!now.ok) return now;
      const futureLimit = safeAdd(now.value, config.allowedClockSkewMs);
      if (futureLimit === undefined || input.occurredAtUnixMs > futureLimit) {
        return fail("INVALID_INPUT", "$.occurredAtUnixMs", "trigger event timestamp is too far in the future");
      }
      if (now.value >= input.occurredAtUnixMs && now.value - input.occurredAtUnixMs > config.replayWindowMs) {
        return fail("REPLAY_EXPIRED", "$.occurredAtUnixMs", "trigger event is outside the configured replay window");
      }
      const replayExpiresAtUnixMs = safeAdd(input.occurredAtUnixMs, config.replayWindowMs);
      if (replayExpiresAtUnixMs === undefined) return fail("INVALID_INPUT", "$.occurredAtUnixMs", "trigger replay expiry overflows safe time range");
      const binding = parseResolutionBinding(input.resolution, scope.value, input.triggerType, input.entrypointRef);
      if (!binding.ok) return binding;

      const resolutionArtifact = parseViraArtifactMetadata(input.resolutionArtifact);
      if (!resolutionArtifact.ok || !exactScope(resolutionArtifact.value.scope, scope.value)) {
        return fail("INVALID_RESOLUTION", "$.resolutionArtifact", "resolution artifact metadata is invalid or cross-scope");
      }
      if (
        resolutionArtifact.value.digest !== `sha256:${binding.value.resolutionDigest}`
        || resolutionArtifact.value.mediaType !== "application/json"
        || resolutionArtifact.value.byteLength > VIRA_TRIGGER_RESOLUTION_ARTIFACT_MAX_BYTES
      ) return fail("INVALID_RESOLUTION", "$.resolutionArtifact", "resolution artifact does not exactly pin the canonical resolution digest/media type");

      let payloadRef: ViraArtifactRevisionReference | null = null;
      if (input.payloadArtifact !== null) {
        const payload = parseViraArtifactMetadata(input.payloadArtifact);
        if (!payload.ok || !exactScope(payload.value.scope, scope.value) || payload.value.byteLength > VIRA_TRIGGER_PAYLOAD_MAX_BYTES) {
          return fail("INVALID_PAYLOAD", "$.payloadArtifact", "trigger payload artifact is invalid, cross-scope or exceeds the bounded payload size");
        }
        payloadRef = artifactReference(payload.value);
      }

      const item: ViraTriggerInboxRecord = Object.freeze({
        version: VIRA_TRIGGER_INBOX_VERSION,
        sourceRef: input.sourceRef,
        eventId: input.eventId,
        scope: scope.value,
        revision: 1,
        status: "pending",
        triggerType: binding.value.triggerType,
        entrypointRef: Object.freeze({ ...binding.value.entrypointRef }),
        resolution: binding.value.pin,
        resolutionArtifactRef: artifactReference(resolutionArtifact.value),
        payloadArtifactRef: payloadRef,
        occurredAtUnixMs: input.occurredAtUnixMs,
        receivedAtUnixMs: now.value,
        replayExpiresAtUnixMs,
        processingRef: null,
        leaseUntilUnixMs: null,
        processedRunId: null,
        updatedAtUnixMs: now.value,
      });
      let stored: ViraTriggerInboxStoreMutationResult;
      try { stored = await store.create(item); } catch { return fail("STORE_FAILURE", "$.store", "trigger inbox receive failed closed"); }
      if (!stored.ok && stored.code === "ALREADY_EXISTS") {
        const existing = await readStored(scope.value, input.sourceRef, input.eventId);
        if (!existing.ok) return existing;
        if (!sameDelivery(existing.value, item)) {
          return fail("REPLAY_CONFLICT", "$.eventId", "trigger event id was replayed with conflicting binding or artifact identity");
        }
        return { ok: true, value: Object.freeze({ record: existing.value, duplicate: true }) };
      }
      if (!stored.ok) {
        if (stored.code === "VERSION_CONFLICT" || stored.code === "ALREADY_EXISTS") {
          return fail("CONFLICT", "$", "trigger inbox durable state changed concurrently");
        }
        return fail("NOT_FOUND", "$", "trigger inbox record does not exist");
      }
      return { ok: true, value: Object.freeze({ record: stored.value, duplicate: false }) };
    },

    async read(scopeInput, sourceRef, eventId) {
      if (typeof sourceRef !== "string" || !LOGICAL_REF.test(sourceRef) || typeof eventId !== "string" || !LOGICAL_REF.test(eventId)) {
        return fail("INVALID_INPUT", "$", "trigger source/event identity is invalid");
      }
      const scope = parseScope(scopeInput); if (!scope.ok) return scope;
      return readStored(scope.value, sourceRef, eventId);
    },

    async claim(input) {
      if (!record(input) || !exactKeys(input, ["scope", "sourceRef", "eventId", "expectedRevision", "processingRef"]) || typeof input.sourceRef !== "string" || !LOGICAL_REF.test(input.sourceRef) || typeof input.eventId !== "string" || !LOGICAL_REF.test(input.eventId) || !safePositive(input.expectedRevision) || typeof input.processingRef !== "string" || !LOGICAL_REF.test(input.processingRef)) {
        return fail("INVALID_INPUT", "$", "trigger claim input is invalid");
      }
      const scope = parseScope(input.scope); if (!scope.ok) return scope;
      const current = await readStored(scope.value, input.sourceRef, input.eventId); if (!current.ok) return current;
      if (current.value.revision !== input.expectedRevision) return fail("CONFLICT", "$.expectedRevision", "trigger inbox revision is stale");
      if (current.value.status === "processed") return fail("INVALID_STATE", "$.status", "processed trigger events cannot be claimed again");
      const now = readNow(); if (!now.ok) return now;
      if (current.value.status === "processing" && current.value.leaseUntilUnixMs !== null && now.value < current.value.leaseUntilUnixMs) {
        return fail("LEASE_ACTIVE", "$.processingRef", "trigger event already has an active processing lease");
      }
      const leaseUntilUnixMs = safeAdd(now.value, config.processingLeaseMs);
      if (leaseUntilUnixMs === undefined) return fail("INVALID_SERVICE", "$.processingLeaseMs", "trigger processing lease overflows safe time range");
      const revision = nextRevision(current.value.revision); if (revision === undefined) return fail("REVISION_OVERFLOW", "$.revision", "trigger inbox revision cannot advance safely");
      return commit(Object.freeze({
        ...current.value,
        revision,
        status: "processing",
        processingRef: input.processingRef,
        leaseUntilUnixMs,
        processedRunId: null,
        updatedAtUnixMs: now.value,
      }), input.expectedRevision, "trigger inbox claim failed closed");
    },

    async release(input) {
      if (!record(input) || !exactKeys(input, ["scope", "sourceRef", "eventId", "expectedRevision", "processingRef"]) || typeof input.sourceRef !== "string" || !LOGICAL_REF.test(input.sourceRef) || typeof input.eventId !== "string" || !LOGICAL_REF.test(input.eventId) || !safePositive(input.expectedRevision) || typeof input.processingRef !== "string" || !LOGICAL_REF.test(input.processingRef)) {
        return fail("INVALID_INPUT", "$", "trigger release input is invalid");
      }
      const scope = parseScope(input.scope); if (!scope.ok) return scope;
      const current = await readStored(scope.value, input.sourceRef, input.eventId); if (!current.ok) return current;
      if (current.value.revision !== input.expectedRevision) return fail("CONFLICT", "$.expectedRevision", "trigger inbox revision is stale");
      if (current.value.status !== "processing" || current.value.processingRef === null) return fail("INVALID_STATE", "$.status", "only a processing trigger event can be released");
      if (current.value.processingRef !== input.processingRef) return fail("LEASE_MISMATCH", "$.processingRef", "trigger processing lease owner does not match");
      const revision = nextRevision(current.value.revision); if (revision === undefined) return fail("REVISION_OVERFLOW", "$.revision", "trigger inbox revision cannot advance safely");
      const now = readNow(); if (!now.ok) return now;
      return commit(Object.freeze({
        ...current.value,
        revision,
        status: "pending",
        processingRef: null,
        leaseUntilUnixMs: null,
        updatedAtUnixMs: now.value,
      }), input.expectedRevision, "trigger inbox release failed closed");
    },

    async complete(input) {
      if (!record(input) || !exactKeys(input, ["scope", "sourceRef", "eventId", "expectedRevision", "processingRef", "runId"]) || typeof input.sourceRef !== "string" || !LOGICAL_REF.test(input.sourceRef) || typeof input.eventId !== "string" || !LOGICAL_REF.test(input.eventId) || !safePositive(input.expectedRevision) || typeof input.processingRef !== "string" || !LOGICAL_REF.test(input.processingRef) || typeof input.runId !== "string" || !RUN_ID.test(input.runId)) {
        return fail("INVALID_INPUT", "$", "trigger completion input is invalid");
      }
      const scope = parseScope(input.scope); if (!scope.ok) return scope;
      const current = await readStored(scope.value, input.sourceRef, input.eventId); if (!current.ok) return current;
      if (current.value.revision !== input.expectedRevision) return fail("CONFLICT", "$.expectedRevision", "trigger inbox revision is stale");
      if (current.value.status !== "processing" || current.value.processingRef === null) return fail("INVALID_STATE", "$.status", "only a processing trigger event can be completed");
      if (current.value.processingRef !== input.processingRef) return fail("LEASE_MISMATCH", "$.processingRef", "trigger processing lease owner does not match");
      const now = readNow(); if (!now.ok) return now;
      if (current.value.leaseUntilUnixMs === null || now.value >= current.value.leaseUntilUnixMs) {
        return fail("LEASE_MISMATCH", "$.processingRef", "trigger processing lease expired before completion");
      }
      const revision = nextRevision(current.value.revision); if (revision === undefined) return fail("REVISION_OVERFLOW", "$.revision", "trigger inbox revision cannot advance safely");
      return commit(Object.freeze({
        ...current.value,
        revision,
        status: "processed",
        processingRef: null,
        leaseUntilUnixMs: null,
        processedRunId: input.runId,
        updatedAtUnixMs: now.value,
      }), input.expectedRevision, "trigger inbox completion failed closed");
    },
  };

  return { ok: true, value: Object.freeze(service) };
}
