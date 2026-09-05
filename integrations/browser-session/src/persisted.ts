import {
  createViraEnterpriseContext,
  type ViraEnterprisePrincipal,
  type ViraEnterpriseScope,
  type ViraIdentityMembership,
} from "../../../packages/enterprise-context/src/index.js";
import type {
  ViraAuthorizedBrowserSession,
  ViraBrowserSecurityResult,
  ViraBrowserSessionRecord,
} from "./session.js";

const sessionHashPattern = /^[0-9a-f]{64}$/;
const membershipIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;

function fail<T>(code: string, message: string): ViraBrowserSecurityResult<T> {
  return { ok: false, issue: Object.freeze({ code, message }) };
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

function sessionShape(value: unknown): value is ViraBrowserSessionRecord {
  return record(value)
    && value.version === "1"
    && typeof value.sessionIdHash === "string"
    && record(value.principal)
    && record(value.scope)
    && typeof value.membershipId === "string"
    && typeof value.membershipRevision === "number"
    && typeof value.issuedAt === "number"
    && typeof value.expiresAt === "number"
    && (value.revokedAt === undefined || typeof value.revokedAt === "number");
}

function membershipShape(value: unknown): value is ViraIdentityMembership {
  return record(value)
    && value.version === "1"
    && typeof value.membershipId === "string"
    && typeof value.identityIssuer === "string"
    && typeof value.identitySubject === "string"
    && record(value.principal)
    && record(value.scope)
    && typeof value.revision === "number"
    && typeof value.active === "boolean"
    && (value.expiresAt === undefined || typeof value.expiresAt === "number");
}

function canonicalBinding(input: { readonly principal: ViraEnterprisePrincipal; readonly scope: ViraEnterpriseScope }) {
  const context = createViraEnterpriseContext({
    organizationId: input.scope.organizationId,
    projectId: input.scope.projectId,
    environments: [input.scope.environment],
  });
  if (!context.ok) return undefined;
  const scope = context.value.scope(input.scope.environment);
  const principal = context.value.principal(input.principal);
  if (!scope.ok || !principal.ok || !exactScope(scope.value, input.scope)) return undefined;
  return Object.freeze({ principal: principal.value, scope: scope.value });
}

export function authorizePersistedBrowserSessionHash(input: unknown): ViraBrowserSecurityResult<ViraAuthorizedBrowserSession> {
  if (
    !record(input)
    || typeof input.sessionIdHash !== "string"
    || !sessionHashPattern.test(input.sessionIdHash)
    || !sessionShape(input.session)
    || !membershipShape(input.membership)
  ) return fail("INVALID_SESSION_RECORD", "persisted browser session hash authorization input is invalid");
  const now = input.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof now !== "number" || !Number.isSafeInteger(now) || now < 0) {
    return fail("INVALID_SESSION_RECORD", "persisted browser session authorization time is invalid");
  }

  const session = input.session;
  const membership = input.membership;
  if (session.sessionIdHash !== input.sessionIdHash) {
    return fail("SESSION_HASH_MISMATCH", "browser session hash does not match the persisted session");
  }
  const sessionBinding = canonicalBinding(session);
  const membershipBinding = canonicalBinding(membership);
  if (!sessionBinding || !membershipBinding) {
    return fail("INVALID_SESSION_RECORD", "persisted browser session or membership binding is invalid");
  }
  if (
    !membershipIdPattern.test(session.membershipId)
    || !membershipIdPattern.test(membership.membershipId)
    || !Number.isSafeInteger(session.membershipRevision)
    || session.membershipRevision < 1
    || !Number.isSafeInteger(membership.revision)
    || membership.revision < 1
    || !Number.isSafeInteger(session.issuedAt)
    || !Number.isSafeInteger(session.expiresAt)
    || session.expiresAt <= session.issuedAt
    || session.issuedAt > now
  ) return fail("INVALID_SESSION_RECORD", "persisted browser session metadata is invalid");
  if (session.revokedAt !== undefined) {
    if (!Number.isSafeInteger(session.revokedAt) || session.revokedAt < session.issuedAt) {
      return fail("INVALID_SESSION_RECORD", "persisted browser session revocation metadata is invalid");
    }
    if (session.revokedAt <= now) return fail("SESSION_REVOKED", "browser session has been revoked");
  }
  if (session.expiresAt <= now) return fail("SESSION_EXPIRED", "browser session has expired");
  if (!membership.active) return fail("MEMBERSHIP_INACTIVE", "browser session membership is inactive");
  if (membership.expiresAt !== undefined) {
    if (!Number.isSafeInteger(membership.expiresAt)) return fail("INVALID_SESSION_RECORD", "membership expiry is invalid");
    if (membership.expiresAt <= now) return fail("MEMBERSHIP_EXPIRED", "browser session membership has expired");
  }
  if (session.membershipId !== membership.membershipId) {
    return fail("MEMBERSHIP_MISMATCH", "browser session belongs to another membership");
  }
  if (session.membershipRevision !== membership.revision) {
    return fail("STALE_MEMBERSHIP", "browser session membership revision is stale");
  }
  if (!exactScope(sessionBinding.scope, membershipBinding.scope)) {
    return fail("SCOPE_MISMATCH", "browser session and membership scopes differ");
  }
  if (!exactPrincipal(sessionBinding.principal, membershipBinding.principal)) {
    return fail("PRINCIPAL_MISMATCH", "browser session and membership principals differ");
  }
  return {
    ok: true,
    value: Object.freeze({
      principal: sessionBinding.principal,
      scope: sessionBinding.scope,
      membershipId: session.membershipId,
      membershipRevision: session.membershipRevision,
      sessionIdHash: session.sessionIdHash,
    }),
  };
}
