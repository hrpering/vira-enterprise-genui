import { describe, expect, it } from "vitest";
import { handleViraApiBffIngress } from "../../apps/vira-api/src/bff-ingress.js";
import { signBffServerRequest } from "../../integrations/browser-session/src/index.js";
import type {
  PostgresClientLike,
  PostgresPoolLike,
  PostgresQueryResult,
} from "../../integrations/postgres/src/index.js";

const now = 2_000_000_000;
const serverKey = new Uint8Array(32).fill(3);
const scope = Object.freeze({
  version: "1" as const,
  organizationId: "acme",
  projectId: "alpha",
  environment: "staging" as const,
});
const sessionIdHash = "a".repeat(64);

function pool(): PostgresPoolLike {
  const client: PostgresClientLike = {
    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
    ): Promise<PostgresQueryResult<Row>> {
      if (!text.includes("FROM vira.browser_session AS bs")) return { rows: [] };
      return {
        rows: [{
          session_id_hash: sessionIdHash,
          membership_id: "membership-a",
          membership_revision: "7",
          session_principal_kind: "user",
          session_principal_id: "user:alice",
          session_issued_at: String(now - 10),
          session_expires_at: String(now + 300),
          session_revoked_at: null,
          identity_issuer: "https://issuer.example",
          identity_subject: "alice",
          membership_principal_kind: "user",
          membership_principal_id: "user:alice",
          membership_revision_current: "7",
          membership_active: true,
          membership_expires_at: null,
        } as unknown as Row],
      };
    },
    release() {},
  };
  return { connect: async () => client };
}

function signedEnvelope(overrides: Record<string, unknown> = {}) {
  const envelope = {
    version: "1",
    sessionIdHash,
    scope,
    method: "POST",
    path: "/v1/applications/run",
    body: { version: "1", input: { prompt: "hello" } },
    ...overrides,
  };
  const bodyText = JSON.stringify(envelope);
  const signed = signBffServerRequest({
    method: "POST",
    path: "/v1/bff/proxy",
    bodyText,
    nowEpochSeconds: now,
    key: serverKey,
  });
  if (!signed.ok) throw new Error(signed.issue.code);
  return { bodyText, signed: signed.value };
}

describe("PROD-03 Railway BFF ingress", () => {
  it("dispatches only after server signature and RLS-backed session authorization", async () => {
    const fixture = signedEnvelope();
    let dispatched: unknown;
    const result = await handleViraApiBffIngress({
      pool: pool(),
      serverKey,
      dispatch(request) {
        dispatched = request;
        return { status: 200, headers: { "content-type": "application/json" }, body: "{\"ok\":true}" };
      },
    }, {
      method: "POST",
      path: "/v1/bff/proxy",
      bodyText: fixture.bodyText,
      timestamp: fixture.signed.timestamp,
      signature: fixture.signed.signature,
      signatureVersion: fixture.signed.version,
      nowEpochSeconds: now + 10,
    });
    expect(result).toMatchObject({ ok: true, value: { status: 200 } });
    expect(dispatched).toMatchObject({
      principal: { version: "1", kind: "user", id: "user:alice", organizationId: "acme" },
      scope,
      method: "POST",
      path: "/v1/applications/run",
    });
  });

  it("rejects unsigned, tampered and token-bearing envelopes", async () => {
    const fixture = signedEnvelope();
    const dependencies = {
      pool: pool(),
      serverKey,
      dispatch: () => ({ status: 200, body: "ok" }),
    };
    expect(await handleViraApiBffIngress(dependencies, {
      method: "POST",
      path: "/v1/bff/proxy",
      bodyText: fixture.bodyText,
      timestamp: fixture.signed.timestamp,
      signature: "x".repeat(43),
      signatureVersion: "1",
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_SERVER_SIGNATURE" } });

    const tokenBearing = signedEnvelope({ sessionToken: "must-never-cross-boundary" });
    expect(await handleViraApiBffIngress(dependencies, {
      method: "POST",
      path: "/v1/bff/proxy",
      bodyText: tokenBearing.bodyText,
      timestamp: tokenBearing.signed.timestamp,
      signature: tokenBearing.signed.signature,
      signatureVersion: "1",
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_BFF_ENVELOPE" } });
  });

  it("fails closed on stale session truth before dispatch", async () => {
    const fixture = signedEnvelope();
    let called = false;
    const stalePool: PostgresPoolLike = {
      connect: async () => ({
        async query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string): Promise<PostgresQueryResult<Row>> {
          if (!text.includes("FROM vira.browser_session AS bs")) return { rows: [] };
          return { rows: [{
            session_id_hash: sessionIdHash,
            membership_id: "membership-a",
            membership_revision: "7",
            session_principal_kind: "user",
            session_principal_id: "user:alice",
            session_issued_at: String(now - 10),
            session_expires_at: String(now + 300),
            session_revoked_at: null,
            identity_issuer: "https://issuer.example",
            identity_subject: "alice",
            membership_principal_kind: "user",
            membership_principal_id: "user:alice",
            membership_revision_current: "8",
            membership_active: true,
            membership_expires_at: null,
          } as unknown as Row] };
        },
        release() {},
      }),
    };
    expect(await handleViraApiBffIngress({
      pool: stalePool,
      serverKey,
      dispatch() { called = true; return { status: 200, body: "ok" }; },
    }, {
      method: "POST",
      path: "/v1/bff/proxy",
      bodyText: fixture.bodyText,
      timestamp: fixture.signed.timestamp,
      signature: fixture.signed.signature,
      signatureVersion: fixture.signed.version,
      nowEpochSeconds: now,
    })).toMatchObject({ ok: false, issue: { code: "STALE_MEMBERSHIP" } });
    expect(called).toBe(false);
  });
});
