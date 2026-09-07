import {
  parseViraApplicationReleaseReference,
  type ViraApplicationExactReference,
} from "@vira-enterprise-genui/application-package";
import {
  isViraDurableActionVerificationRecord,
  type ViraDurableActionVerificationRecord,
} from "@vira-enterprise-genui/action-verification/durable";
import type {
  ViraDurableExecutionAuthoritySnapshot,
} from "@vira-enterprise-genui/durable-execution/authority";
import {
  createViraEnterpriseContext,
  type ViraEnterprisePrincipal,
  type ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";
import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import { parseViraCommercialUsageBatch } from "./metering.js";
import type { ViraCommercialUsageRecord } from "./types.js";

export const VIRA_COMMERCIAL_TRUSTED_USAGE_SOURCE_VERSION = "1" as const;
export const VIRA_COMMERCIAL_TRUSTED_USAGE_SOURCE_KINDS = Object.freeze([
  "action.effect.verified",
] as const);

export type ViraCommercialTrustedUsageSourceKind =
  (typeof VIRA_COMMERCIAL_TRUSTED_USAGE_SOURCE_KINDS)[number];

export interface ViraCommercialTrustedUsageSourceDigestProvider {
  readonly sha256: (canonicalInput: string) => Promise<unknown> | unknown;
}

export interface ViraCommercialActionVerificationSource {
  readonly read: (
    scope: ViraEnterpriseScope,
    verificationId: string,
  ) => Promise<unknown> | unknown;
}

export interface ViraCommercialExecutionAuthoritySource {
  readonly read: (
    scope: ViraEnterpriseScope,
    executionId: string,
  ) => Promise<unknown> | unknown;
}

export interface ViraCommercialVerifiedActionBillingBinding {
  readonly entitlementRef: ViraApplicationExactReference;
  readonly meteringRef: ViraApplicationExactReference;
  readonly unit: "count";
  readonly locationId: string | null;
}

export interface ViraCommercialVerifiedActionBillingBindingSource {
  readonly resolve: (input: Readonly<{
    readonly verification: ViraDurableActionVerificationRecord;
    readonly authority: ViraDurableExecutionAuthoritySnapshot;
  }>) => Promise<unknown> | unknown;
}

export interface ViraCommercialTrustedUsageSourceDependencies {
  readonly verificationSource: ViraCommercialActionVerificationSource;
  readonly authoritySource: ViraCommercialExecutionAuthoritySource;
  readonly billingBindingSource: ViraCommercialVerifiedActionBillingBindingSource;
  readonly digestProvider: ViraCommercialTrustedUsageSourceDigestProvider;
}

export interface ViraCommercialUsageAttribution {
  readonly publisherId: string | null;
  readonly providerId: string | null;
  readonly modelId: string | null;
  readonly nodeId: string | null;
  readonly platformId: string | null;
}

export interface ViraCommercialTrustedUsageSourceAuthority {
  readonly kind: "action-verification";
  readonly verificationId: string;
  readonly transactionId: string;
  readonly planDigest: string;
  readonly planRevision: number;
  readonly operationId: string;
  readonly executionId: string;
  readonly attemptId: string;
  readonly verificationRevision: number;
  readonly afterObservationDigest: string;
}

export interface ViraCommercialTrustedUsageSourceEvent {
  readonly version: typeof VIRA_COMMERCIAL_TRUSTED_USAGE_SOURCE_VERSION;
  readonly sourceKind: ViraCommercialTrustedUsageSourceKind;
  readonly sourceEventId: string;
  readonly occurredAt: string;
  readonly scope: ViraEnterpriseScope;
  readonly principal: ViraEnterprisePrincipal;
  readonly applicationId: string;
  readonly applicationVersion: string;
  readonly applicationDigest: string;
  readonly entitlementRef: ViraApplicationExactReference;
  readonly meteringRef: ViraApplicationExactReference;
  readonly capabilityRef: ViraApplicationExactReference | null;
  readonly locationId: string | null;
  readonly quantity: number;
  readonly authority: ViraCommercialTrustedUsageSourceAuthority;
  readonly attribution: ViraCommercialUsageAttribution;
}

export type ViraCommercialTrustedUsageSourceIssueCode =
  | "INVALID_INPUT"
  | "INVALID_SCOPE"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_READ_FAILED"
  | "SOURCE_IDENTITY_MISMATCH"
  | "UNVERIFIED_SOURCE"
  | "INVALID_AUTHORITY"
  | "BINDING_RESOLUTION_FAILED"
  | "INVALID_BINDING"
  | "UNDECLARED_COMMERCIAL_REFERENCE"
  | "UNSUPPORTED_METER_UNIT"
  | "DIGEST_FAILED"
  | "INVALID_DIGEST"
  | "INVALID_USAGE_RECORD";

export interface ViraCommercialTrustedUsageSourceIssue {
  readonly code: ViraCommercialTrustedUsageSourceIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCommercialTrustedUsageSourceResult =
  | {
      readonly ok: true;
      readonly value: Readonly<{
        readonly event: ViraCommercialTrustedUsageSourceEvent;
        readonly usage: ViraCommercialUsageRecord;
      }>;
    }
  | { readonly ok: false; readonly issue: ViraCommercialTrustedUsageSourceIssue };

const SHA256_HEX = /^[a-f0-9]{64}$/;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const REF_FIELDS = new Set(["id", "versionRef"]);
const REQUEST_FIELDS = new Set(["scope", "verificationId"]);
const SCOPE_FIELDS = new Set(["version", "organizationId", "projectId", "environment"]);
const BINDING_FIELDS = new Set(["entitlementRef", "meteringRef", "unit", "locationId"]);

function fail(
  code: ViraCommercialTrustedUsageSourceIssueCode,
  path: string,
  message: string,
): ViraCommercialTrustedUsageSourceResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value: JsonObject, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function exactRef(value: JsonValue | undefined): ViraApplicationExactReference | null {
  if (!object(value) || !exactFields(value, REF_FIELDS)) return null;
  if (typeof value.id !== "string" || !isSemanticNamespace(value.id)) return null;
  if (
    typeof value.versionRef !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/.test(value.versionRef)
    || new Set(["latest", "current", "stable", "head", "main", "next"]).has(value.versionRef.toLowerCase())
    || /(?:^|[._:+-])[xX](?:$|[._:+-])/.test(value.versionRef)
    || /\d[xX](?:$|[._:+-])/.test(value.versionRef)
  ) return null;
  return Object.freeze({ id: value.id, versionRef: value.versionRef });
}

function sameRef(left: ViraApplicationExactReference, right: ViraApplicationExactReference): boolean {
  return left.id === right.id && left.versionRef === right.versionRef;
}

function sameScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function parseScope(value: JsonValue | undefined): ViraEnterpriseScope | null {
  if (!object(value) || !exactFields(value, SCOPE_FIELDS)) return null;
  if (
    value.version !== "1"
    || typeof value.organizationId !== "string"
    || typeof value.projectId !== "string"
    || typeof value.environment !== "string"
  ) return null;
  const context = createViraEnterpriseContext({
    organizationId: value.organizationId,
    projectId: value.projectId,
    environments: [value.environment as ViraEnterpriseScope["environment"]],
  });
  if (!context.ok) return null;
  const scope = context.value.scope(value.environment as ViraEnterpriseScope["environment"]);
  return scope.ok && scope.value.version === value.version ? scope.value : null;
}

function parseRequest(input: unknown):
  | { readonly ok: true; readonly value: Readonly<{ scope: ViraEnterpriseScope; verificationId: string }> }
  | { readonly ok: false; readonly result: ViraCommercialTrustedUsageSourceResult } {
  const json = parseJsonValue(input, "$source");
  if (!json.ok || !object(json.value) || !exactFields(json.value, REQUEST_FIELDS)) {
    return { ok: false, result: fail("INVALID_INPUT", "$source", "usage source request must contain exact scope + verificationId") };
  }
  const scope = parseScope(json.value.scope);
  if (!scope) return { ok: false, result: fail("INVALID_SCOPE", "$source.scope", "usage source scope is invalid") };
  if (typeof json.value.verificationId !== "string" || !SAFE_TOKEN.test(json.value.verificationId) || json.value.verificationId.trim() !== json.value.verificationId) {
    return { ok: false, result: fail("INVALID_INPUT", "$source.verificationId", "verificationId is invalid") };
  }
  return { ok: true, value: Object.freeze({ scope, verificationId: json.value.verificationId }) };
}

function canonicalPrincipal(scope: ViraEnterpriseScope, input: unknown): ViraEnterprisePrincipal | null {
  const context = createViraEnterpriseContext({
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    environments: [scope.environment],
  });
  if (!context.ok) return null;
  const principal = context.value.principal(input);
  return principal.ok ? principal.value : null;
}

function isExecutionAuthority(
  input: unknown,
  verification: ViraDurableActionVerificationRecord,
): input is ViraDurableExecutionAuthoritySnapshot {
  if (input === null || typeof input !== "object") return false;
  const authority = input as Partial<ViraDurableExecutionAuthoritySnapshot>;
  const frozen = authority.frozen;
  const plan = frozen?.plan;
  if (
    authority.version !== "1"
    || authority.executionId !== verification.executionId
    || authority.transactionId !== verification.transactionId
    || authority.planDigest !== verification.planDigest
    || authority.planRevision !== verification.planRevision
    || authority.operationId !== verification.operationId
    || authority.scope === undefined
    || !sameScope(authority.scope, verification.scope)
    || frozen === undefined
    || frozen.planDigest !== verification.planDigest
    || frozen.planRevision !== verification.planRevision
    || plan === undefined
    || plan.transactionId !== verification.transactionId
    || !sameScope(plan.scope, verification.scope)
    || plan.applicationDigest === undefined
    || typeof plan.applicationDigest !== "string"
    || !SHA256_HEX.test(plan.applicationDigest)
    || !Array.isArray(plan.operations)
    || !plan.operations.some((operation) => operation.operationId === verification.operationId)
    || plan.commercial === null
    || typeof plan.commercial !== "object"
    || !Array.isArray(plan.commercial.entitlementRefs)
    || !Array.isArray(plan.commercial.meteringRefs)
  ) return false;
  return true;
}

function parseBinding(
  input: unknown,
  authority: ViraDurableExecutionAuthoritySnapshot,
): ViraCommercialVerifiedActionBillingBinding | null {
  const parsed = parseJsonValue(input, "$binding");
  if (!parsed.ok || !object(parsed.value) || !exactFields(parsed.value, BINDING_FIELDS)) return null;
  const entitlementRef = exactRef(parsed.value.entitlementRef);
  const meteringRef = exactRef(parsed.value.meteringRef);
  if (!entitlementRef || !meteringRef) return null;
  if (!authority.frozen.plan.commercial.entitlementRefs.some((ref) => sameRef(ref, entitlementRef))) return null;
  if (!authority.frozen.plan.commercial.meteringRefs.some((ref) => sameRef(ref, meteringRef))) return null;
  if (parsed.value.unit !== "count") return null;
  if (parsed.value.locationId !== null && (typeof parsed.value.locationId !== "string" || !isSemanticNamespace(parsed.value.locationId))) return null;
  return Object.freeze({
    entitlementRef,
    meteringRef,
    unit: "count",
    locationId: parsed.value.locationId as string | null,
  });
}

async function sourceDigest(
  provider: ViraCommercialTrustedUsageSourceDigestProvider,
  input: string,
): Promise<string | ViraCommercialTrustedUsageSourceResult> {
  if (provider === null || typeof provider !== "object" || typeof provider.sha256 !== "function") {
    return fail("INVALID_INPUT", "$dependencies.digestProvider", "digestProvider must expose sha256") ;
  }
  let result: unknown;
  try {
    result = await provider.sha256(input);
  } catch {
    return fail("DIGEST_FAILED", "$dependencies.digestProvider", "usage source digest provider failed closed");
  }
  if (typeof result !== "string" || !SHA256_HEX.test(result)) {
    return fail("INVALID_DIGEST", "$dependencies.digestProvider", "usage source digest provider returned invalid SHA-256 evidence");
  }
  return result;
}

function sourceIdentityInput(
  verification: ViraDurableActionVerificationRecord,
  authority: ViraDurableExecutionAuthoritySnapshot,
  binding: ViraCommercialVerifiedActionBillingBinding,
): string {
  return JSON.stringify({
    version: VIRA_COMMERCIAL_TRUSTED_USAGE_SOURCE_VERSION,
    sourceKind: "action.effect.verified",
    scope: {
      version: verification.scope.version,
      organizationId: verification.scope.organizationId,
      projectId: verification.scope.projectId,
      environment: verification.scope.environment,
    },
    verificationId: verification.verificationId,
    transactionId: verification.transactionId,
    planDigest: verification.planDigest,
    planRevision: verification.planRevision,
    operationId: verification.operationId,
    executionId: verification.executionId,
    attemptId: verification.attemptId,
    verificationRevision: verification.revision,
    afterObservationDigest: verification.afterObservationDigest,
    applicationRef: {
      id: authority.frozen.plan.applicationRef.id,
      version: authority.frozen.plan.applicationRef.version,
    },
    applicationDigest: authority.frozen.plan.applicationDigest,
    entitlementRef: { id: binding.entitlementRef.id, versionRef: binding.entitlementRef.versionRef },
    meteringRef: { id: binding.meteringRef.id, versionRef: binding.meteringRef.versionRef },
  });
}

export async function normalizeViraVerifiedActionUsageSource(
  requestInput: unknown,
  dependencies: ViraCommercialTrustedUsageSourceDependencies,
): Promise<ViraCommercialTrustedUsageSourceResult> {
  const request = parseRequest(requestInput);
  if (!request.ok) return request.result;
  if (dependencies === null || typeof dependencies !== "object") {
    return fail("INVALID_INPUT", "$dependencies", "trusted usage source dependencies are required");
  }
  const verificationSource = dependencies.verificationSource;
  const authoritySource = dependencies.authoritySource;
  const billingBindingSource = dependencies.billingBindingSource;
  const digestProvider = dependencies.digestProvider;
  if (
    verificationSource === null || typeof verificationSource !== "object" || typeof verificationSource.read !== "function"
    || authoritySource === null || typeof authoritySource !== "object" || typeof authoritySource.read !== "function"
    || billingBindingSource === null || typeof billingBindingSource !== "object" || typeof billingBindingSource.resolve !== "function"
  ) return fail("INVALID_INPUT", "$dependencies", "trusted usage source dependencies are invalid");

  let rawVerification: unknown;
  try {
    rawVerification = await verificationSource.read(request.value.scope, request.value.verificationId);
  } catch {
    return fail("SOURCE_READ_FAILED", "$source.verificationId", "verification source failed closed");
  }
  if (rawVerification === undefined || rawVerification === null) {
    return fail("SOURCE_NOT_FOUND", "$source.verificationId", "verification source was not found");
  }
  if (!isViraDurableActionVerificationRecord(rawVerification)) {
    return fail("INVALID_AUTHORITY", "$source.verificationId", "verification source returned non-canonical authority");
  }
  const verification = rawVerification;
  if (verification.verificationId !== request.value.verificationId || !sameScope(verification.scope, request.value.scope)) {
    return fail("SOURCE_IDENTITY_MISMATCH", "$source.verificationId", "verification source identity does not match request");
  }
  if (verification.status !== "verified" || verification.afterObservationDigest === null) {
    return fail("UNVERIFIED_SOURCE", "$source.verificationId", "only independently verified Action effects are billable");
  }

  let rawAuthority: unknown;
  try {
    rawAuthority = await authoritySource.read(request.value.scope, verification.executionId);
  } catch {
    return fail("SOURCE_READ_FAILED", "$source.verificationId", "execution authority source failed closed");
  }
  if (!isExecutionAuthority(rawAuthority, verification)) {
    return fail("INVALID_AUTHORITY", "$source.verificationId", "execution authority does not match verified Action coordinates");
  }
  const authority = rawAuthority;
  const applicationRef = parseViraApplicationReleaseReference(authority.frozen.plan.applicationRef);
  if (!applicationRef.ok) return fail("INVALID_AUTHORITY", "$source.verificationId", "execution authority applicationRef is invalid");
  const principal = canonicalPrincipal(request.value.scope, authority.frozen.plan.actor);
  if (!principal) return fail("INVALID_AUTHORITY", "$source.verificationId", "execution authority actor is invalid");

  let rawBinding: unknown;
  try {
    rawBinding = await billingBindingSource.resolve(Object.freeze({ verification, authority }));
  } catch {
    return fail("BINDING_RESOLUTION_FAILED", "$source.verificationId", "billing binding source failed closed");
  }
  const binding = parseBinding(rawBinding, authority);
  if (!binding) return fail("INVALID_BINDING", "$source.verificationId", "billing binding is invalid or not declared by the frozen plan");
  if (binding.unit !== "count") {
    return fail("UNSUPPORTED_METER_UNIT", "$source.verificationId", "verified Action usage currently supports count meters only");
  }

  const identityDigest = await sourceDigest(
    digestProvider,
    sourceIdentityInput(verification, authority, binding),
  );
  if (typeof identityDigest !== "string") return identityDigest;
  const sourceEventId = `usage-${identityDigest}`;
  const occurredAt = new Date(verification.updatedAtEpochMs).toISOString();

  const usageCandidate = {
    schemaVersion: "1",
    records: [{
      usageId: sourceEventId,
      sourceId: "action.verification",
      occurredAt,
      applicationId: applicationRef.value.id,
      applicationVersion: applicationRef.value.version,
      entitlementRef: binding.entitlementRef,
      meteringRef: binding.meteringRef,
      principal,
      scope: request.value.scope,
      capabilityRef: null,
      locationId: binding.locationId,
      quantity: 1,
    }],
  };
  const parsedUsage = parseViraCommercialUsageBatch(usageCandidate);
  if (!parsedUsage.ok || parsedUsage.value.records.length !== 1) {
    return fail("INVALID_USAGE_RECORD", "$source", parsedUsage.ok ? "normalized source did not yield one usage record" : parsedUsage.issue.message);
  }

  const event: ViraCommercialTrustedUsageSourceEvent = Object.freeze({
    version: VIRA_COMMERCIAL_TRUSTED_USAGE_SOURCE_VERSION,
    sourceKind: "action.effect.verified",
    sourceEventId,
    occurredAt,
    scope: request.value.scope,
    principal,
    applicationId: applicationRef.value.id,
    applicationVersion: applicationRef.value.version,
    applicationDigest: authority.frozen.plan.applicationDigest,
    entitlementRef: binding.entitlementRef,
    meteringRef: binding.meteringRef,
    capabilityRef: null,
    locationId: binding.locationId,
    quantity: 1,
    authority: Object.freeze({
      kind: "action-verification",
      verificationId: verification.verificationId,
      transactionId: verification.transactionId,
      planDigest: verification.planDigest,
      planRevision: verification.planRevision,
      operationId: verification.operationId,
      executionId: verification.executionId,
      attemptId: verification.attemptId,
      verificationRevision: verification.revision,
      afterObservationDigest: verification.afterObservationDigest,
    }),
    attribution: Object.freeze({
      publisherId: null,
      providerId: verification.providerId,
      modelId: null,
      nodeId: null,
      platformId: null,
    }),
  });

  return { ok: true, value: Object.freeze({ event, usage: parsedUsage.value.records[0]! }) };
}
