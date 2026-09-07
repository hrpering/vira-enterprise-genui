import { describe, expect, it, vi } from "vitest";
import {
  validateViraApplicationFederationTransport,
  type ViraApplicationFederationCacheValidator,
} from "../../packages/application-federation/src/index.js";

const digest = "a".repeat(64);
const validator: ViraApplicationFederationCacheValidator = Object.freeze({
  version: "1",
  sourceId: "source.acme",
  requestCursor: null,
  digest,
  etag: `"sha256:${digest}"`,
});

const request = Object.freeze({
  version: "1" as const,
  sourceId: "source.acme",
  cursor: null,
  limit: 2,
  ifNoneMatch: null,
});

function page(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    kind: "page",
    sourceId: "source.acme",
    requestCursor: null,
    nextCursor: null,
    applications: [],
    validator,
    ...overrides,
  };
}

function digestProvider() {
  return vi.fn((canonicalPage: string) => {
    expect(canonicalPage).toContain('"sourceId":"source.acme"');
    expect(canonicalPage).toContain('"snapshot":{"schemaVersion":"2"');
    return digest;
  });
}

async function validate(options: {
  request?: unknown;
  response?: unknown;
  cachedValidator?: unknown;
  digestProvider?: unknown;
} = {}) {
  return validateViraApplicationFederationTransport({
    request: options.request ?? request,
    response: options.response ?? page(),
    cachedValidator: options.cachedValidator ?? null,
    digestProvider: options.digestProvider ?? digestProvider(),
  });
}

describe("PROD-19B bounded Application federation transport", () => {
  it("accepts a canonical bounded page only when its digest and strong etag bind the exact source/cursor bytes", async () => {
    const result = await validate();
    expect(result).toMatchObject({
      ok: true,
      value: {
        version: "1",
        kind: "page",
        requestCursor: null,
        nextCursor: null,
        validator,
        source: { sourceId: "source.acme", applications: [] },
      },
    });
    if (!result.ok || result.value.kind !== "page") return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.validator)).toBe(true);
    expect("execute" in result.value).toBe(false);
    expect("credential" in result.value).toBe(false);
  });

  it("rejects source replay and page-cursor substitution before cache acceptance", async () => {
    expect(await validate({ response: page({ sourceId: "source.other" }) }))
      .toMatchObject({ ok: false, issue: { code: "SOURCE_MISMATCH" } });

    const cursorRequest = { ...request, cursor: "cursorA" };
    expect(await validate({
      request: cursorRequest,
      response: page({ requestCursor: "cursorB", validator: { ...validator, requestCursor: "cursorB" } }),
    })).toMatchObject({ ok: false, issue: { code: "CURSOR_MISMATCH" } });
  });

  it("enforces caller page bounds before parsing hidden oversized content", async () => {
    expect(await validate({
      request: { ...request, limit: 1 },
      response: page({ applications: [null, null] }),
    })).toMatchObject({ ok: false, issue: { code: "PAGE_LIMIT_EXCEEDED" } });
  });

  it("rejects cursor loops and empty pages that advance to a hidden cursor", async () => {
    const cursorRequest = { ...request, cursor: "cursorA" };
    expect(await validate({
      request: cursorRequest,
      response: page({
        requestCursor: "cursorA",
        nextCursor: "cursorA",
        validator: { ...validator, requestCursor: "cursorA" },
      }),
    })).toMatchObject({ ok: false, issue: { code: "CURSOR_LOOP" } });

    expect(await validate({ response: page({ nextCursor: "cursorB" }) }))
      .toMatchObject({ ok: false, issue: { code: "EMPTY_PAGE_WITH_CURSOR" } });
  });

  it("rejects cache poisoning when page bytes, digest or strong etag drift", async () => {
    expect(await validate({
      response: page({ validator: { ...validator, digest: "b".repeat(64), etag: `"sha256:${"b".repeat(64)}"` } }),
    })).toMatchObject({ ok: false, issue: { code: "DIGEST_MISMATCH" } });

    expect(await validate({
      response: page({ validator: { ...validator, etag: `"sha256:${"b".repeat(64)}"` } }),
    })).toMatchObject({ ok: false, issue: { code: "ETAG_MISMATCH" } });
  });

  it("accepts not-modified only against the same previously validated source/cursor/content validator", async () => {
    const conditionalRequest = { ...request, ifNoneMatch: validator.etag };
    const response = {
      version: "1",
      kind: "not-modified",
      sourceId: "source.acme",
      requestCursor: null,
      validator,
    };
    const result = await validate({ request: conditionalRequest, response, cachedValidator: validator });
    expect(result).toMatchObject({ ok: true, value: { kind: "not-modified", validator } });
  });

  it("fails closed when a 304-style response has no cache proof or replays another cache entry", async () => {
    const conditionalRequest = { ...request, ifNoneMatch: validator.etag };
    const response = {
      version: "1",
      kind: "not-modified",
      sourceId: "source.acme",
      requestCursor: null,
      validator,
    };
    expect(await validate({ request: conditionalRequest, response }))
      .toMatchObject({ ok: false, issue: { code: "CACHE_VALIDATOR_REQUIRED" } });

    const replayed = { ...validator, sourceId: "source.other" };
    expect(await validate({ request: conditionalRequest, response, cachedValidator: replayed }))
      .toMatchObject({ ok: false, issue: { code: "CACHE_VALIDATOR_MISMATCH" } });
  });
});
