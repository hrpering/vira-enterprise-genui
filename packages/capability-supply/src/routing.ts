import {
  parseViraCapabilityExactReference,
  type ViraCapabilityExactReference,
} from "@vira-enterprise-genui/capability-contract";
import { isSemanticNamespace } from "@vira-enterprise-genui/protocol";
import type { ViraCapabilitySupplyLookup } from "./types.js";

export const VIRA_CAPABILITY_ROUTE_POLICY_VERSION = "1" as const;
export const VIRA_CAPABILITY_ROUTE_MAX_CANDIDATES = 16 as const;
export const VIRA_CAPABILITY_ROUTE_FAILOVER_REASONS = Object.freeze([
  "unavailable",
  "timeout",
  "rate-limited",
  "provider-error",
] as const);

export type ViraCapabilityRouteFailoverReason = (typeof VIRA_CAPABILITY_ROUTE_FAILOVER_REASONS)[number];

export interface ViraCapabilityRouteScopeEvidence {
  readonly version: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly environment: string;
}

export interface ViraCapabilityRouteProviderTrustEvidence {
  readonly trusted: true;
  readonly evidenceId: string;
  readonly connectionId: string;
  readonly providerId: string;
  readonly scope: ViraCapabilityRouteScopeEvidence;
  readonly validUntilEpochMs: number;
}

export interface ViraCapabilityRouteCommercialEvidence {
  readonly currency: string;
  readonly unitCostMicros: number;
}

export interface ViraCapabilityRouteCandidateEvidence {
  readonly bindingRef: ViraCapabilityExactReference;
  readonly trust: ViraCapabilityRouteProviderTrustEvidence;
  readonly availabilityBps: number;
  readonly p95LatencyMs: number;
  readonly commercial: ViraCapabilityRouteCommercialEvidence;
}

export interface ViraCapabilityRoutePolicy {
  readonly version: typeof VIRA_CAPABILITY_ROUTE_POLICY_VERSION;
  readonly capabilityRef: ViraCapabilityExactReference;
  readonly orderedBindingRefs: readonly ViraCapabilityExactReference[];
  readonly allowedLocationIds: readonly string[];
  readonly minAvailabilityBps: number;
  readonly maxP95LatencyMs: number;
  readonly currency: string;
  readonly maxUnitCostMicros: number;
  readonly allowedFailoverReasons: readonly ViraCapabilityRouteFailoverReason[];
}

export interface ViraCapabilityRoutePlanEntry {
  readonly bindingRef: ViraCapabilityExactReference;
  readonly providerId: string;
  readonly locationId: string | null;
  readonly trustEvidenceId: string;
  readonly connectionId: string;
  readonly trustValidUntilEpochMs: number;
  readonly availabilityBps: number;
  readonly p95LatencyMs: number;
  readonly commercial: ViraCapabilityRouteCommercialEvidence;
}

export interface ViraCapabilityRoutePlan {
  readonly version: typeof VIRA_CAPABILITY_ROUTE_POLICY_VERSION;
  readonly capabilityRef: ViraCapabilityExactReference;
  readonly scope: ViraCapabilityRouteScopeEvidence;
  readonly routes: readonly ViraCapabilityRoutePlanEntry[];
  readonly allowedFailoverReasons: readonly ViraCapabilityRouteFailoverReason[];
}

export type ViraCapabilityRouteIssueCode =
  | "INVALID_INPUT"
  | "INVALID_POLICY"
  | "INVALID_CAPABILITY"
  | "CAPABILITY_MISMATCH"
  | "ROUTE_LIMIT_EXCEEDED"
  | "DUPLICATE_ROUTE"
  | "UNDECLARED_SUPPLY"
  | "DUPLICATE_EVIDENCE"
  | "MISSING_EVIDENCE"
  | "PROVIDER_TRUST_MISMATCH"
  | "PROVIDER_TRUST_EXPIRED"
  | "SCOPE_MISMATCH"
  | "LOCATION_NOT_ALLOWED"
  | "SLA_NOT_MET"
  | "COMMERCIAL_CONSTRAINT_NOT_MET"
  | "FAILOVER_REASON_NOT_ALLOWED"
  | "CURRENT_ROUTE_NOT_FOUND"
  | "NO_FAILOVER_AVAILABLE";

