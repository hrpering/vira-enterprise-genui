import { createViraEnterpriseContext } from "./context.js";
import {
  type ViraEnterprisePrincipal,
  type ViraEnterpriseScope,
} from "./types.js";

export const VIRA_IDENTITY_DELEGATION_VERSION = "1" as const;
export const VIRA_DELEGATION_MAX_DEPTH = 8 as const;

export interface ViraVerifiedExternalIdentity {
  readonly version: typeof VIRA_IDENTITY_DELEGATION_VERSION;
  readonly issuer: string;
  readonly subject: string;
  readonly audience: readonly string[];
  readonly expiresAt: number;
  readonly issuedAt?: number;
  readonly authorizedParty?: string;
}

export interface ViraIdentityMembership {
  readonly version: typeof VIRA_IDENTITY_DELEGATION_VERSION;
  readonly membershipId: string;
  readonly identityIssuer: string;
  readonly identitySubject: string;
  readonly principal: ViraEnterprisePrincipal;
  readonly scope: ViraEnterpriseScope;
  readonly revision: number;
  readonly active: boolean;
  readonly expiresAt?: number;
}

export interface ViraDelegationGrant {
  readonly version: typeof VIRA_IDENTITY_DELEGATION_VERSION;
  readonly grantId: string;
  readonly scope: ViraEnterpriseScope;
  readonly delegator: ViraEnterprisePrincipal;
  readonly delegate: ViraEnterprisePrincipal;
  readonly audience: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly parentGrantId?: string;
  readonly revokedAt?: number;
}

export type ViraIdentityDelegationIssueCode =
  | "INVALID_IDENTITY"
  | "INVALID_MEMBERSHIP"
  | "STALE_MEMBERSHIP"
  | "INACTIVE_MEMBERSHIP"
  | "IDENTITY_MISMATCH"
  | "SCOPE_MISMATCH"
  | "EXPIRED_MEMBERSHIP"
  | "INVALID_DELEGATION"
  | "DELEGATION_TOO_DEEP"
  | "DELEGATION_CYCLE"
  | "DELEGATION_PARENT_MISMATCH"
  | "DELEGATION_PRINCIPAL_MISMATCH"
  | "DELEGATION_AUDIENCE_MISMATCH"
  | "DELEGATION_EXPIRED"
  | "DELEGATION_REVOKED";

export interface ViraIdentityDelegationIssue {
  readonly code: ViraIdentityDelegationIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraIdentityDelegationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraIdentityDelegationIssue };

export interface ViraAuthorizedMembership {
  readonly principal: ViraEnterprisePrincipal;
  readonly scope: ViraEnterpriseScope;
  readonly membershipId: string;
  readonly membershipRevision: number;
}

export interface ViraDelegationResolution {
  readonly principal: ViraEnterprisePrincipal;
  readonly scope: ViraEnterpriseScope;
  readonly audience: string;
  readonly grantIds: readonly string[];
}

const membershipIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const grantIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;

