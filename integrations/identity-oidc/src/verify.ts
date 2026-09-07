import {
  createPublicKey,
  verify as verifySignature,
  type JsonWebKey,
} from "node:crypto";
import { URL } from "node:url";
import type { ViraVerifiedExternalIdentity } from "../../../packages/enterprise-context/src/index.js";

export const VIRA_OIDC_ALLOWED_ALGORITHMS = Object.freeze(["RS256", "ES256", "EdDSA"] as const);
export type ViraOidcAlgorithm = (typeof VIRA_OIDC_ALLOWED_ALGORITHMS)[number];

export interface ViraOidcIssuerConfiguration {
  readonly issuer: string;
  readonly audience: string;
  readonly algorithms: readonly ViraOidcAlgorithm[];
  readonly clockSkewSeconds?: number;
  readonly maxTokenAgeSeconds?: number;
}

export interface ViraOidcJsonWebKey {
  readonly kid: string;
  readonly alg?: string;
  readonly use?: string;
  readonly kty: string;
  readonly [key: string]: unknown;
}

export type ViraOidcVerificationIssueCode =
  | "INVALID_CONFIGURATION"
  | "INVALID_TOKEN"
  | "UNSUPPORTED_ALGORITHM"
  | "KEY_NOT_FOUND"
  | "INVALID_SIGNATURE"
  | "INVALID_ISSUER"
  | "INVALID_AUDIENCE"
  | "INVALID_SUBJECT"
  | "TOKEN_EXPIRED"
  | "TOKEN_NOT_ACTIVE"
  | "TOKEN_ISSUED_IN_FUTURE"
  | "TOKEN_TOO_OLD"
  | "NONCE_MISMATCH";

export interface ViraOidcVerificationIssue {
  readonly code: ViraOidcVerificationIssueCode;
  readonly message: string;
}

export type ViraOidcVerificationResult =
  | { readonly ok: true; readonly value: ViraVerifiedExternalIdentity }
  | { readonly ok: false; readonly issue: ViraOidcVerificationIssue };

const maxJwtLength = 16384;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const kidPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;