export interface ViraCapabilityRouteIssue {
  readonly code: ViraCapabilityRouteIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCapabilityRoutePlanResult =
  | { readonly ok: true; readonly value: ViraCapabilityRoutePlan }
  | { readonly ok: false; readonly issue: ViraCapabilityRouteIssue };

export type ViraCapabilityRouteAdvanceResult =
  | { readonly ok: true; readonly value: ViraCapabilityRoutePlanEntry }
  | { readonly ok: false; readonly issue: ViraCapabilityRouteIssue };

type Plain = Record<string, unknown>;

function fail(code: ViraCapabilityRouteIssueCode, path: string, message: string): { readonly ok: false; readonly issue: ViraCapabilityRouteIssue } {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function plain(value: unknown): value is Plain {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Plain, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function safeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function exactRef(value: unknown): ViraCapabilityExactReference | null {
  const parsed = parseViraCapabilityExactReference(value);
  return parsed.ok ? parsed.value : null;
}

function sameRef(left: ViraCapabilityExactReference, right: ViraCapabilityExactReference): boolean {
  return left.id === right.id && left.version === right.version;
}

function refKey(ref: ViraCapabilityExactReference): string {
  return `${ref.id}\u0000${ref.version}`;
}

function scope(value: unknown): ViraCapabilityRouteScopeEvidence | null {
  if (!plain(value) || !exactKeys(value, ["version", "organizationId", "projectId", "environment"])) return null;
  if (
    typeof value.version !== "string"
    || typeof value.organizationId !== "string" || !isSemanticNamespace(value.organizationId)
    || typeof value.projectId !== "string" || !isSemanticNamespace(value.projectId)
    || typeof value.environment !== "string" || value.environment.length < 1 || value.environment.length > 128
  ) return null;
  return Object.freeze({
    version: value.version,
    organizationId: value.organizationId,
    projectId: value.projectId,
    environment: value.environment,
  });
}

function sameScope(left: ViraCapabilityRouteScopeEvidence, right: ViraCapabilityRouteScopeEvidence): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function currency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

function semanticList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) return null;
  const entries: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !isSemanticNamespace(entry) || seen.has(entry)) return null;
    seen.add(entry);
    entries.push(entry);
  }
  return Object.freeze(entries);
}

function failoverReasons(value: unknown): readonly ViraCapabilityRouteFailoverReason[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > VIRA_CAPABILITY_ROUTE_FAILOVER_REASONS.length) return null;
  const allowed = new Set<string>(VIRA_CAPABILITY_ROUTE_FAILOVER_REASONS);
  const seen = new Set<string>();
  const reasons: ViraCapabilityRouteFailoverReason[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !allowed.has(entry) || seen.has(entry)) return null;
    seen.add(entry);
    reasons.push(entry as ViraCapabilityRouteFailoverReason);
  }
  return Object.freeze(reasons);
}

function parsePolicy(value: unknown): ViraCapabilityRoutePolicy | null {
  if (!plain(value) || !exactKeys(value, [
    "version", "capabilityRef", "orderedBindingRefs", "allowedLocationIds", "minAvailabilityBps",
    "maxP95LatencyMs", "currency", "maxUnitCostMicros", "allowedFailoverReasons",
  ])) return null;
  if (value.version !== VIRA_CAPABILITY_ROUTE_POLICY_VERSION) return null;
  const capabilityRef = exactRef(value.capabilityRef);
  if (!capabilityRef) return null;
  if (!Array.isArray(value.orderedBindingRefs) || value.orderedBindingRefs.length < 1) return null;
  if (value.orderedBindingRefs.length > VIRA_CAPABILITY_ROUTE_MAX_CANDIDATES) return null;
  const orderedBindingRefs: ViraCapabilityExactReference[] = [];
  const seen = new Set<string>();
  for (const rawRef of value.orderedBindingRefs) {
    const bindingRef = exactRef(rawRef);
    if (!bindingRef || seen.has(refKey(bindingRef))) return null;
    seen.add(refKey(bindingRef));
    orderedBindingRefs.push(bindingRef);
  }
  const locations = semanticList(value.allowedLocationIds);
  const reasons = failoverReasons(value.allowedFailoverReasons);
  if (
    !locations || !reasons
    || !safeNonNegativeInteger(value.minAvailabilityBps) || value.minAvailabilityBps > 10_000
    || !positiveInteger(value.maxP95LatencyMs)
    || !currency(value.currency)
    || !safeNonNegativeInteger(value.maxUnitCostMicros)
  ) return null;
  return Object.freeze({
    version: VIRA_CAPABILITY_ROUTE_POLICY_VERSION,
    capabilityRef,
    orderedBindingRefs: Object.freeze(orderedBindingRefs),
    allowedLocationIds: locations,
    minAvailabilityBps: value.minAvailabilityBps,
    maxP95LatencyMs: value.maxP95LatencyMs,
    currency: value.currency,
    maxUnitCostMicros: value.maxUnitCostMicros,
    allowedFailoverReasons: reasons,
  });
}

