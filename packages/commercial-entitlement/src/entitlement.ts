import {
  parseViraApplicationPackage,
  type ViraApplicationExactReference,
  type ViraApplicationPackage,
} from "@vira-enterprise-genui/application-package";
import {
  createViraEnterpriseContext,
  VIRA_ENTERPRISE_CONTEXT_VERSION,
  VIRA_ENTERPRISE_ENVIRONMENTS,
  VIRA_ENTERPRISE_PRINCIPAL_KINDS,
  type ViraEnterpriseEnvironmentName,
  type ViraEnterprisePrincipalKind,
} from "@vira-enterprise-genui/enterprise-context";
import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_COMMERCIAL_ACCESS_STATES,
  VIRA_COMMERCIAL_ENTITLEMENT_MAX_ENTITLEMENTS,
  VIRA_COMMERCIAL_ENTITLEMENT_MAX_LIMITS_PER_ENTITLEMENT,
  VIRA_COMMERCIAL_ENTITLEMENT_SCHEMA_VERSION,
  VIRA_COMMERCIAL_LIMIT_PERIODS,
  type ViraCommercialEntitlement,
  type ViraCommercialEntitlementDecision,
  type ViraCommercialEntitlementEvaluationResult,
  type ViraCommercialEntitlementIssue,
  type ViraCommercialEntitlementIssueCode,
  type ViraCommercialEntitlementLimit,
  type ViraCommercialEntitlementParseResult,
  type ViraCommercialEntitlementRequest,
  type ViraCommercialEntitlementSerializationResult,
  type ViraCommercialEntitlementSet,
  type ViraCommercialEntitlementSubject,
  type ViraCommercialEntitlementTarget,
  type ViraCommercialEntitlementScope,
  type ViraCommercialPrincipalSelector,
} from "./types.js";

const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const VERSION_REF = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const FLOATING_ALIASES = new Set(["latest", "current", "stable", "head", "main", "next"]);
const ENTERPRISE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;

const ROOT_FIELDS = ["schemaVersion", "entitlements"] as const;
const ENTITLEMENT_FIELDS = [
  "entitlementRef",
  "subject",
  "target",
  "scope",
  "planRef",
  "limits",
  "commercialAccess",
] as const;
const SUBJECT_FIELDS = ["organizationId", "principal"] as const;
const PRINCIPAL_FIELDS = ["kind", "id"] as const;
const TARGET_FIELDS = ["applicationId", "applicationVersion", "capabilityRef"] as const;
const SCOPE_FIELDS = ["projectId", "environment", "locationId"] as const;
const LIMIT_FIELDS = ["meteringRef", "quantity", "period"] as const;
const REFERENCE_FIELDS = ["id", "versionRef"] as const;
const REQUEST_FIELDS = [
  "application",
  "entitlementRef",
  "principal",
  "scope",
  "capabilityRef",
  "locationId",
] as const;
const ENTERPRISE_SCOPE_FIELDS = ["version", "organizationId", "projectId", "environment"] as const;

