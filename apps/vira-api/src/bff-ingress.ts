import {
  verifyBffServerRequest,
  type ViraBffPreparedRequest,
  type ViraBrowserSecurityResult,
} from "../../../integrations/browser-session/src/index.js";
import {
  authorizeBrowserSessionFromPostgres,
  type PostgresPoolLike,
} from "../../../integrations/postgres/src/index.js";
import type {
  ViraEnterprisePrincipal,
  ViraEnterpriseScope,
} from "../../../packages/enterprise-context/src/index.js";

export interface ViraApiAuthorizedBffRequest {
  readonly principal: ViraEnterprisePrincipal;
  readonly scope: ViraEnterpriseScope;
  readonly method: ViraBffPreparedRequest["method"];
  readonly path: string;
  readonly body?: unknown;
}

export interface ViraApiBffDispatchResponse {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface ViraApiBffIngressDependencies {
  readonly pool: PostgresPoolLike;
  readonly serverKey: Uint8Array;
  readonly dispatch: (
    request: ViraApiAuthorizedBffRequest,
  ) => Promise<ViraApiBffDispatchResponse> | ViraApiBffDispatchResponse;
}

const sessionHashPattern = /^[0-9a-f]{64}$/;
const pathPattern = /^\/v1\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,1000}$/;
const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const allowedResponseHeaders = new Set(["content-type", "cache-control", "content-disposition"]);

function fail<T>(code: string, message: string): ViraBrowserSecurityResult<T> {
  return { ok: false, issue: Object.freeze({ code, message }) };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parsePreparedRequest(value: unknown): ViraBffPreparedRequest | undefined {
  if (!record(value)) return undefined;
  const keys = Object.keys(value).sort();
  const required = ["method", "path", "scope", "sessionIdHash", "version"];
  const allowed = new Set([...required, "body"]);
  if (keys.some((key) => !allowed.has(key)) || !required.every((key) => Object.hasOwn(value, key))) return undefined;
  if (
    value.version !== "1"
    || typeof value.sessionIdHash !== "string"
    || !sessionHashPattern.test(value.sessionIdHash)
    || typeof value.method !== "string"
    || !allowedMethods.has(value.method)
    || typeof value.path !== "string"
    || !pathPattern.test(value.path)
    || !record(value.scope)
  ) return undefined;
  return value as unknown as ViraBffPreparedRequest;
}

function sanitizeDispatchResponse(value: unknown): ViraApiBffDispatchResponse | undefined {
  if (!record(value) || typeof value.status !== "number" || !Number.isInteger(value.status) || value.status < 200 || value.status > 599 || typeof value.body !== "string") {
    return undefined;
  }
  if (Buffer.byteLength(value.body, "utf8") > 1_048_576) return undefined;
  if (value.headers !== undefined && !record(value.headers)) return undefined;
  const headers: Record<string, string> = {};
  if (record(value.headers)) {
    for (const [name, headerValue] of Object.entries(value.headers)) {
      const normalized = name.toLowerCase();
      if (!allowedResponseHeaders.has(normalized) || typeof headerValue !== "string" || headerValue.length > 2048) return undefined;
      headers[normalized] = headerValue;
    }
  }
  return Object.freeze({ status: value.status, headers: Object.freeze(headers), body: value.body });
}

export async function handleViraApiBffIngress(
  dependencies: ViraApiBffIngressDependencies,
  input: unknown,
): Promise<ViraBrowserSecurityResult<ViraApiBffDispatchResponse>> {
  if (
    !record(input)
    || input.method !== "POST"
    || input.path !== "/v1/bff/proxy"
    || typeof input.bodyText !== "string"
    || typeof input.timestamp !== "string"
    || typeof input.signature !== "string"
    || input.signatureVersion !== "1"
    || typeof input.nowEpochSeconds !== "number"
    || !Number.isSafeInteger(input.nowEpochSeconds)
    || input.nowEpochSeconds < 0
  ) return fail("INVALID_BFF_INGRESS", "Railway BFF ingress input is invalid");

  const verified = verifyBffServerRequest({
    method: input.method,
    path: input.path,
    bodyText: input.bodyText,
    timestamp: input.timestamp,
    signature: input.signature,
    version: input.signatureVersion,
    nowEpochSeconds: input.nowEpochSeconds,
    key: dependencies.serverKey,
  });
  if (!verified.ok) return verified;

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.bodyText) as unknown;
  } catch {
    return fail("INVALID_BFF_ENVELOPE", "Railway BFF ingress body is not valid JSON");
  }
  const prepared = parsePreparedRequest(parsed);
  if (!prepared) return fail("INVALID_BFF_ENVELOPE", "Railway BFF ingress envelope is invalid");

  const session = await authorizeBrowserSessionFromPostgres(dependencies.pool, {
    scope: prepared.scope,
    sessionIdHash: prepared.sessionIdHash,
    nowEpochSeconds: input.nowEpochSeconds,
  });
  if (!session.ok) return session;

  let rawResponse: unknown;
  try {
    rawResponse = await dependencies.dispatch(Object.freeze({
      principal: session.value.principal,
      scope: session.value.scope,
      method: prepared.method,
      path: prepared.path,
      ...(prepared.body === undefined ? {} : { body: prepared.body }),
    }));
  } catch {
    return fail("BFF_DISPATCH_FAILED", "authorized BFF request dispatch failed closed");
  }
  const response = sanitizeDispatchResponse(rawResponse);
  if (!response) return fail("INVALID_BFF_RESPONSE", "authorized BFF dispatch returned an invalid response");
  return { ok: true, value: response };
}