function issue(code: ViraIdentityDelegationIssueCode, path: string, message: string): ViraIdentityDelegationIssue {
  return Object.freeze({ code, path, message });
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function membershipShape(value: unknown): value is ViraIdentityMembership {
  return record(value)
    && value.version === VIRA_IDENTITY_DELEGATION_VERSION
    && typeof value.membershipId === "string"
    && typeof value.identityIssuer === "string"
    && typeof value.identitySubject === "string"
    && record(value.principal)
    && record(value.scope)
    && typeof value.revision === "number"
    && typeof value.active === "boolean"
    && (value.expiresAt === undefined || typeof value.expiresAt === "number");
}

function identityShape(value: unknown): value is ViraVerifiedExternalIdentity {
  return record(value)
    && value.version === VIRA_IDENTITY_DELEGATION_VERSION
    && typeof value.issuer === "string"
    && typeof value.subject === "string"
    && Array.isArray(value.audience)
    && value.audience.length > 0
    && value.audience.length <= 16
    && value.audience.every((audience) => typeof audience === "string" && audience.length > 0 && audience.length <= 256)
    && typeof value.expiresAt === "number"
    && (value.issuedAt === undefined || typeof value.issuedAt === "number")
    && (value.authorizedParty === undefined || typeof value.authorizedParty === "string");
}

function grantShape(value: unknown): value is ViraDelegationGrant {
  return record(value)
    && value.version === VIRA_IDENTITY_DELEGATION_VERSION
    && typeof value.grantId === "string"
    && record(value.scope)
    && record(value.delegator)
    && record(value.delegate)
    && typeof value.audience === "string"
    && typeof value.issuedAt === "number"
    && typeof value.expiresAt === "number"
    && (value.parentGrantId === undefined || typeof value.parentGrantId === "string")
    && (value.revokedAt === undefined || typeof value.revokedAt === "number");
}

function canonicalMembership(membership: ViraIdentityMembership): ViraIdentityDelegationResult<ViraAuthorizedMembership> {
  if (
    membership.version !== VIRA_IDENTITY_DELEGATION_VERSION
    || !membershipIdPattern.test(membership.membershipId)
    || membership.identityIssuer.length < 1
    || membership.identityIssuer.length > 2048
    || membership.identitySubject.length < 1
    || membership.identitySubject.length > 512
    || !Number.isSafeInteger(membership.revision)
    || membership.revision < 1
  ) {
    return { ok: false, issue: issue("INVALID_MEMBERSHIP", "$.membership", "identity membership is invalid") };
  }
  const context = createViraEnterpriseContext({
    organizationId: membership.scope.organizationId,
    projectId: membership.scope.projectId,
    environments: [membership.scope.environment],
  });
  if (!context.ok) return { ok: false, issue: issue("INVALID_MEMBERSHIP", "$.membership.scope", "membership scope is invalid") };
  const scope = context.value.scope(membership.scope.environment);
  if (!scope.ok || !exactScope(scope.value, membership.scope)) {
    return { ok: false, issue: issue("INVALID_MEMBERSHIP", "$.membership.scope", "membership scope is not canonical") };
  }
  const principal = context.value.principal(membership.principal);
  if (!principal.ok) return { ok: false, issue: issue("INVALID_MEMBERSHIP", "$.membership.principal", "membership principal is invalid") };
  return {
    ok: true,
    value: Object.freeze({
      principal: principal.value,
      scope: scope.value,
      membershipId: membership.membershipId,
      membershipRevision: membership.revision,
    }),
  };
}

export function authorizeIdentityMembership(input: unknown): ViraIdentityDelegationResult<ViraAuthorizedMembership> {
  if (!record(input) || !identityShape(input.identity) || !membershipShape(input.membership) || !record(input.requestedScope)) {
    return { ok: false, issue: issue("INVALID_IDENTITY", "$", "identity authorization input is invalid") };
  }
  if (input.nowEpochSeconds !== undefined && (typeof input.nowEpochSeconds !== "number" || !Number.isSafeInteger(input.nowEpochSeconds) || input.nowEpochSeconds < 0)) {
    return { ok: false, issue: issue("INVALID_IDENTITY", "$.nowEpochSeconds", "identity authorization time is invalid") };
  }
  if (input.sessionMembershipRevision !== undefined && (typeof input.sessionMembershipRevision !== "number" || !Number.isSafeInteger(input.sessionMembershipRevision) || input.sessionMembershipRevision < 1)) {
    return { ok: false, issue: issue("INVALID_MEMBERSHIP", "$.sessionMembershipRevision", "session membership revision is invalid") };
  }
  const identity = input.identity;
  const membershipInput = input.membership;
  const requestedScope = input.requestedScope as unknown as ViraEnterpriseScope;
  const now = (input.nowEpochSeconds as number | undefined) ?? Math.floor(Date.now() / 1000);
  if (
    identity.issuer.length < 1
    || identity.issuer.length > 2048
    || identity.subject.length < 1
    || identity.subject.length > 512
    || !Number.isSafeInteger(identity.expiresAt)
    || identity.expiresAt <= now
    || (identity.issuedAt !== undefined && (!Number.isSafeInteger(identity.issuedAt) || identity.issuedAt > now))
  ) {
    return { ok: false, issue: issue("INVALID_IDENTITY", "$.identity", "verified external identity is invalid or expired") };
  }
  const membership = canonicalMembership(membershipInput);
  if (!membership.ok) return membership;
  if (!membershipInput.active) return { ok: false, issue: issue("INACTIVE_MEMBERSHIP", "$.membership.active", "membership is inactive") };
  if (membershipInput.identityIssuer !== identity.issuer || membershipInput.identitySubject !== identity.subject) {
    return { ok: false, issue: issue("IDENTITY_MISMATCH", "$.membership", "membership does not belong to the verified identity") };
  }
  if (!exactScope(membership.value.scope, requestedScope)) {
    return { ok: false, issue: issue("SCOPE_MISMATCH", "$.requestedScope", "membership does not authorize the exact requested scope") };
  }
  if (membershipInput.expiresAt !== undefined && (!Number.isSafeInteger(membershipInput.expiresAt) || membershipInput.expiresAt <= now)) {
    return { ok: false, issue: issue("EXPIRED_MEMBERSHIP", "$.membership.expiresAt", "membership has expired") };
  }
  if (input.sessionMembershipRevision !== undefined && input.sessionMembershipRevision !== membership.value.membershipRevision) {
    return { ok: false, issue: issue("STALE_MEMBERSHIP", "$.sessionMembershipRevision", "session membership revision is stale") };
  }
  return membership;
}

function validGrant(grant: ViraDelegationGrant): boolean {
  return grant.version === VIRA_IDENTITY_DELEGATION_VERSION
    && grantIdPattern.test(grant.grantId)
    && typeof grant.audience === "string"
    && grant.audience.length > 0
    && grant.audience.length <= 256
    && Number.isSafeInteger(grant.issuedAt)
    && Number.isSafeInteger(grant.expiresAt)
    && grant.expiresAt > grant.issuedAt
    && (grant.revokedAt === undefined || Number.isSafeInteger(grant.revokedAt));
}

export function resolveDelegationChain(input: unknown): ViraIdentityDelegationResult<ViraDelegationResolution> {
  if (
    !record(input)
    || !record(input.authenticatedPrincipal)
    || !record(input.requestedPrincipal)
    || !record(input.scope)
    || typeof input.audience !== "string"
    || input.audience.length < 1
    || input.audience.length > 256
    || !Array.isArray(input.grants)
    || !input.grants.every(grantShape)
    || (input.revokedGrantIds !== undefined && (!Array.isArray(input.revokedGrantIds) || !input.revokedGrantIds.every((id) => typeof id === "string" && grantIdPattern.test(id))))
    || (input.nowEpochSeconds !== undefined && (typeof input.nowEpochSeconds !== "number" || !Number.isSafeInteger(input.nowEpochSeconds) || input.nowEpochSeconds < 0))
  ) {
    return { ok: false, issue: issue("INVALID_DELEGATION", "$", "delegation input is invalid") };
  }
  const grants = input.grants as readonly ViraDelegationGrant[];
  if (grants.length > VIRA_DELEGATION_MAX_DEPTH) {
    return { ok: false, issue: issue("DELEGATION_TOO_DEEP", "$.grants", "delegation chain exceeds the maximum depth") };
  }
  const scopeInput = input.scope as unknown as ViraEnterpriseScope;
  const authenticatedPrincipal = input.authenticatedPrincipal as unknown as ViraEnterprisePrincipal;
  const requestedPrincipal = input.requestedPrincipal as unknown as ViraEnterprisePrincipal;
  const audience = input.audience;
  const now = (input.nowEpochSeconds as number | undefined) ?? Math.floor(Date.now() / 1000);
  const context = createViraEnterpriseContext({
    organizationId: scopeInput.organizationId,
    projectId: scopeInput.projectId,
    environments: [scopeInput.environment],
  });
  if (!context.ok) return { ok: false, issue: issue("INVALID_DELEGATION", "$.scope", "delegation scope is invalid") };
  const scope = context.value.scope(scopeInput.environment);
  const authenticated = context.value.principal(authenticatedPrincipal);
  const requested = context.value.principal(requestedPrincipal);
  if (!scope.ok || !authenticated.ok || !requested.ok || !exactScope(scope.value, scopeInput)) {
    return { ok: false, issue: issue("INVALID_DELEGATION", "$", "delegation scope or principals are invalid") };
  }
  if (exactPrincipal(authenticated.value, requested.value)) {
    if (grants.length !== 0) {
      return { ok: false, issue: issue("INVALID_DELEGATION", "$.grants", "self authorization must not carry delegation grants") };
    }
    return {
      ok: true,
      value: Object.freeze({
        principal: requested.value,
        scope: scope.value,
        audience,
        grantIds: Object.freeze([]),
      }),
    };
  }
  if (grants.length === 0) {
    return { ok: false, issue: issue("DELEGATION_PRINCIPAL_MISMATCH", "$.grants", "requested principal requires a delegation chain") };
  }
  const revoked = new Set(input.revokedGrantIds as readonly string[] | undefined ?? []);
  const seen = new Set<string>();
  let current = authenticated.value;
  let previousGrantId: string | undefined;
  const grantIds: string[] = [];
  for (let index = 0; index < grants.length; index += 1) {
    const grant = grants[index];
    if (!grant || !validGrant(grant)) return { ok: false, issue: issue("INVALID_DELEGATION", `$.grants[${index}]`, "delegation grant is invalid") };
    if (seen.has(grant.grantId)) return { ok: false, issue: issue("DELEGATION_CYCLE", `$.grants[${index}].grantId`, "delegation grant is repeated") };
    seen.add(grant.grantId);
    if (!exactScope(grant.scope, scope.value)) return { ok: false, issue: issue("SCOPE_MISMATCH", `$.grants[${index}].scope`, "delegation grant belongs to another scope") };
    if (!exactPrincipal(grant.delegator, current)) return { ok: false, issue: issue("DELEGATION_PRINCIPAL_MISMATCH", `$.grants[${index}].delegator`, "delegation chain principal continuity is invalid") };
    if (exactPrincipal(grant.delegator, grant.delegate)) return { ok: false, issue: issue("DELEGATION_CYCLE", `$.grants[${index}].delegate`, "delegation cannot delegate to the same principal") };
    if (grant.parentGrantId !== previousGrantId) return { ok: false, issue: issue("DELEGATION_PARENT_MISMATCH", `$.grants[${index}].parentGrantId`, "delegation parent does not match the previous grant") };
    if (grant.audience !== audience) return { ok: false, issue: issue("DELEGATION_AUDIENCE_MISMATCH", `$.grants[${index}].audience`, "delegation audience does not match") };
    if (grant.issuedAt > now || grant.expiresAt <= now) return { ok: false, issue: issue("DELEGATION_EXPIRED", `$.grants[${index}]`, "delegation grant is not active at the requested time") };
    if (revoked.has(grant.grantId) || (grant.revokedAt !== undefined && grant.revokedAt <= now)) {
      return { ok: false, issue: issue("DELEGATION_REVOKED", `$.grants[${index}]`, "delegation grant is revoked") };
    }
    const delegate = context.value.principal(grant.delegate);
    if (!delegate.ok) return { ok: false, issue: issue("INVALID_DELEGATION", `$.grants[${index}].delegate`, "delegation delegate is invalid") };
    current = delegate.value;
    previousGrantId = grant.grantId;
    grantIds.push(grant.grantId);
  }
  if (!exactPrincipal(current, requested.value)) {
    return { ok: false, issue: issue("DELEGATION_PRINCIPAL_MISMATCH", "$.requestedPrincipal", "delegation chain does not terminate at the requested principal") };
  }
  return {
    ok: true,
    value: Object.freeze({
      principal: requested.value,
      scope: scope.value,
      audience,
      grantIds: Object.freeze(grantIds),
    }),
  };
}
