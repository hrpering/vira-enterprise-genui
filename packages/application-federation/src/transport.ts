import { isSemanticNamespace } from "@vira-enterprise-genui/protocol";
import { serializeViraApplicationFederationSnapshotV2 } from "./v2-federation.js";
import type { ViraApplicationFederationSourceV2 } from "./v2-types.js";

export const VIRA_APPLICATION_FEDERATION_TRANSPORT_VERSION = "1" as const;
export const VIRA_APPLICATION_FEDERATION_TRANSPORT_MAX_PAGE_SIZE = 128 as const;
export const VIRA_APPLICATION_FEDERATION_TRANSPORT_MAX_CURSOR_LENGTH = 256 as const;

const SHA256_HEX = /^[0-9a-f]{64}$/;
const STRONG_SHA256_ETAG = /^"sha256:[0-9a-f]{64}"$/;
const OPAQUE_CURSOR = /^[A-Za-z0-9_-]+$/;

export interface ViraApplicationFederationTransportRequest {
  readonly version: typeof VIRA_APPLICATION_FEDERATION_TRANSPORT_VERSION;
  readonly sourceId: string;
  readonly cursor: string | null;
  readonly limit: number;
  readonly ifNoneMatch: string | null;
}

export interface ViraApplicationFederationCacheValidator {
  readonly version: typeof VIRA_APPLICATION_FEDERATION_TRANSPORT_VERSION;
  readonly sourceId: string;
  readonly requestCursor: string | null;
  readonly digest: string;
  readonly etag: string;
}

export interface ViraApplicationFederationTransportPageResponse {
  readonly version: typeof VIRA_APPLICATION_FEDERATION_TRANSPORT_VERSION;
  readonly kind: "page";
  readonly sourceId: string;
  readonly requestCursor: string | null;
  readonly nextCursor: string | null;
  readonly applications: readonly unknown[];
  readonly validator: ViraApplicationFederationCacheValidator;
}

export interface ViraApplicationFederationTransportNotModifiedResponse {
  readonly version: typeof VIRA_APPLICATION_FEDERATION_TRANSPORT_VERSION;
  readonly kind: "not-modified";
  readonly sourceId: string;
  readonly requestCursor: string | null;
  readonly validator: ViraApplicationFederationCacheValidator;
}

export type ViraApplicationFederationTransportResponse =
  | ViraApplicationFederationTransportPageResponse
  | ViraApplicationFederationTransportNotModifiedResponse;

export type ViraApplicationFederationTransportDigestProvider = (
  canonicalPage: string,
) => string | Promise<string>;

export interface ViraValidatedApplicationFederationTransportPage {
  readonly version: typeof VIRA_APPLICATION_FEDERATION_TRANSPORT_VERSION;
  readonly kind: "page";
  readonly source: ViraApplicationFederationSourceV2;
  readonly requestCursor: string | null;
  readonly nextCursor: string | null;
  readonly validator: ViraApplicationFederationCacheValidator;
  readonly canonicalPage: string;
}

export interface ViraValidatedApplicationFederationNotModified {
  readonly version: typeof VIRA_APPLICATION_FEDERATION_TRANSPORT_VERSION;
  readonly kind: "not-modified";
  readonly validator: ViraApplicationFederationCacheValidator;
}

export type ViraValidatedApplicationFederationTransport =
  | ViraValidatedApplicationFederationTransportPage
  | ViraValidatedApplicationFederationNotModified;

export type ViraApplicationFederationTransportIssueCode =
  | "INVALID_INPUT"
  | "INVALID_REQUEST"
  | "INVALID_RESPONSE"
  | "SOURCE_MISMATCH"
  | "CURSOR_MISMATCH"
  | "CURSOR_LOOP"
  | "PAGE_LIMIT_EXCEEDED"
  | "EMPTY_PAGE_WITH_CURSOR"
  | "INVALID_PAGE"
  | "INVALID_CACHE_VALIDATOR"
  | "CACHE_VALIDATOR_REQUIRED"
  | "CACHE_VALIDATOR_MISMATCH"
  | "DIGEST_PROVIDER_FAILED"
  | "DIGEST_MISMATCH"
  | "ETAG_MISMATCH";

export interface ViraApplicationFederationTransportIssue {
  readonly code: ViraApplicationFederationTransportIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraApplicationFederationTransportResult =
  | { readonly ok: true; readonly value: ViraValidatedApplicationFederationTransport }
  | { readonly ok: false; readonly issue: ViraApplicationFederationTransportIssue };

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length && actual.every((field, index) => field === expected[index]);
}