function parseCandidateEvidence(value: unknown): ViraCapabilityRouteCandidateEvidence | null {
  if (!plain(value) || !exactKeys(value, ["bindingRef", "trust", "availabilityBps", "p95LatencyMs", "commercial"])) return null;
  const bindingRef = exactRef(value.bindingRef);
  if (!bindingRef || !plain(value.trust) || !exactKeys(value.trust, [
    "trusted", "evidenceId", "connectionId", "providerId", "scope", "validUntilEpochMs",
  ])) return null;
  const trustScope = scope(value.trust.scope);
  if (
    value.trust.trusted !== true
    || typeof value.trust.evidenceId !== "string" || !isSemanticNamespace(value.trust.evidenceId)
    || typeof value.trust.connectionId !== "string" || !isSemanticNamespace(value.trust.connectionId)
    || typeof value.trust.providerId !== "string" || !isSemanticNamespace(value.trust.providerId)
    || !trustScope
    || !positiveInteger(value.trust.validUntilEpochMs)
    || !safeNonNegativeInteger(value.availabilityBps) || value.availabilityBps > 10_000
    || !positiveInteger(value.p95LatencyMs)
    || !plain(value.commercial) || !exactKeys(value.commercial, ["currency", "unitCostMicros"])
    || !currency(value.commercial.currency)
    || !safeNonNegativeInteger(value.commercial.unitCostMicros)
  ) return null;
  return Object.freeze({
    bindingRef,
    trust: Object.freeze({
      trusted: true as const,
      evidenceId: value.trust.evidenceId,
      connectionId: value.trust.connectionId,
      providerId: value.trust.providerId,
      scope: trustScope,
      validUntilEpochMs: value.trust.validUntilEpochMs,
    }),
    availabilityBps: value.availabilityBps,
    p95LatencyMs: value.p95LatencyMs,
    commercial: Object.freeze({ currency: value.commercial.currency, unitCostMicros: value.commercial.unitCostMicros }),
  });
}

function lookupShape(value: unknown): value is ViraCapabilitySupplyLookup {
  return plain(value)
    && typeof value.capabilityId === "string"
    && typeof value.capabilityVersion === "string"
    && Array.isArray(value.supplies);
}