type Failure = { readonly ok: false; readonly issue: ViraCommercialEntitlementIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function failure(code: ViraCommercialEntitlementIssueCode, path: string, message: string): Failure {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function asObject(value: JsonValue | undefined): JsonObject | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function shapeIssue(
  object: JsonObject,
  allowed: readonly string[],
  required: readonly string[] = allowed,
): string | null {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(object)) if (!allowedSet.has(key)) return key;
  for (const key of required) if (!Object.hasOwn(object, key)) return key;
  return null;
}

function exactVersionRef(value: JsonValue | undefined): value is string {
  if (typeof value !== "string" || !VERSION_REF.test(value)) return false;
  const normalized = value.toLowerCase();
  if (FLOATING_ALIASES.has(normalized)) return false;
  return !/(?:^|[._:+-])[xX](?:$|[._:+-])/.test(value)
    && !/\d[xX](?:$|[._:+-])/.test(value);
}

function isFloatingVersionRef(value: JsonValue | undefined): boolean {
  if (typeof value !== "string" || !VERSION_REF.test(value)) return false;
  const normalized = value.toLowerCase();
  return FLOATING_ALIASES.has(normalized)
    || /(?:^|[._:+-])[xX](?:$|[._:+-])/.test(value)
    || /\d[xX](?:$|[._:+-])/.test(value);
}

function parseExactReference(value: JsonValue | undefined, path: string): Parsed<ViraApplicationExactReference> {
  const object = asObject(value);
  if (!object) return failure("INVALID_REFERENCE", path, "reference must be an exact object");
  const shape = shapeIssue(object, REFERENCE_FIELDS);
  if (shape) return failure("INVALID_REFERENCE", `${path}.${shape}`, "reference shape is invalid");
  if (typeof object.id !== "string" || !isSemanticNamespace(object.id)) {
    return failure("INVALID_REFERENCE", `${path}.id`, "reference id must be a canonical semantic namespace");
  }
  if (!exactVersionRef(object.versionRef)) {
    return failure(
      isFloatingVersionRef(object.versionRef) ? "FLOATING_REFERENCE" : "INVALID_REFERENCE",
      `${path}.versionRef`,
      "reference version must be exact and must not use a floating alias or range",
    );
  }
  return { ok: true, value: Object.freeze({ id: object.id, versionRef: object.versionRef }) };
}

function sameReference(left: ViraApplicationExactReference, right: ViraApplicationExactReference): boolean {
  return left.id === right.id && left.versionRef === right.versionRef;
}

function referenceKey(reference: ViraApplicationExactReference | null): string {
  return reference === null ? "" : `${reference.id}\u0000${reference.versionRef}`;
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function parsePrincipalSelector(value: JsonValue | undefined, path: string): Parsed<ViraCommercialPrincipalSelector | null> {
  if (value === null) return { ok: true, value: null };
  const object = asObject(value);
  if (!object) return failure("INVALID_SUBJECT", path, "principal selector must be null or an exact object");
  const shape = shapeIssue(object, PRINCIPAL_FIELDS);
  if (shape) return failure("INVALID_SUBJECT", `${path}.${shape}`, "principal selector shape is invalid");
  if (
    typeof object.kind !== "string"
    || !VIRA_ENTERPRISE_PRINCIPAL_KINDS.includes(object.kind as ViraEnterprisePrincipalKind)
  ) {
    return failure("INVALID_SUBJECT", `${path}.kind`, "principal kind is invalid");
  }
  if (typeof object.id !== "string" || !PRINCIPAL_ID.test(object.id)) {
    return failure("INVALID_SUBJECT", `${path}.id`, "principal id is invalid");
  }
  return {
    ok: true,
    value: Object.freeze({ kind: object.kind as ViraEnterprisePrincipalKind, id: object.id }),
  };
}

function parseSubject(value: JsonValue | undefined, path: string): Parsed<ViraCommercialEntitlementSubject> {
  const object = asObject(value);
  if (!object) return failure("INVALID_SUBJECT", path, "subject must be an exact object");
  const shape = shapeIssue(object, SUBJECT_FIELDS);
  if (shape) return failure("INVALID_SUBJECT", `${path}.${shape}`, "subject shape is invalid");
  if (typeof object.organizationId !== "string" || !ENTERPRISE_ID.test(object.organizationId)) {
    return failure("INVALID_SUBJECT", `${path}.organizationId`, "organizationId is invalid");
  }
  const principal = parsePrincipalSelector(object.principal, `${path}.principal`);
  if (!principal.ok) return principal;
  return {
    ok: true,
    value: Object.freeze({ organizationId: object.organizationId, principal: principal.value }),
  };
}

function parseTarget(value: JsonValue | undefined, path: string): Parsed<ViraCommercialEntitlementTarget> {
  const object = asObject(value);
  if (!object) return failure("INVALID_TARGET", path, "target must be an exact object");
  const shape = shapeIssue(object, TARGET_FIELDS);
  if (shape) return failure("INVALID_TARGET", `${path}.${shape}`, "target shape is invalid");
  if (typeof object.applicationId !== "string" || !isSemanticNamespace(object.applicationId)) {
    return failure("INVALID_TARGET", `${path}.applicationId`, "applicationId must be a canonical semantic namespace");
  }
  if (
    typeof object.applicationVersion !== "string"
    || object.applicationVersion.length > 64
    || !RELEASE_VERSION.test(object.applicationVersion)
  ) {
    return failure("INVALID_TARGET", `${path}.applicationVersion`, "applicationVersion must be an exact release semver");
  }
  let capabilityRef: ViraApplicationExactReference | null = null;
  if (object.capabilityRef !== null) {
    const parsed = parseExactReference(object.capabilityRef, `${path}.capabilityRef`);
    if (!parsed.ok) return parsed;
    capabilityRef = parsed.value;
  }
  return {
    ok: true,
    value: Object.freeze({
      applicationId: object.applicationId,
      applicationVersion: object.applicationVersion,
      capabilityRef,
    }),
  };
}

function parseScopeSelector(value: JsonValue | undefined, path: string): Parsed<ViraCommercialEntitlementScope> {
  const object = asObject(value);
  if (!object) return failure("INVALID_SCOPE", path, "scope must be an exact object");
  const shape = shapeIssue(object, SCOPE_FIELDS);
  if (shape) return failure("INVALID_SCOPE", `${path}.${shape}`, "scope shape is invalid");

  if (object.projectId !== null && (typeof object.projectId !== "string" || !ENTERPRISE_ID.test(object.projectId))) {
    return failure("INVALID_SCOPE", `${path}.projectId`, "projectId must be null or a canonical enterprise id");
  }
  if (
    object.environment !== null
    && (
      typeof object.environment !== "string"
      || !VIRA_ENTERPRISE_ENVIRONMENTS.includes(object.environment as ViraEnterpriseEnvironmentName)
    )
  ) {
    return failure("INVALID_SCOPE", `${path}.environment`, "environment must be null or a canonical enterprise environment");
  }
  if (object.environment !== null && object.projectId === null) {
    return failure("INVALID_SCOPE", `${path}.environment`, "environment scope requires an exact projectId");
  }
  if (
    object.locationId !== null
    && (typeof object.locationId !== "string" || !isSemanticNamespace(object.locationId))
  ) {
    return failure("INVALID_SCOPE", `${path}.locationId`, "locationId must be null or a canonical semantic namespace");
  }

  return {
    ok: true,
    value: Object.freeze({
      projectId: object.projectId as string | null,
      environment: object.environment as ViraEnterpriseEnvironmentName | null,
      locationId: object.locationId as string | null,
    }),
  };
}

function parseLimits(value: JsonValue | undefined, path: string): Parsed<readonly ViraCommercialEntitlementLimit[]> {
  if (!Array.isArray(value)) return failure("INVALID_LIMIT", path, "limits must be an array");
  if (value.length > VIRA_COMMERCIAL_ENTITLEMENT_MAX_LIMITS_PER_ENTITLEMENT) {
    return failure(
      "LIMIT_EXCEEDED",
      path,
      `limit declaration count exceeds ${VIRA_COMMERCIAL_ENTITLEMENT_MAX_LIMITS_PER_ENTITLEMENT}`,
    );
  }

  const limits: ViraCommercialEntitlementLimit[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const itemPath = `${path}[${index}]`;
    const object = asObject(value[index] as JsonValue);
    if (!object) return failure("INVALID_LIMIT", itemPath, "limit must be an exact object");
    const shape = shapeIssue(object, LIMIT_FIELDS);
    if (shape) return failure("INVALID_LIMIT", `${itemPath}.${shape}`, "limit shape is invalid");
    const meteringRef = parseExactReference(object.meteringRef, `${itemPath}.meteringRef`);
    if (!meteringRef.ok) return meteringRef;
    if (
      typeof object.quantity !== "number"
      || !Number.isSafeInteger(object.quantity)
      || object.quantity <= 0
    ) {
      return failure("INVALID_LIMIT", `${itemPath}.quantity`, "limit quantity must be a positive safe integer");
    }
    if (
      typeof object.period !== "string"
      || !VIRA_COMMERCIAL_LIMIT_PERIODS.includes(object.period as ViraCommercialEntitlementLimit["period"])
    ) {
      return failure("INVALID_LIMIT", `${itemPath}.period`, "limit period is invalid");
    }
    const key = `${referenceKey(meteringRef.value)}\u0000${object.period}`;
    if (seen.has(key)) return failure("INVALID_LIMIT", itemPath, "duplicate meteringRef and period limit");
    seen.add(key);
    limits.push(Object.freeze({
      meteringRef: meteringRef.value,
      quantity: object.quantity,
      period: object.period as ViraCommercialEntitlementLimit["period"],
    }));
  }

  limits.sort((left, right) => {
    const ref = compareText(referenceKey(left.meteringRef), referenceKey(right.meteringRef));
    return ref !== 0 ? ref : compareText(left.period, right.period);
  });
  return { ok: true, value: Object.freeze(limits) };
}

function selectorKey(entitlement: ViraCommercialEntitlement): string {
  return JSON.stringify([
    entitlement.entitlementRef.id,
    entitlement.entitlementRef.versionRef,
    entitlement.subject.organizationId,
    entitlement.subject.principal?.kind ?? null,
    entitlement.subject.principal?.id ?? null,
    entitlement.target.applicationId,
    entitlement.target.applicationVersion,
    entitlement.target.capabilityRef?.id ?? null,
    entitlement.target.capabilityRef?.versionRef ?? null,
    entitlement.scope.projectId,
    entitlement.scope.environment,
    entitlement.scope.locationId,
  ]);
}

function parseEntitlement(value: JsonValue, path: string): Parsed<ViraCommercialEntitlement> {
  const object = asObject(value);
  if (!object) return failure("INVALID_ENTITLEMENT", path, "entitlement must be an exact object");
  const shape = shapeIssue(object, ENTITLEMENT_FIELDS);
  if (shape) return failure("UNKNOWN_FIELD", `${path}.${shape}`, "entitlement shape is invalid");

  const entitlementRef = parseExactReference(object.entitlementRef, `${path}.entitlementRef`);
  if (!entitlementRef.ok) return entitlementRef;
  const subject = parseSubject(object.subject, `${path}.subject`);
  if (!subject.ok) return subject;
  const target = parseTarget(object.target, `${path}.target`);
  if (!target.ok) return target;
  const scope = parseScopeSelector(object.scope, `${path}.scope`);
  if (!scope.ok) return scope;
  const planRef = parseExactReference(object.planRef, `${path}.planRef`);
  if (!planRef.ok) {
    return failure(
      planRef.issue.code === "FLOATING_REFERENCE" ? "FLOATING_REFERENCE" : "INVALID_PLAN",
      planRef.issue.path,
      "planRef must be an exact non-floating reference",
    );
  }
  const limits = parseLimits(object.limits, `${path}.limits`);
  if (!limits.ok) return limits;
  if (
    typeof object.commercialAccess !== "string"
    || !VIRA_COMMERCIAL_ACCESS_STATES.includes(object.commercialAccess as ViraCommercialEntitlement["commercialAccess"])
  ) {
    return failure("INVALID_COMMERCIAL_ACCESS", `${path}.commercialAccess`, "commercialAccess must be enabled or disabled");
  }

  return {
    ok: true,
    value: Object.freeze({
      entitlementRef: entitlementRef.value,
      subject: subject.value,
      target: target.value,
      scope: scope.value,
      planRef: planRef.value,
      limits: limits.value,
      commercialAccess: object.commercialAccess as ViraCommercialEntitlement["commercialAccess"],
    }),
  };
}

export function parseViraCommercialEntitlementSet(input: unknown): ViraCommercialEntitlementParseResult {
  const json = parseJsonValue(input);
  if (!json.ok) return failure("INVALID_INPUT", json.issue.path, json.issue.reason);
  const root = asObject(json.value);
  if (!root) return failure("INVALID_INPUT", "$", "entitlement set must be an exact object");
  const shape = shapeIssue(root, ROOT_FIELDS);
  if (shape) return failure("UNKNOWN_FIELD", `$.${shape}`, "entitlement set shape is invalid");
  if (root.schemaVersion !== VIRA_COMMERCIAL_ENTITLEMENT_SCHEMA_VERSION) {
    return failure(
      "INVALID_SCHEMA_VERSION",
      "$.schemaVersion",
      `schemaVersion must be ${VIRA_COMMERCIAL_ENTITLEMENT_SCHEMA_VERSION}`,
    );
  }
  if (!Array.isArray(root.entitlements)) {
    return failure("INVALID_ENTITLEMENT", "$.entitlements", "entitlements must be an array");
  }
  if (root.entitlements.length > VIRA_COMMERCIAL_ENTITLEMENT_MAX_ENTITLEMENTS) {
    return failure(
      "ENTITLEMENT_LIMIT_EXCEEDED",
      "$.entitlements",
      `entitlement count exceeds ${VIRA_COMMERCIAL_ENTITLEMENT_MAX_ENTITLEMENTS}`,
    );
  }

  const entitlements: ViraCommercialEntitlement[] = [];
  const selectors = new Set<string>();
  for (let index = 0; index < root.entitlements.length; index += 1) {
    const parsed = parseEntitlement(root.entitlements[index] as JsonValue, `$.entitlements[${index}]`);
    if (!parsed.ok) return parsed;
    const key = selectorKey(parsed.value);
    if (selectors.has(key)) {
      return failure(
        "DUPLICATE_ENTITLEMENT",
        `$.entitlements[${index}]`,
        "duplicate exact commercial entitlement selector",
      );
    }
    selectors.add(key);
    entitlements.push(parsed.value);
  }

  entitlements.sort((left, right) => compareText(selectorKey(left), selectorKey(right)));
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: VIRA_COMMERCIAL_ENTITLEMENT_SCHEMA_VERSION,
      entitlements: Object.freeze(entitlements),
    }),
  };
}

