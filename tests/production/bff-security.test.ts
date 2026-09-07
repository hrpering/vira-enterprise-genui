import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  prepareBrowserBffRequest,
  signBffServerRequest,
  verifyBffServerRequest,
} from "../../integrations/browser-session/src/index.js";

const csrfKey = new Uint8Array(32).fill(9);
const serverKey = new Uint8Array(32).fill(3);
const now = 2_000_000_000;
const sessionToken = Buffer.alloc(32, 7).toString("base64url");
const scope = Object.freeze({
  version: "1" as const,
  organizationId: "acme",
  projectId: "alpha",
  environment: "staging" as const,
});

function csrfToken(): string {
  return createHmac("sha256", Buffer.from(csrfKey))
    .update(`vira-csrf-v1:${sessionToken}`)
    .digest("base64url");
}

describe("PROD-03 same-origin BFF boundary", () => {
  it("produces a bounded hash-only proxy request after Origin, CSRF and rate limiting", async () => {
    const result = await prepareBrowserBffRequest({
      method: "POST",
      path: "/v1/applications/run",
      requestedScope: scope,
      expectedOrigin: "https://app.example.com",
      origin: "https://app.example.com",
      secFetchSite: "same-origin",
      sessionToken,
      csrfToken: csrfToken(),
      csrfKey,
      contentType: "application/json; charset=utf-8",
      bodyText: JSON.stringify({ version: "1", input: { prompt: "hello" } }),
      rateLimiter: { consume: () => true },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.issue.code);
    expect(result.value.sessionIdHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result.value)).not.toContain(sessionToken);
    expect(result.value).toMatchObject({ method: "POST", path: "/v1/applications/run", scope });
  });

  it("fails closed on scope, body, schema, CSRF and rate-limit violations", async () => {
    expect(await prepareBrowserBffRequest({
      method: "GET",
      path: "/v1/applications/run",
      requestedScope: { ...scope, environment: "prod" },
      expectedOrigin: "https://app.example.com",
      sessionToken,
      csrfKey,
      bodyText: "",
      rateLimiter: { consume: () => true },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_BFF_SCOPE" } });

    expect(await prepareBrowserBffRequest({
      method: "POST",
      path: "/v1/applications/run",
      requestedScope: scope,
      expectedOrigin: "https://app.example.com",
      origin: "https://app.example.com",
      secFetchSite: "same-origin",
      sessionToken,
      csrfToken: csrfToken(),
      csrfKey,
      contentType: "application/json",
      bodyText: "x".repeat(65_537),
      rateLimiter: { consume: () => true },
    })).toMatchObject({ ok: false, issue: { code: "BODY_TOO_LARGE" } });

    expect(await prepareBrowserBffRequest({
      method: "POST",
      path: "/v1/applications/run",
      requestedScope: scope,
      expectedOrigin: "https://app.example.com",
      origin: "https://app.example.com",
      secFetchSite: "same-origin",
      sessionToken,
      csrfToken: csrfToken(),
      csrfKey,
      contentType: "application/json",
      bodyText: "{bad",
      rateLimiter: { consume: () => true },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_JSON" } });

    expect(await prepareBrowserBffRequest({
      method: "POST",
      path: "/v1/applications/run",
      requestedScope: scope,
      expectedOrigin: "https://app.example.com",
      origin: "https://app.example.com",
      secFetchSite: "same-origin",
      sessionToken,
      csrfToken: "wrong",
      csrfKey,
      contentType: "application/json",
      bodyText: "{}",
      rateLimiter: { consume: () => true },
    })).toMatchObject({ ok: false, issue: { code: "CSRF_MISMATCH" } });

    expect(await prepareBrowserBffRequest({
      method: "GET",
      path: "/v1/applications/run",
      requestedScope: scope,
      expectedOrigin: "https://app.example.com",
      sessionToken,
      csrfKey,
      bodyText: "",
      rateLimiter: { consume: () => false },
    })).toMatchObject({ ok: false, issue: { code: "RATE_LIMITED" } });
  });
});

describe("PROD-03 BFF to Railway server authentication", () => {
  it("authenticates exact method/path/body and rejects tampering or replay", () => {
    const bodyText = JSON.stringify({ version: "1", sessionIdHash: "a".repeat(64), scope });
    const signed = signBffServerRequest({
      method: "POST",
      path: "/v1/bff/session/authorize",
      bodyText,
      nowEpochSeconds: now,
      key: serverKey,
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) throw new Error(signed.issue.code);

    expect(verifyBffServerRequest({
      method: "POST",
      path: "/v1/bff/session/authorize",
      bodyText,
      nowEpochSeconds: now + 30,
      key: serverKey,
      ...signed.value,
    })).toEqual({ ok: true, value: true });

    expect(verifyBffServerRequest({
      method: "POST",
      path: "/v1/bff/session/authorize",
      bodyText: `${bodyText} `,
      nowEpochSeconds: now + 30,
      key: serverKey,
      ...signed.value,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_SERVER_SIGNATURE" } });

    expect(verifyBffServerRequest({
      method: "POST",
      path: "/v1/bff/session/authorize",
      bodyText,
      nowEpochSeconds: now + 61,
      key: serverKey,
      ...signed.value,
    })).toMatchObject({ ok: false, issue: { code: "SERVER_REQUEST_EXPIRED" } });
  });

  it("rejects malformed signing inputs without throwing", () => {
    expect(signBffServerRequest(null)).toMatchObject({ ok: false, issue: { code: "INVALID_SERVER_REQUEST" } });
    expect(verifyBffServerRequest([])).toMatchObject({ ok: false, issue: { code: "INVALID_SERVER_REQUEST" } });
  });
});