export function planViraCapabilitySupplyRoute(input: unknown): ViraCapabilityRoutePlanResult {
  if (!plain(input) || !exactKeys(input, ["lookup", "policy", "evidence", "nowEpochMs"])) {
    return fail("INVALID_INPUT", "$", "route planning input must be an exact object");
  }
  if (!lookupShape(input.lookup) || !positiveInteger(input.nowEpochMs) || !Array.isArray(input.evidence)) {
    return fail("INVALID_INPUT", "$", "route planning lookup, evidence, or clock is invalid");
  }
  const policy = parsePolicy(input.policy);
  if (!policy) return fail("INVALID_POLICY", "$.policy", "route policy is invalid or contains floating/duplicate references");
  if (input.lookup.capabilityId !== policy.capabilityRef.id || input.lookup.capabilityVersion !== policy.capabilityRef.version) {
    return fail("CAPABILITY_MISMATCH", "$.lookup", "supply lookup must match the exact routed Capability release");
  }
  if (policy.orderedBindingRefs.length > VIRA_CAPABILITY_ROUTE_MAX_CANDIDATES) {
    return fail("ROUTE_LIMIT_EXCEEDED", "$.policy.orderedBindingRefs", "route policy exceeds the candidate bound");
  }

  const supplies = new Map<string, ViraCapabilitySupplyLookup["supplies"][number]>();
  for (const supply of input.lookup.supplies) {
    const bindingRef = exactRef(supply?.binding?.bindingRef);
    const capabilityRef = exactRef(supply?.binding?.capabilityRef);
    if (!bindingRef || !capabilityRef || !sameRef(capabilityRef, policy.capabilityRef)) continue;
    supplies.set(refKey(bindingRef), supply);
  }

  const evidenceByBinding = new Map<string, ViraCapabilityRouteCandidateEvidence>();
  for (let index = 0; index < input.evidence.length; index += 1) {
    const evidence = parseCandidateEvidence(input.evidence[index]);
    if (!evidence) return fail("INVALID_INPUT", `$.evidence[${index}]`, "candidate route evidence is invalid");
    const key = refKey(evidence.bindingRef);
    if (evidenceByBinding.has(key)) return fail("DUPLICATE_EVIDENCE", `$.evidence[${index}].bindingRef`, "candidate evidence bindingRef is duplicated");
    evidenceByBinding.set(key, evidence);
  }

  const locationSet = new Set(policy.allowedLocationIds);
  const routes: ViraCapabilityRoutePlanEntry[] = [];
  let commonScope: ViraCapabilityRouteScopeEvidence | null = null;

  for (let index = 0; index < policy.orderedBindingRefs.length; index += 1) {
    const bindingRef = policy.orderedBindingRefs[index]!;
    const key = refKey(bindingRef);
    const supply = supplies.get(key);
    if (!supply) return fail("UNDECLARED_SUPPLY", `$.policy.orderedBindingRefs[${index}]`, "declared route binding does not exist in the exact supply lookup");
    const evidence = evidenceByBinding.get(key);
    if (!evidence) return fail("MISSING_EVIDENCE", `$.evidence`, "every declared route binding requires explicit trust/SLA/commercial evidence");
    if (supply.binding.providerId !== evidence.trust.providerId) {
      return fail("PROVIDER_TRUST_MISMATCH", `$.evidence[${index}].trust.providerId`, "provider trust evidence does not match the exact supply binding provider");
    }
    if (input.nowEpochMs >= evidence.trust.validUntilEpochMs) {
      return fail("PROVIDER_TRUST_EXPIRED", `$.evidence[${index}].trust.validUntilEpochMs`, "provider trust decision has expired");
    }
    if (commonScope === null) commonScope = evidence.trust.scope;
    else if (!sameScope(commonScope, evidence.trust.scope)) {
      return fail("SCOPE_MISMATCH", `$.evidence[${index}].trust.scope`, "all route candidates must be trusted for the same enterprise scope");
    }
    if (supply.binding.locationId === null || !locationSet.has(supply.binding.locationId)) {
      return fail("LOCATION_NOT_ALLOWED", `$.policy.allowedLocationIds`, "declared route binding location is outside the allowed location set");
    }
    if (evidence.availabilityBps < policy.minAvailabilityBps || evidence.p95LatencyMs > policy.maxP95LatencyMs) {
      return fail("SLA_NOT_MET", `$.evidence[${index}]`, "declared route binding does not satisfy the route SLA constraints");
    }
    if (evidence.commercial.currency !== policy.currency || evidence.commercial.unitCostMicros > policy.maxUnitCostMicros) {
      return fail("COMMERCIAL_CONSTRAINT_NOT_MET", `$.evidence[${index}].commercial`, "declared route binding does not satisfy the route commercial constraints");
    }
    routes.push(Object.freeze({
      bindingRef,
      providerId: supply.binding.providerId,
      locationId: supply.binding.locationId,
      trustEvidenceId: evidence.trust.evidenceId,
      connectionId: evidence.trust.connectionId,
      trustValidUntilEpochMs: evidence.trust.validUntilEpochMs,
      availabilityBps: evidence.availabilityBps,
      p95LatencyMs: evidence.p95LatencyMs,
      commercial: evidence.commercial,
    }));
  }

  if (commonScope === null || routes.length === 0) return fail("INVALID_POLICY", "$.policy.orderedBindingRefs", "route policy must declare at least one exact supply binding");
  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_CAPABILITY_ROUTE_POLICY_VERSION,
      capabilityRef: policy.capabilityRef,
      scope: commonScope,
      routes: Object.freeze(routes),
      allowedFailoverReasons: policy.allowedFailoverReasons,
    }),
  };
}

export function advanceViraCapabilitySupplyRoute(input: unknown): ViraCapabilityRouteAdvanceResult {
  if (!plain(input) || !exactKeys(input, ["plan", "currentBindingRef", "reason"])) {
    return fail("INVALID_INPUT", "$", "route advancement input must be an exact object");
  }
  const plan = input.plan as ViraCapabilityRoutePlan;
  const currentBindingRef = exactRef(input.currentBindingRef);
  if (!plain(plan) || plan.version !== VIRA_CAPABILITY_ROUTE_POLICY_VERSION || !Array.isArray(plan.routes) || !Array.isArray(plan.allowedFailoverReasons) || !currentBindingRef) {
    return fail("INVALID_INPUT", "$", "route plan or current binding reference is invalid");
  }
  if (typeof input.reason !== "string" || !(plan.allowedFailoverReasons as readonly string[]).includes(input.reason)) {
    return fail("FAILOVER_REASON_NOT_ALLOWED", "$.reason", "failover reason was not explicitly declared by the route policy");
  }
  const currentIndex = plan.routes.findIndex((entry) => sameRef(entry.bindingRef, currentBindingRef));
  if (currentIndex < 0) return fail("CURRENT_ROUTE_NOT_FOUND", "$.currentBindingRef", "current binding is not part of the explicit route plan");
  const next = plan.routes[currentIndex + 1];
  if (!next) return fail("NO_FAILOVER_AVAILABLE", "$.currentBindingRef", "no further explicitly declared route candidate exists");
  return { ok: true, value: next };
}