export function serializeViraCommercialEntitlementSet(input: unknown): ViraCommercialEntitlementSerializationResult {
  const parsed = parseViraCommercialEntitlementSet(input);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: JSON.stringify(parsed.value),
    entitlementSet: parsed.value,
  };
}

function parseRequest(input: unknown): Parsed<ViraCommercialEntitlementRequest> {
  const json = parseJsonValue(input, "$request");
  if (!json.ok) return failure("INVALID_REQUEST", json.issue.path, json.issue.reason);
  const root = asObject(json.value);
  if (!root) return failure("INVALID_REQUEST", "$request", "request must be an exact object");
  const shape = shapeIssue(root, REQUEST_FIELDS);
  if (shape) return failure("INVALID_REQUEST", `$request.${shape}`, "request shape is invalid");

  const application = parseViraApplicationPackage(root.application);
  if (!application.ok) {
    return failure(
      "INVALID_REQUEST",
      "$request.application",
      `application package is invalid: ${application.issue.code}`,
    );
  }

  const entitlementRef = parseExactReference(root.entitlementRef, "$request.entitlementRef");
  if (!entitlementRef.ok) return entitlementRef;
  if (!application.value.commercial.entitlementRefs.some((ref) => sameReference(ref, entitlementRef.value))) {
    return failure(
      "UNDECLARED_ENTITLEMENT",
      "$request.entitlementRef",
      "entitlementRef is not declared by the exact Application package",
    );
  }

  let capabilityRef: ViraApplicationExactReference | null = null;
  if (root.capabilityRef !== null) {
    const parsedCapability = parseExactReference(root.capabilityRef, "$request.capabilityRef");
    if (!parsedCapability.ok) return parsedCapability;
    if (!application.value.capabilities.some((ref) => sameReference(ref, parsedCapability.value))) {
      return failure(
        "UNDECLARED_CAPABILITY",
        "$request.capabilityRef",
        "capabilityRef is not declared by the exact Application package",
      );
    }
    capabilityRef = parsedCapability.value;
  }

  const scopeObject = asObject(root.scope);
  if (!scopeObject) return failure("INVALID_REQUEST", "$request.scope", "scope must be an exact enterprise scope");
  const scopeShape = shapeIssue(scopeObject, ENTERPRISE_SCOPE_FIELDS);
  if (scopeShape) return failure("INVALID_REQUEST", `$request.scope.${scopeShape}`, "enterprise scope shape is invalid");
  if (scopeObject.version !== VIRA_ENTERPRISE_CONTEXT_VERSION) {
    return failure("INVALID_REQUEST", "$request.scope.version", "enterprise scope version is invalid");
  }
  if (
    typeof scopeObject.organizationId !== "string"
    || typeof scopeObject.projectId !== "string"
    || typeof scopeObject.environment !== "string"
    || !VIRA_ENTERPRISE_ENVIRONMENTS.includes(scopeObject.environment as ViraEnterpriseEnvironmentName)
  ) {
    return failure("INVALID_REQUEST", "$request.scope", "enterprise scope values are invalid");
  }

  const enterprise = createViraEnterpriseContext({
    organizationId: scopeObject.organizationId,
    projectId: scopeObject.projectId,
    environments: [scopeObject.environment],
  });
  if (!enterprise.ok) return failure("INVALID_REQUEST", "$request.scope", enterprise.issue.message);
  const scope = enterprise.value.scope(scopeObject.environment as ViraEnterpriseEnvironmentName);
  if (!scope.ok) return failure("INVALID_REQUEST", "$request.scope", scope.issue.message);
  const principal = enterprise.value.principal(root.principal);
  if (!principal.ok) return failure("INVALID_REQUEST", "$request.principal", principal.issue.message);

  if (root.locationId !== null && (typeof root.locationId !== "string" || !isSemanticNamespace(root.locationId))) {
    return failure("INVALID_REQUEST", "$request.locationId", "locationId must be null or a canonical semantic namespace");
  }

  return {
    ok: true,
    value: Object.freeze({
      application: application.value,
      entitlementRef: entitlementRef.value,
      principal: principal.value,
      scope: scope.value,
      capabilityRef,
      locationId: root.locationId as string | null,
    }),
  };
}

