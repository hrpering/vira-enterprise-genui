import { URL } from "node:url";
import type { ViraOidcJsonWebKey } from "./verify.js";

export const VIRA_OIDC_MAX_METADATA_BYTES = 262_144 as const;
export const VIRA_OIDC_MAX_JWKS_BYTES = 524_288 as const;
export const VIRA_OIDC_MAX_JWKS_KEYS = 128 as const;

export interface ViraOidcDiscoveryConfiguration {
  readonly issuer: string;
  readonly expectedJwksUri: string;
}

export interface ViraOidcDiscoveryValue {
  readonly issuer: string;
  readonly jwksUri: string;
  readonly jwks: readonly ViraOidcJsonWebKey[];
}

export type ViraOidcDiscoveryResult =
  | { readonly ok: true; readonly value: ViraOidcDiscoveryValue }
  | { readonly ok: false; readonly issue: { readonly code: string; readonly message: string } };

interface FetchLike {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

function fail(code: string, message: string): ViraOidcDiscoveryResult {
  return { ok: false, issue: Object.freeze({ code, message }) };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalHttpsUrl(value: unknown, allowPath: boolean): string | undefined {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.username !== ""
      || url.password !== ""
      || url.search !== ""
      || url.hash !== ""
      || (!allowPath && url.pathname !== "/")
    ) return undefined;
    return url.href.endsWith("/") && url.pathname === "/" ? url.origin : url.href.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function discoveryUrl(issuer: string): string {
  return `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
}

async function boundedText(response: Response, maxBytes: number): Promise<string | undefined> {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d{1,10}$/.test(declared) || Number(declared) > maxBytes)) return undefined;
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("oidc_response_too_large");
        return undefined;
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total).toString("utf8");
}

async function jsonResponse(
  fetcher: FetchLike,
  url: string,
  maxBytes: number,
): Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly code: string }> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "OIDC_NETWORK_FAILED" };
  }
  if (!response.ok) return { ok: false, code: "OIDC_HTTP_FAILED" };
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json") && !contentType.includes("+json")) {
    return { ok: false, code: "OIDC_CONTENT_TYPE_INVALID" };
  }
  const text = await boundedText(response, maxBytes);
  if (text === undefined || text.length === 0) return { ok: false, code: "OIDC_RESPONSE_TOO_LARGE" };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, code: "OIDC_JSON_INVALID" };
  }
}

function jwkShape(value: unknown): value is ViraOidcJsonWebKey {
  return record(value)
    && typeof value.kid === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/.test(value.kid)
    && typeof value.kty === "string"
    && value.kty.length >= 1
    && value.kty.length <= 32
    && (value.alg === undefined || typeof value.alg === "string")
    && (value.use === undefined || typeof value.use === "string");
}

export async function fetchOidcDiscoveryAndJwks(
  input: unknown,
  fetcher: FetchLike = fetch,
): Promise<ViraOidcDiscoveryResult> {
  if (!record(input) || typeof fetcher !== "function") {
    return fail("INVALID_DISCOVERY_CONFIGURATION", "OIDC discovery input is invalid");
  }
  const issuer = canonicalHttpsUrl(input.issuer, true);
  const expectedJwksUri = canonicalHttpsUrl(input.expectedJwksUri, true);
  if (!issuer || !expectedJwksUri) {
    return fail("INVALID_DISCOVERY_CONFIGURATION", "OIDC issuer or expected JWKS URL is invalid");
  }

  const metadataResult = await jsonResponse(fetcher, discoveryUrl(issuer), VIRA_OIDC_MAX_METADATA_BYTES);
  if (!metadataResult.ok) return fail(metadataResult.code, "OIDC discovery metadata fetch failed closed");
  if (!record(metadataResult.value)) return fail("OIDC_METADATA_INVALID", "OIDC discovery metadata must be an object");
  if (metadataResult.value.issuer !== issuer) return fail("OIDC_ISSUER_MISMATCH", "OIDC discovery issuer does not match configured issuer");
  const discoveredJwksUri = canonicalHttpsUrl(metadataResult.value.jwks_uri, true);
  if (!discoveredJwksUri || discoveredJwksUri !== expectedJwksUri) {
    return fail("OIDC_JWKS_URI_MISMATCH", "OIDC discovery JWKS URL does not match explicit configuration");
  }

  const jwksResult = await jsonResponse(fetcher, expectedJwksUri, VIRA_OIDC_MAX_JWKS_BYTES);
  if (!jwksResult.ok) return fail(jwksResult.code, "OIDC JWKS fetch failed closed");
  if (!record(jwksResult.value) || !Array.isArray(jwksResult.value.keys)) {
    return fail("OIDC_JWKS_INVALID", "OIDC JWKS payload is invalid");
  }
  if (
    jwksResult.value.keys.length < 1
    || jwksResult.value.keys.length > VIRA_OIDC_MAX_JWKS_KEYS
    || !jwksResult.value.keys.every(jwkShape)
  ) return fail("OIDC_JWKS_INVALID", "OIDC JWKS key set is invalid or exceeds limits");
  const kids = jwksResult.value.keys.map((key) => key.kid);
  if (new Set(kids).size !== kids.length) return fail("OIDC_JWKS_INVALID", "OIDC JWKS contains duplicate kid values");

  return {
    ok: true,
    value: Object.freeze({
      issuer,
      jwksUri: expectedJwksUri,
      jwks: Object.freeze(jwksResult.value.keys.map((key) => Object.freeze({ ...key }))),
    }),
  };
}