function fail(code: ViraOidcVerificationIssueCode, message: string): ViraOidcVerificationResult {
  return { ok: false, issue: Object.freeze({ code, message }) };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function configurationShape(value: unknown): value is ViraOidcIssuerConfiguration {
  return record(value)
    && typeof value.issuer === "string"
    && typeof value.audience === "string"
    && Array.isArray(value.algorithms)
    && value.algorithms.every((algorithm) => typeof algorithm === "string")
    && (value.clockSkewSeconds === undefined || typeof value.clockSkewSeconds === "number")
    && (value.maxTokenAgeSeconds === undefined || typeof value.maxTokenAgeSeconds === "number");
}

function jwkShape(value: unknown): value is ViraOidcJsonWebKey {
  return record(value)
    && typeof value.kid === "string"
    && typeof value.kty === "string"
    && (value.alg === undefined || typeof value.alg === "string")
    && (value.use === undefined || typeof value.use === "string");
}

function decodeJsonSegment(segment: string): Record<string, unknown> | undefined {
  if (!base64UrlPattern.test(segment)) return undefined;
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    return record(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function validHttpsIssuer(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.username === ""
      && url.password === ""
      && url.search === ""
      && url.hash === "";
  } catch {
    return false;
  }
}

function numericDate(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function audiences(value: unknown): readonly string[] | undefined {
  if (typeof value === "string" && value.length > 0 && value.length <= 256) return Object.freeze([value]);
  if (
    Array.isArray(value)
    && value.length > 0
    && value.length <= 16
    && value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 256)
    && new Set(value).size === value.length
  ) return Object.freeze([...value]);
  return undefined;
}

function signatureValid(
  algorithm: ViraOidcAlgorithm,
  signingInput: string,
  signature: Buffer,
  jwk: ViraOidcJsonWebKey,
): boolean {
  try {
    const key = createPublicKey({ key: jwk as JsonWebKey, format: "jwk" });
    if (algorithm === "RS256") return verifySignature("RSA-SHA256", Buffer.from(signingInput), key, signature);
    if (algorithm === "ES256") {
      return verifySignature(
        "SHA256",
        Buffer.from(signingInput),
        { key, dsaEncoding: "ieee-p1363" },
        signature,
      );
    }
    return verifySignature(null, Buffer.from(signingInput), key, signature);
  } catch {
    return false;
  }
}

export function verifyOidcJwt(input: unknown): ViraOidcVerificationResult {
  if (!record(input) || !configurationShape(input.configuration)) {
    return fail("INVALID_CONFIGURATION", "OIDC verification input or issuer configuration is invalid");
  }
  if (!Array.isArray(input.jwks) || input.jwks.length < 1 || input.jwks.length > 128 || !input.jwks.every(jwkShape)) {
    return fail("INVALID_CONFIGURATION", "OIDC JWKS input is invalid");
  }
  if (input.expectedNonce !== undefined && (typeof input.expectedNonce !== "string" || input.expectedNonce.length < 1 || input.expectedNonce.length > 512)) {
    return fail("INVALID_CONFIGURATION", "OIDC expected nonce is invalid");
  }
  if (input.nowEpochSeconds !== undefined && (typeof input.nowEpochSeconds !== "number" || !Number.isSafeInteger(input.nowEpochSeconds) || input.nowEpochSeconds < 0)) {
    return fail("INVALID_CONFIGURATION", "OIDC verification time is invalid");
  }

  const configuration = input.configuration;
  if (
    !validHttpsIssuer(configuration.issuer)
    || configuration.audience.length < 1
    || configuration.audience.length > 256
    || configuration.algorithms.length < 1
    || configuration.algorithms.length > VIRA_OIDC_ALLOWED_ALGORITHMS.length
    || new Set(configuration.algorithms).size !== configuration.algorithms.length
    || configuration.algorithms.some((algorithm) => !VIRA_OIDC_ALLOWED_ALGORITHMS.includes(algorithm))
    || (configuration.clockSkewSeconds !== undefined
      && (!Number.isSafeInteger(configuration.clockSkewSeconds) || configuration.clockSkewSeconds < 0 || configuration.clockSkewSeconds > 300))
    || (configuration.maxTokenAgeSeconds !== undefined
      && (!Number.isSafeInteger(configuration.maxTokenAgeSeconds) || configuration.maxTokenAgeSeconds < 1 || configuration.maxTokenAgeSeconds > 86400))
  ) return fail("INVALID_CONFIGURATION", "OIDC issuer configuration is invalid");

  if (typeof input.token !== "string" || input.token.length < 20 || input.token.length > maxJwtLength) {
    return fail("INVALID_TOKEN", "OIDC JWT is invalid");
  }
  const parts = input.token.split(".");
  if (parts.length !== 3) return fail("INVALID_TOKEN", "OIDC JWT must have three compact JWS segments");
  const [headerSegment, payloadSegment, signatureSegment] = parts;
  if (!headerSegment || !payloadSegment || !signatureSegment || !base64UrlPattern.test(signatureSegment)) {
    return fail("INVALID_TOKEN", "OIDC JWT compact JWS encoding is invalid");
  }

  const header = decodeJsonSegment(headerSegment);
  const claims = decodeJsonSegment(payloadSegment);
  if (!header || !claims) return fail("INVALID_TOKEN", "OIDC JWT header or claims are invalid JSON");
  if (Object.keys(header).some((key) => !["alg", "kid", "typ"].includes(key))) {
    return fail("INVALID_TOKEN", "OIDC JWT protected header contains unsupported fields");
  }

  const algorithm = header.alg;
  if (
    typeof algorithm !== "string"
    || !VIRA_OIDC_ALLOWED_ALGORITHMS.includes(algorithm as ViraOidcAlgorithm)
    || !configuration.algorithms.includes(algorithm as ViraOidcAlgorithm)
  ) return fail("UNSUPPORTED_ALGORITHM", "OIDC JWT algorithm is not allowed");

  if (typeof header.kid !== "string" || !kidPattern.test(header.kid)) {
    return fail("INVALID_TOKEN", "OIDC JWT kid is missing or invalid");
  }
  if (header.typ !== undefined && header.typ !== "JWT" && header.typ !== "at+jwt") {
    return fail("INVALID_TOKEN", "OIDC JWT typ is invalid");
  }

  const matchingKeys = input.jwks.filter((key) =>
    key.kid === header.kid
    && (key.alg === undefined || key.alg === algorithm)
    && (key.use === undefined || key.use === "sig")
  );
  if (matchingKeys.length !== 1) return fail("KEY_NOT_FOUND", "OIDC signing key was not found uniquely");

  const signature = Buffer.from(signatureSegment, "base64url");
  if (!signatureValid(
    algorithm as ViraOidcAlgorithm,
    `${headerSegment}.${payloadSegment}`,
    signature,
    matchingKeys[0]!,
  )) return fail("INVALID_SIGNATURE", "OIDC JWT signature verification failed");

  if (claims.iss !== configuration.issuer) return fail("INVALID_ISSUER", "OIDC issuer does not match");
  if (typeof claims.sub !== "string" || claims.sub.length < 1 || claims.sub.length > 512) {
    return fail("INVALID_SUBJECT", "OIDC subject is invalid");
  }
  const claimAudiences = audiences(claims.aud);
  if (!claimAudiences || !claimAudiences.includes(configuration.audience)) {
    return fail("INVALID_AUDIENCE", "OIDC audience does not include the expected audience");
  }
  if (claimAudiences.length > 1 && (typeof claims.azp !== "string" || claims.azp !== configuration.audience)) {
    return fail("INVALID_AUDIENCE", "OIDC multi-audience token requires matching azp");
  }

  const now = (input.nowEpochSeconds as number | undefined) ?? Math.floor(Date.now() / 1000);
  const skew = configuration.clockSkewSeconds ?? 60;
  const expiresAt = numericDate(claims.exp);
  if (expiresAt === undefined || expiresAt + skew <= now) return fail("TOKEN_EXPIRED", "OIDC JWT is expired");

  const notBefore = claims.nbf === undefined ? undefined : numericDate(claims.nbf);
  if (claims.nbf !== undefined && notBefore === undefined) return fail("INVALID_TOKEN", "OIDC nbf is invalid");
  if (notBefore !== undefined && notBefore - skew > now) return fail("TOKEN_NOT_ACTIVE", "OIDC JWT is not active yet");

  const issuedAt = claims.iat === undefined ? undefined : numericDate(claims.iat);
  if (claims.iat !== undefined && issuedAt === undefined) return fail("INVALID_TOKEN", "OIDC iat is invalid");
  if (issuedAt !== undefined && issuedAt - skew > now) return fail("TOKEN_ISSUED_IN_FUTURE", "OIDC JWT was issued in the future");
  if (configuration.maxTokenAgeSeconds !== undefined) {
    if (issuedAt === undefined || now - issuedAt > configuration.maxTokenAgeSeconds + skew) {
      return fail("TOKEN_TOO_OLD", "OIDC JWT exceeds the configured maximum age");
    }
  }

  if (input.expectedNonce !== undefined && (typeof claims.nonce !== "string" || claims.nonce !== input.expectedNonce)) {
    return fail("NONCE_MISMATCH", "OIDC nonce does not match");
  }

  return {
    ok: true,
    value: Object.freeze({
      version: "1",
      issuer: configuration.issuer,
      subject: claims.sub,
      audience: claimAudiences,
      expiresAt,
      ...(issuedAt === undefined ? {} : { issuedAt }),
      ...(typeof claims.azp === "string" ? { authorizedParty: claims.azp } : {}),
    }),
  };
}