function principalMatches(entitlement: ViraCommercialEntitlement, request: ViraCommercialEntitlementRequest): boolean {
  const selector = entitlement.subject.principal;
  return entitlement.subject.organizationId === request.principal.organizationId
    && (selector === null || (selector.kind === request.principal.kind && selector.id === request.principal.id));
}

function targetMatches(entitlement: ViraCommercialEntitlement, request: ViraCommercialEntitlementRequest): boolean {
  if (
    entitlement.target.applicationId !== request.application.identity.id
    || entitlement.target.applicationVersion !== request.application.version
  ) return false;
  const capability = entitlement.target.capabilityRef;
  return capability === null
    || (request.capabilityRef !== null && sameReference(capability, request.capabilityRef));
}

function scopeMatches(entitlement: ViraCommercialEntitlement, request: ViraCommercialEntitlementRequest): boolean {
  const selector = entitlement.scope;
  if (selector.projectId !== null && selector.projectId !== request.scope.projectId) return false;
  if (selector.environment !== null && selector.environment !== request.scope.environment) return false;
  if (selector.locationId !== null && selector.locationId !== request.locationId) return false;
  return true;
}

function matches(entitlement: ViraCommercialEntitlement, request: ViraCommercialEntitlementRequest): boolean {
  return sameReference(entitlement.entitlementRef, request.entitlementRef)
    && principalMatches(entitlement, request)
    && targetMatches(entitlement, request)
    && scopeMatches(entitlement, request);
}