function cursor(value: unknown): value is string | null {
  return value === null || (
    typeof value === "string"
    && value.length >= 1
    && value.length <= VIRA_APPLICATION_FEDERATION_TRANSPORT_MAX_CURSOR_LENGTH
    && OPAQUE_CURSOR.test(value)
  );
}

function fail(
  code: ViraApplicationFederationTransportIssueCode,
  path: string,
  message: string,
): ViraApplicationFederationTransportResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function request(value: unknown): value is ViraApplicationFederationTransportRequest {
  return record(value)
    && exactKeys(value, ["version", "sourceId", "cursor", "limit", "ifNoneMatch"])
    && value.version === VIRA_APPLICATION_FEDERATION_TRANSPORT_VERSION
    && typeof value.sourceId === "string"
    && isSemanticNamespace(value.sourceId)
    && cursor(value.cursor)
    && Number.isSafeInteger(value.limit)
    && (value.limit as number) >= 1
    && (value.limit as number) <= VIRA_APPLICATION_FEDERATION_TRANSPORT_MAX_PAGE_SIZE
    && (value.ifNoneMatch === null || (typeof value.ifNoneMatch === "string" && STRONG_SHA256_ETAG.test(value.ifNoneMatch)));
}

function validator(value: unknown): value is ViraApplicationFederationCacheValidator {
  return record(value)
    && exactKeys(value, ["version", "sourceId", "requestCursor", "digest", "etag"])
    && value.version === VIRA_APPLICATION_FEDERATION_TRANSPORT_VERSION
    && typeof value.sourceId === "string"
    && isSemanticNamespace(value.sourceId)
    && cursor(value.requestCursor)
    && typeof value.digest === "string"
    && SHA256_HEX.test(value.digest)
    && typeof value.etag === "string"
    && STRONG_SHA256_ETAG.test(value.etag);
}

function freezeValidator(value: ViraApplicationFederationCacheValidator): ViraApplicationFederationCacheValidator {
  return Object.freeze({
    version: VIRA_APPLICATION_FEDERATION_TRANSPORT_VERSION,
    sourceId: value.sourceId,
    requestCursor: value.requestCursor,
    digest: value.digest,
    etag: value.etag,
  });
}

function sameValidator(
  left: ViraApplicationFederationCacheValidator,
  right: ViraApplicationFederationCacheValidator,
): boolean {
  return left.version === right.version
    && left.sourceId === right.sourceId
    && left.requestCursor === right.requestCursor
    && left.digest === right.digest
    && left.etag === right.etag;
}

function selfConsistentValidator(value: ViraApplicationFederationCacheValidator): boolean {
  return value.etag === `"sha256:${value.digest}"`;
}

function pageResponse(value: unknown): value is ViraApplicationFederationTransportPageResponse {
  return record(value)
    && exactKeys(value, ["version", "kind", "sourceId", "requestCursor", "nextCursor", "applications", "validator"])
    && value.version === VIRA_APPLICATION_FEDERATION_TRANSPORT_VERSION
    && value.kind === "page"
    && typeof value.sourceId === "string"
    && isSemanticNamespace(value.sourceId)
    && cursor(value.requestCursor)
    && cursor(value.nextCursor)
    && Array.isArray(value.applications)
    && validator(value.validator);
}

function notModifiedResponse(value: unknown): value is ViraApplicationFederationTransportNotModifiedResponse {
  return record(value)
    && exactKeys(value, ["version", "kind", "sourceId", "requestCursor", "validator"])
    && value.version === VIRA_APPLICATION_FEDERATION_TRANSPORT_VERSION
    && value.kind === "not-modified"
    && typeof value.sourceId === "string"
    && isSemanticNamespace(value.sourceId)
    && cursor(value.requestCursor)
    && validator(value.validator);
}

