import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  createViraEnterpriseContext,
  type ViraEnterpriseScope,
} from "../../../packages/enterprise-context/src/index.js";
import { hashBrowserSessionToken, verifyBrowserRequest, type ViraBrowserSecurityResult } from "./session.js";

export const VIRA_BFF_MAX_BODY_BYTES = 65_536 as const;
export const VIRA_BFF_MAX_JSON_DEPTH = 32 as const;
export const VIRA_BFF_SIGNATURE_VERSION = "1" as const;

export interface ViraBffPreparedRequest {
  readonly version: typeof VIRA_BFF_SIGNATURE_VERSION;
  readonly sessionIdHash: string;
  readonly scope: ViraEnterpriseScope;
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly body?: unknown;
}

export interface ViraBffRateLimiter {
  readonly consume: (input: {
    readonly sessionIdHash: string;
    readonly scope: ViraEnterpriseScope;
    readonly method: string;
    readonly path: string;
  }) => Promise<boolean> | boolean;
}

export interface ViraSignedBffRequest {
  readonly timestamp: string;
  readonly signature: string;
  readonly version: typeof VIRA_BFF_SIGNATURE_VERSION;
}

const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const pathPattern = /^\/v1\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,1000}$/;
const signaturePattern = /^[A-Za-z0-9_-]{43}$/;
const blockedJsonKeys = new Set(["__proto__", "prototype", "constructor"]);

function fail<T>(code: string, message: string): ViraBrowserSecurityResult<T> {
  return { ok: false, issue: Object.freeze({ code, message }) };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function keyBuffer(value: unknown): Buffer | undefined {
  return value instanceof Uint8Array && value.byteLength >= 32 ? Buffer.from(value) : undefined;
}

function canonicalScope(value: unknown): ViraEnterpriseScope | undefined {
  if (!record(value)) return undefined;
  const created = createViraEnterpriseContext({
    organizationId: value.organizationId,
    projectId: value.projectId,
    environments: [value.environment],
  });
  if (!created.ok) return undefined;
  const scope = created.value.scope(value.environment as ViraEnterpriseScope["environment"]);
  if (!scope.ok) return undefined;
  if (
    value.version !== scope.value.version
    || value.organizationId !== scope.value.organizationId
    || value.projectId !== scope.value.projectId
    || value.environment !== scope.value.environment
    || Object.keys(value).length !== 4
  ) return undefined;
  return scope.value;
}

function safeJson(value: unknown, depth = 0): boolean {
  if (depth > VIRA_BFF_MAX_JSON_DEPTH) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 1024 && value.every((item) => safeJson(item, depth + 1));
  if (!record(value)) return false;
  const keys = Object.keys(value);
  if (keys.length > 1024 || keys.some((key) => blockedJsonKeys.has(key))) return false;
  return keys.every((key) => safeJson(value[key], depth + 1));
}

function canonicalPath(path: string): boolean {
  if (!pathPattern.test(path) || path.includes("//") || path.includes("\\")) return false;
  const segments = path.split("/");
  return !segments.some((segment) => segment === "." || segment === "..");
}

function bodyDigest(bodyText: string): string {
  return createHash("sha256").update(bodyText).digest("base64url");
}

function signingInput(method: string, path: string, timestamp: string, bodyText: string): string {
  return ["vira-bff-v1", timestamp, method, path, bodyDigest(bodyText)].join("\n");
}

export async function prepareBrowserBffRequest(input: unknown): Promise<ViraBrowserSecurityResult<ViraBffPreparedRequest>> {
  if (
    !record(input)
    || typeof input.method !== "string"
    || typeof input.path !== "string"
    || typeof input.expectedOrigin !== "string"
    || typeof input.sessionToken !== "string"
    || typeof input.bodyText !== "string"
    || (input.contentType !== undefined && typeof input.contentType !== "string")
    || !record(input.rateLimiter)
    || typeof input.rateLimiter.consume !== "function"
  ) return fail("INVALID_BFF_REQUEST", "browser BFF request input is invalid");

  const scope = canonicalScope(input.requestedScope);
  if (!scope) return fail("INVALID_BFF_SCOPE", "browser BFF requested scope is not canonical");
  const method = input.method.toUpperCase();
  if (!allowedMethods.has(method) || !canonicalPath(input.path)) {
    return fail("INVALID_BFF_REQUEST", "browser BFF method or path is invalid");
  }
  const bodyBytes = Buffer.byteLength(input.bodyText, "utf8");
  if (bodyBytes > VIRA_BFF_MAX_BODY_BYTES) return fail("BODY_TOO_LARGE", "browser BFF body exceeds the maximum size");
  if (method === "GET" && bodyBytes !== 0) return fail("INVALID_BFF_REQUEST", "GET browser BFF requests must not contain a body");
  if (unsafeMethods.has(method) && !input.contentType?.toLowerCase().startsWith("application/json")) {
    return fail("UNSUPPORTED_CONTENT_TYPE", "state-changing browser BFF requests require application/json");
  }

  let body: unknown;
  if (bodyBytes > 0) {
    try {
      body = JSON.parse(input.bodyText) as unknown;
    } catch {
      return fail("INVALID_JSON", "browser BFF JSON body is malformed");
    }
    if (!safeJson(body)) return fail("INVALID_JSON", "browser BFF JSON body violates structural limits");
  }

  const browser = verifyBrowserRequest({
    method,
    expectedOrigin: input.expectedOrigin,
    origin: input.origin,
    secFetchSite: input.secFetchSite,
    sessionToken: input.sessionToken,
    csrfToken: input.csrfToken,
    csrfKey: input.csrfKey,
  });
  if (!browser.ok) return browser;
  const hashed = hashBrowserSessionToken(input.sessionToken);
  if (!hashed.ok) return hashed;

  let allowed: boolean;
  try {
    allowed = await (input.rateLimiter as unknown as ViraBffRateLimiter).consume({
      sessionIdHash: hashed.value,
      scope,
      method,
      path: input.path,
    });
  } catch {
    return fail("RATE_LIMIT_UNAVAILABLE", "browser BFF rate limiter failed closed");
  }
  if (allowed !== true) return fail("RATE_LIMITED", "browser BFF request exceeded its rate limit");

  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_BFF_SIGNATURE_VERSION,
      sessionIdHash: hashed.value,
      scope,
      method: method as ViraBffPreparedRequest["method"],
      path: input.path,
      ...(bodyBytes === 0 ? {} : { body }),
    }),
  };
}