function validateMatchedMetering(
  entitlement: ViraCommercialEntitlement,
  application: ViraApplicationPackage,
): Failure | null {
  for (let index = 0; index < entitlement.limits.length; index += 1) {
    const limit = entitlement.limits[index]!;
    if (!application.commercial.meteringRefs.some((ref) => sameReference(ref, limit.meteringRef))) {
      return failure(
        "UNDECLARED_METERING",
        `$.matchedEntitlement.limits[${index}].meteringRef`,
        "limit meteringRef is not declared by the exact Application package",
      );
    }
  }
  return null;
}

function decision(
  request: ViraCommercialEntitlementRequest,
  matchedEntitlement: ViraCommercialEntitlement | null,
): ViraCommercialEntitlementDecision {
  if (matchedEntitlement === null) {
    return Object.freeze({
      decision: "not-entitled",
      reason: "NO_MATCH",
      entitlementRef: request.entitlementRef,
      matchedEntitlement: null,
      planRef: null,
      limits: Object.freeze([]),
    });
  }
  const enabled = matchedEntitlement.commercialAccess === "enabled";
  return Object.freeze({
    decision: enabled ? "entitled" : "not-entitled",
    reason: enabled ? "MATCHED" : "COMMERCIAL_ACCESS_DISABLED",
    entitlementRef: request.entitlementRef,
    matchedEntitlement,
    planRef: matchedEntitlement.planRef,
    limits: matchedEntitlement.limits,
  });
}

export function evaluateViraCommercialEntitlement(
  entitlementSetInput: unknown,
  requestInput: unknown,
): ViraCommercialEntitlementEvaluationResult {
  const entitlementSet = parseViraCommercialEntitlementSet(entitlementSetInput);
  if (!entitlementSet.ok) return entitlementSet;
  const request = parseRequest(requestInput);
  if (!request.ok) return request;

  const candidates = entitlementSet.value.entitlements.filter((entitlement) => matches(entitlement, request.value));
  if (candidates.length > 1) {
    return failure(
      "AMBIGUOUS_ENTITLEMENT",
      "$.entitlements",
      "multiple commercial entitlements match and no priority or specificity winner is permitted",
    );
  }
  const matched = candidates[0] ?? null;
  if (matched !== null) {
    const meteringIssue = validateMatchedMetering(matched, request.value.application);
    if (meteringIssue) return meteringIssue;
  }
  return { ok: true, value: decision(request.value, matched) };
}