export async function validateViraApplicationFederationTransport(input: unknown): Promise<ViraApplicationFederationTransportResult> {
  if (
    !record(input)
    || !exactKeys(input, ["request", "response", "digestProvider", "cachedValidator"])
    || typeof input.digestProvider !== "function"
    || (input.cachedValidator !== null && !validator(input.cachedValidator))
  ) {
    return fail("INVALID_INPUT", "$", "federation transport input must contain exact request/response/digest/cache fields");
  }
  if (!request(input.request)) {
    return fail("INVALID_REQUEST", "$.request", "transport request must use an exact source, bounded page size, opaque cursor and strong cache validator");
  }
  const transportRequest = input.request;
  const cachedValidator = input.cachedValidator;
  const response = input.response;

  if (notModifiedResponse(response)) {
    if (response.sourceId !== transportRequest.sourceId) {
      return fail("SOURCE_MISMATCH", "$.response.sourceId", "not-modified response belongs to another source");
    }
    if (response.requestCursor !== transportRequest.cursor) {
      return fail("CURSOR_MISMATCH", "$.response.requestCursor", "not-modified response belongs to another page cursor");
    }
    if (!selfConsistentValidator(response.validator)) {
      return fail("INVALID_CACHE_VALIDATOR", "$.response.validator", "not-modified validator etag does not bind its sha256 digest");
    }
    if (transportRequest.ifNoneMatch === null || cachedValidator === null) {
      return fail("CACHE_VALIDATOR_REQUIRED", "$.cachedValidator", "not-modified response requires a previously validated exact cache validator");
    }
    if (!selfConsistentValidator(cachedValidator)) {
      return fail("INVALID_CACHE_VALIDATOR", "$.cachedValidator", "cached validator etag does not bind its sha256 digest");
    }
    if (
      cachedValidator.sourceId !== transportRequest.sourceId
      || cachedValidator.requestCursor !== transportRequest.cursor
      || cachedValidator.etag !== transportRequest.ifNoneMatch
      || !sameValidator(response.validator, cachedValidator)
    ) {
      return fail("CACHE_VALIDATOR_MISMATCH", "$.cachedValidator", "cache validator cannot be replayed across a source, cursor or content digest");
    }
    return {
      ok: true,
      value: Object.freeze({
        version: VIRA_APPLICATION_FEDERATION_TRANSPORT_VERSION,
        kind: "not-modified" as const,
        validator: freezeValidator(cachedValidator),
      }),
    };
  }

  if (!pageResponse(response)) {
    return fail("INVALID_RESPONSE", "$.response", "transport response must be an exact page or not-modified response");
  }
  if (response.sourceId !== transportRequest.sourceId) {
    return fail("SOURCE_MISMATCH", "$.response.sourceId", "page response belongs to another source");
  }
  if (response.requestCursor !== transportRequest.cursor) {
    return fail("CURSOR_MISMATCH", "$.response.requestCursor", "page response does not bind the requested cursor");
  }
  if (response.nextCursor !== null && response.nextCursor === transportRequest.cursor) {
    return fail("CURSOR_LOOP", "$.response.nextCursor", "transport cannot return the same cursor as its next page cursor");
  }
  if (response.applications.length > transportRequest.limit) {
    return fail("PAGE_LIMIT_EXCEEDED", "$.response.applications", "transport page exceeds the caller-requested bounded page size");
  }
  if (response.applications.length === 0 && response.nextCursor !== null) {
    return fail("EMPTY_PAGE_WITH_CURSOR", "$.response.nextCursor", "empty transport page cannot advance to a hidden next cursor");
  }
  if (
    response.validator.sourceId !== transportRequest.sourceId
    || response.validator.requestCursor !== transportRequest.cursor
  ) {
    return fail("INVALID_CACHE_VALIDATOR", "$.response.validator", "page validator is not bound to the exact source and request cursor");
  }

  const serialized = serializeViraApplicationFederationSnapshotV2({
    schemaVersion: "2",
    sources: [{ sourceId: response.sourceId, applications: response.applications }],
  });
  if (!serialized.ok || serialized.snapshot.sources.length !== 1) {
    return fail("INVALID_PAGE", "$.response.applications", "transport page failed canonical public Application federation validation");
  }
  const source = serialized.snapshot.sources[0]!;
  const canonicalPage = `{"version":"${VIRA_APPLICATION_FEDERATION_TRANSPORT_VERSION}","sourceId":${JSON.stringify(response.sourceId)},"requestCursor":${JSON.stringify(response.requestCursor)},"nextCursor":${JSON.stringify(response.nextCursor)},"snapshot":${serialized.value}}`;

  let digest: unknown;
  try {
    digest = await (input.digestProvider as ViraApplicationFederationTransportDigestProvider)(canonicalPage);
  } catch {
    return fail("DIGEST_PROVIDER_FAILED", "$.digestProvider", "transport page digest provider failed closed");
  }
  if (typeof digest !== "string" || !SHA256_HEX.test(digest)) {
    return fail("DIGEST_PROVIDER_FAILED", "$.digestProvider", "transport digest provider must return a lowercase sha256 digest");
  }
  if (digest !== response.validator.digest) {
    return fail("DIGEST_MISMATCH", "$.response.validator.digest", "transport page bytes do not match the advertised cache digest");
  }
  if (response.validator.etag !== `"sha256:${digest}"`) {
    return fail("ETAG_MISMATCH", "$.response.validator.etag", "transport etag must be a strong content-addressed sha256 validator");
  }

  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_APPLICATION_FEDERATION_TRANSPORT_VERSION,
      kind: "page" as const,
      source,
      requestCursor: response.requestCursor,
      nextCursor: response.nextCursor,
      validator: freezeValidator(response.validator),
      canonicalPage,
    }),
  };
}
