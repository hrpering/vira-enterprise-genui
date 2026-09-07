import {
  createHash,
  createHmac,
  randomBytes as nodeRandomBytes,
  timingSafeEqual,
} from "node:crypto";
import { URL } from "node:url";
import {
  createViraEnterpriseContext,
  type ViraEnterprisePrincipal,
  type ViraEnterpriseScope,
  type ViraIdentityMembership,
} from "../../../packages/enterprise-context/src/index.js";
import { createCspHostRequirements } from "../../../packages/security/src/index.js";

export const VIRA_BROWSER_SESSION_COOKIE = "__Host-vira_session" as const;
export const VIRA_BROWSER_SESSION_VERSION = "1" as const;

export interface ViraBrowserSessionRecord {
  readonly version: typeof VIRA_BROWSER_SESSION_VERSION;
  readonly sessionIdHash: string;
  readonly principal: ViraEnterprisePrincipal;
  readonly scope: ViraEnterpriseScope;
  readonly membershipId: string;
  readonly membershipRevision: number;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly revokedAt?: number;
}

export interface ViraAuthorizedBrowserSession {
  readonly principal: ViraEnterprisePrincipal;
  readonly scope: ViraEnterpriseScope;
  readonly membershipId: string;
  readonly membershipRevision: number;
  readonly sessionIdHash: string;
}

export type ViraBrowserSecurityResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: { readonly code: string; readonly message: string } };

