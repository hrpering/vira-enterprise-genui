import { describe, expect, it } from "vitest";
import {
  authorizePersistedBrowserSession,
  createBrowserSecurityProfile,
  hashBrowserSessionToken,
  issueBrowserSession,
  verifyBrowserRequest,
} from "../../integrations/browser-session/src/index.js";
import type {
  ViraEnterprisePrincipal,
  ViraEnterpriseScope,
  ViraIdentityMembership,
} from "../../packages/enterprise-context/src/index.js";

const scope: ViraEnterpriseScope = Object.freeze({
  version: "1",
  organizationId: "acme",
  projectId: "alpha",
  environment: "staging",
});
const principal: ViraEnterprisePrincipal = Object.freeze({
  version: "1",
  kind: "user",
  id: "user:alice",
  organizationId: "acme",
});
const csrfKey = new Uint8Array(32).fill(9);
const now = 2_000_000_000;
const membership: ViraIdentityMembership = Object.freeze({
  version: "1",
  membershipId: "membership-a",
  identityIssuer: "https://issuer.example",
  identitySubject: "alice",
  principal,
  scope,
  revision: 7,
  active: true,
});

describe("PROD-03 browser session security", () => {
  it("issues only an opaque HttpOnly Secure host cookie and persists only a hash", () => {
    const issued = issueBrowserSession({
      principal,
      scope,
      membershipId: "membership-a",
      membershipRevision: 7,
      csrfKey,
      ttlSeconds: 3600,
      nowEpochSeconds: now,
      randomBytes: () => new Uint8Array(32).fill(7),
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) throw new Error(issued.issue.code);
    expect(issued.value.cookie).toContain("__Host-vira_session=");
    expect(issued.value.cookie).toContain("Path=/");
    expect(issued.value.cookie).toContain("HttpOnly");
    expect(issued.value.cookie).toContain("Secure");
    expect(issued.value.cookie).toContain("SameSite=Lax");
    expect(issued.value.record.sessionIdHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(issued.value.record)).not.toContain("__Host-vira_session");

    const token = issued.value.cookie.match(/__Host-vira_session=([^;]+)/)?.[1];
    expect(token).toBeTruthy();
    if (!token) throw new Error("session token missing");
    const hashed = hashBrowserSessionToken(token);
    expect(hashed).toEqual({ ok: true, value: issued.value.record.sessionIdHash });
  });

  it("authorizes a persisted session only while membership and session state remain fresh", () => {
    const issued = issueBrowserSession({
      principal,
      scope,
      membershipId: membership.membershipId,
      membershipRevision: membership.revision,
      csrfKey,
      nowEpochSeconds: now,
      randomBytes: () => new Uint8Array(32).fill(6),
    });
    if (!issued.ok) throw new Error(issued.issue.code);
    const token = issued.value.cookie.match(/__Host-vira_session=([^;]+)/)?.[1];
    if (!token) throw new Error("session token missing");

    expect(authorizePersistedBrowserSession({
      sessionToken: token,
      session: issued.value.record,
      membership,
      nowEpochSeconds: now + 10,
    })).toMatchObject({ ok: true, value: { membershipRevision: 7, principal } });

    expect(authorizePersistedBrowserSession({
      sessionToken: token,
      session: { ...issued.value.record, revokedAt: now + 1 },
      membership,
      nowEpochSeconds: now + 10,
    })).toMatchObject({ ok: false, issue: { code: "SESSION_REVOKED" } });

    expect(authorizePersistedBrowserSession({
      sessionToken: token,
      session: issued.value.record,
      membership: { ...membership, revision: 8 },
      nowEpochSeconds: now + 10,
    })).toMatchObject({ ok: false, issue: { code: "STALE_MEMBERSHIP" } });

    expect(authorizePersistedBrowserSession({
      sessionToken: token,
      session: issued.value.record,
      membership: { ...membership, active: false },
      nowEpochSeconds: now + 10,
    })).toMatchObject({ ok: false, issue: { code: "MEMBERSHIP_INACTIVE" } });
  });

  it("requires exact Origin plus a session-bound CSRF token for unsafe methods", () => {
    const issued = issueBrowserSession({
      principal,
      scope,
      membershipId: "membership-a",
      membershipRevision: 7,
      csrfKey,
      nowEpochSeconds: now,
      randomBytes: () => new Uint8Array(32).fill(8),
    });
    if (!issued.ok) throw new Error(issued.issue.code);
    const token = issued.value.cookie.match(/__Host-vira_session=([^;]+)/)?.[1];
    if (!token) throw new Error("session token missing");

    expect(verifyBrowserRequest({
      method: "POST",
      expectedOrigin: "https://app.example.com",
      origin: "https://app.example.com",
      secFetchSite: "same-origin",
      sessionToken: token,
      csrfToken: issued.value.csrfToken,
      csrfKey,
    }).ok).toBe(true);

    expect(verifyBrowserRequest({
      method: "POST",
      expectedOrigin: "https://app.example.com",
      origin: "https://evil.example",
      secFetchSite: "cross-site",
      sessionToken: token,
      csrfToken: issued.value.csrfToken,
      csrfKey,
    })).toMatchObject({ ok: false, issue: { code: "ORIGIN_MISMATCH" } });

    expect(verifyBrowserRequest({
      method: "DELETE",
      expectedOrigin: "https://app.example.com",
      origin: "https://app.example.com",
      secFetchSite: "same-origin",
      sessionToken: token,
      csrfToken: "wrong",
      csrfKey,
    })).toMatchObject({ ok: false, issue: { code: "CSRF_MISMATCH" } });
  });

  it("rejects malformed runtime inputs without throwing", () => {
    expect(issueBrowserSession(null)).toMatchObject({ ok: false, issue: { code: "INVALID_SESSION_INPUT" } });
    expect(hashBrowserSessionToken({})).toMatchObject({ ok: false, issue: { code: "INVALID_SESSION_TOKEN" } });
    expect(verifyBrowserRequest([])).toMatchObject({ ok: false, issue: { code: "INVALID_BROWSER_REQUEST" } });
    expect(authorizePersistedBrowserSession({ sessionToken: "bad" })).toMatchObject({ ok: false, issue: { code: "INVALID_SESSION_RECORD" } });
  });

  it("derives a strict same-origin security profile from the existing CSP owner", () => {
    const profile = createBrowserSecurityProfile({
      version: "1",
      rules: [{ origin: "https://api.example.com", methods: ["GET", "POST"] }],
    });
    expect(profile.ok).toBe(true);
    if (!profile.ok) throw new Error(profile.issue.code);
    expect(profile.value.corsMode).toBe("same-origin-only");
    expect(profile.value.csp).toContain("script-src 'self'");
    expect(profile.value.csp).toContain("script-src-attr 'none'");
    expect(profile.value.csp).toContain("object-src 'none'");
    expect(profile.value.csp).toContain("connect-src 'self' https://api.example.com");
    expect(profile.value.csp).not.toContain("'unsafe-inline'");
    expect(profile.value.csp).not.toContain("'unsafe-eval'");
    expect(profile.value.headers["Strict-Transport-Security"]).toContain("max-age=63072000");
  });
});