export function signBffServerRequest(input: unknown): ViraBrowserSecurityResult<ViraSignedBffRequest> {
  if (
    !record(input)
    || typeof input.method !== "string"
    || typeof input.path !== "string"
    || typeof input.bodyText !== "string"
    || typeof input.nowEpochSeconds !== "number"
    || !Number.isSafeInteger(input.nowEpochSeconds)
    || input.nowEpochSeconds < 0
    || !canonicalPath(input.path)
  ) return fail("INVALID_SERVER_REQUEST", "BFF server request signing input is invalid");
  const key = keyBuffer(input.key);
  if (!key) return fail("INVALID_SERVER_KEY", "BFF server authentication key must contain at least 256 bits");
  if (Buffer.byteLength(input.bodyText, "utf8") > VIRA_BFF_MAX_BODY_BYTES) return fail("BODY_TOO_LARGE", "BFF server request body exceeds the maximum size");
  const method = input.method.toUpperCase();
  if (!allowedMethods.has(method)) return fail("INVALID_SERVER_REQUEST", "BFF server request method is invalid");
  const timestamp = String(input.nowEpochSeconds);
  const signature = createHmac("sha256", key)
    .update(signingInput(method, input.path, timestamp, input.bodyText))
    .digest("base64url");
  return { ok: true, value: Object.freeze({ timestamp, signature, version: VIRA_BFF_SIGNATURE_VERSION }) };
}

export function verifyBffServerRequest(input: unknown): ViraBrowserSecurityResult<true> {
  if (
    !record(input)
    || typeof input.method !== "string"
    || typeof input.path !== "string"
    || typeof input.bodyText !== "string"
    || typeof input.timestamp !== "string"
    || typeof input.signature !== "string"
    || input.version !== VIRA_BFF_SIGNATURE_VERSION
    || typeof input.nowEpochSeconds !== "number"
    || !Number.isSafeInteger(input.nowEpochSeconds)
    || input.nowEpochSeconds < 0
    || !canonicalPath(input.path)
  ) return fail("INVALID_SERVER_REQUEST", "BFF server request verification input is invalid");
  const key = keyBuffer(input.key);
  if (!key) return fail("INVALID_SERVER_KEY", "BFF server authentication key must contain at least 256 bits");
  if (!signaturePattern.test(input.signature) || !/^\d{1,12}$/.test(input.timestamp)) {
    return fail("INVALID_SERVER_SIGNATURE", "BFF server request signature metadata is invalid");
  }
  if (Buffer.byteLength(input.bodyText, "utf8") > VIRA_BFF_MAX_BODY_BYTES) return fail("BODY_TOO_LARGE", "BFF server request body exceeds the maximum size");
  const timestamp = Number(input.timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs(input.nowEpochSeconds - timestamp) > 60) {
    return fail("SERVER_REQUEST_EXPIRED", "BFF server request is outside the replay window");
  }
  const method = input.method.toUpperCase();
  if (!allowedMethods.has(method)) return fail("INVALID_SERVER_REQUEST", "BFF server request method is invalid");
  const expected = Buffer.from(createHmac("sha256", key)
    .update(signingInput(method, input.path, input.timestamp, input.bodyText))
    .digest("base64url"));
  const actual = Buffer.from(input.signature);
  if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) {
    return fail("INVALID_SERVER_SIGNATURE", "BFF server request signature does not match");
  }
  return { ok: true, value: true };
}