const sessionTokenPattern = /^[A-Za-z0-9_-]{43}$/;
const sessionHashPattern = /^[0-9a-f]{64}$/;
const membershipIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function fail<T>(code: string, message: string): ViraBrowserSecurityResult<T> {
  return { ok: false, issue: Object.freeze({ code, message }) };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function keyBuffer(key: unknown): Buffer | undefined {
  return key instanceof Uint8Array && key.byteLength >= 32 ? Buffer.from(key) : undefined;
}

function csrfFor(sessionToken: string, key: Buffer): string {
  return createHmac("sha256", key).update(`vira-csrf-v1:${sessionToken}`).digest("base64url");
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

function canonicalIdentityBinding(input: unknown): ViraBrowserSecurityResult<{
  readonly principal: ViraEnterprisePrincipal;
  readonly scope: ViraEnterpriseScope;
}> {
  if (!record(input) || !record(input.principal) || !record(input.scope)) {
    return fail("INVALID_SCOPE", "browser session principal/scope input is invalid");
  }
  const scopeInput = input.scope as unknown as ViraEnterpriseScope;
  const principalInput = input.principal as unknown as ViraEnterprisePrincipal;
  const context = createViraEnterpriseContext({
    organizationId: scopeInput.organizationId,
    projectId: scopeInput.projectId,
    environments: [scopeInput.environment],
  });
  if (!context.ok) return fail("INVALID_SCOPE", "browser session scope is invalid");
  const scope = context.value.scope(scopeInput.environment);
  const principal = context.value.principal(principalInput);
  if (!scope.ok || !principal.ok || !exactScope(scope.value, scopeInput)) {
    return fail("INVALID_PRINCIPAL", "browser session principal or scope is invalid");
  }
  return { ok: true, value: Object.freeze({ principal: principal.value, scope: scope.value }) };
}

function sessionRecordShape(value: unknown): value is ViraBrowserSessionRecord {
  return record(value)
    && value.version === VIRA_BROWSER_SESSION_VERSION
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

export function issueBrowserSession(input: unknown): ViraBrowserSecurityResult<{
  readonly cookie: string;
  readonly csrfToken: string;
  readonly record: ViraBrowserSessionRecord;
}> {
  if (!record(input)) return fail("INVALID_SESSION_INPUT", "browser session input is invalid");
  const binding = canonicalIdentityBinding(input);
  if (!binding.ok) return binding;
  const key = keyBuffer(input.csrfKey);
  const ttl = input.ttlSeconds ?? 3600;
  const now = input.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  if (
    !key
    || typeof input.membershipId !== "string"
    || !membershipIdPattern.test(input.membershipId)
    || typeof input.membershipRevision !== "number"
    || !Number.isSafeInteger(input.membershipRevision)
    || input.membershipRevision < 1
    || typeof ttl !== "number"
    || !Number.isSafeInteger(ttl)
    || ttl < 60
    || ttl > 86400
    || typeof now !== "number"
    || !Number.isSafeInteger(now)
    || now < 0
    || (input.randomBytes !== undefined && typeof input.randomBytes !== "function")
  ) return fail("INVALID_SESSION_INPUT", "browser session input is invalid");

  let random: Uint8Array;
  try {
    random = (input.randomBytes as ((size: number) => Uint8Array) | undefined ?? nodeRandomBytes)(32);
  } catch {
    return fail("INVALID_RANDOMNESS", "browser session randomness source failed");
  }
  const raw = Buffer.from(random);
  if (raw.byteLength !== 32) return fail("INVALID_RANDOMNESS", "browser session randomness source returned the wrong length");
  const sessionToken = raw.toString("base64url");
  const expiresAt = now + ttl;
  const sessionIdHash = createHash("sha256").update(sessionToken).digest("hex");

  return {
    ok: true,
    value: Object.freeze({
      cookie: `${VIRA_BROWSER_SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ttl}`,
      csrfToken: csrfFor(sessionToken, key),
      record: Object.freeze({
        version: VIRA_BROWSER_SESSION_VERSION,
        sessionIdHash,
        principal: binding.value.principal,
        scope: binding.value.scope,
        membershipId: input.membershipId,
        membershipRevision: input.membershipRevision,
        issuedAt: now,
        expiresAt,
      }),
    }),
  };
}

export function hashBrowserSessionToken(sessionToken: unknown): ViraBrowserSecurityResult<string> {
  if (typeof sessionToken !== "string" || !sessionTokenPattern.test(sessionToken)) {
    return fail("INVALID_SESSION_TOKEN", "browser session token is invalid");
  }
  return { ok: true, value: createHash("sha256").update(sessionToken).digest("hex") };
}

export function authorizePersistedBrowserSession(input: unknown): ViraBrowserSecurityResult<ViraAuthorizedBrowserSession> {
  if (!record(input) || !sessionRecordShape(input.session) || !membershipShape(input.membership)) {
    return fail("INVALID_SESSION_RECORD", "persisted browser session authorization input is invalid");
  }
  const now = input.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof now !== "number" || !Number.isSafeInteger(now) || now < 0) {
    return fail("INVALID_SESSION_RECORD", "persisted browser session authorization time is invalid");
  }
  const hashed = hashBrowserSessionToken(input.sessionToken);
  if (!hashed.ok) return hashed;
  const session = input.session;
  const membership = input.membership;
  if (!sessionHashPattern.test(session.sessionIdHash) || hashed.value !== session.sessionIdHash) {
    return fail("SESSION_HASH_MISMATCH", "browser session token does not match the persisted session");
  }
  const sessionBinding = canonicalIdentityBinding(session);
  const membershipBinding = canonicalIdentityBinding(membership);
  if (!sessionBinding.ok || !membershipBinding.ok) {
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
  if (!exactScope(sessionBinding.value.scope, membershipBinding.value.scope)) {
    return fail("SCOPE_MISMATCH", "browser session and membership scopes differ");
  }
  if (!exactPrincipal(sessionBinding.value.principal, membershipBinding.value.principal)) {
    return fail("PRINCIPAL_MISMATCH", "browser session and membership principals differ");
  }
  return {
    ok: true,
    value: Object.freeze({
      principal: sessionBinding.value.principal,
      scope: sessionBinding.value.scope,
      membershipId: session.membershipId,
      membershipRevision: session.membershipRevision,
      sessionIdHash: session.sessionIdHash,
    }),
  };
}

export function verifyBrowserRequest(input: unknown): ViraBrowserSecurityResult<true> {
  if (
    !record(input)
    || typeof input.method !== "string"
    || typeof input.expectedOrigin !== "string"
    || typeof input.sessionToken !== "string"
    || (input.origin !== undefined && typeof input.origin !== "string")
    || (input.secFetchSite !== undefined && typeof input.secFetchSite !== "string")
    || (input.csrfToken !== undefined && typeof input.csrfToken !== "string")
  ) return fail("INVALID_BROWSER_REQUEST", "browser request security input is invalid");
  const method = input.method.toUpperCase();
  if (!sessionTokenPattern.test(input.sessionToken)) return fail("INVALID_SESSION_TOKEN", "browser session token is invalid");
  let expected: URL;
  try {
    expected = new URL(input.expectedOrigin);
  } catch {
    return fail("INVALID_ORIGIN", "expected browser origin is invalid");
  }
  if (
    expected.protocol !== "https:"
    || expected.pathname !== "/"
    || expected.search !== ""
    || expected.hash !== ""
    || expected.username !== ""
    || expected.password !== ""
  ) return fail("INVALID_ORIGIN", "expected browser origin must be a canonical HTTPS origin");

  if (!unsafeMethods.has(method)) return { ok: true, value: true };
  if (input.origin !== expected.origin) return fail("ORIGIN_MISMATCH", "state-changing browser request origin does not match");
  if (input.secFetchSite !== undefined && input.secFetchSite !== "same-origin") {
    return fail("CROSS_SITE_REQUEST", "state-changing browser request is not same-origin");
  }
  if (typeof input.csrfToken !== "string") return fail("CSRF_REQUIRED", "state-changing browser request requires a CSRF token");
  const key = keyBuffer(input.csrfKey);
  if (!key) return fail("INVALID_CSRF_KEY", "CSRF key must contain at least 256 bits");
  const expectedCsrf = Buffer.from(csrfFor(input.sessionToken, key));
  const actualCsrf = Buffer.from(input.csrfToken);
  if (actualCsrf.byteLength !== expectedCsrf.byteLength || !timingSafeEqual(actualCsrf, expectedCsrf)) {
    return fail("CSRF_MISMATCH", "CSRF token does not match the browser session");
  }
  return { ok: true, value: true };
}

export function createBrowserSecurityProfile(networkPolicyInput: unknown): ViraBrowserSecurityResult<{
  readonly corsMode: "same-origin-only";
  readonly csp: string;
  readonly headers: Readonly<Record<string, string>>;
}> {
  const requirements = createCspHostRequirements(networkPolicyInput);
  if (!requirements.ok) return fail("INVALID_NETWORK_POLICY", "browser CSP network policy is invalid");
  const connectSrc = ["'self'", ...requirements.value.connectSrc.origins].join(" ");
  const csp = [
    "default-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "script-src-attr 'none'",
    `connect-src ${connectSrc}`,
    "img-src 'self' data:",
    "style-src 'self'",
    "font-src 'self'",
  ].join("; ");

  return {
    ok: true,
    value: Object.freeze({
      corsMode: "same-origin-only",
      csp,
      headers: Object.freeze({
        "Content-Security-Policy": csp,
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Referrer-Policy": "no-referrer",
        "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
        "X-Content-Type-Options": "nosniff",
      }),
    }),
  };
}
