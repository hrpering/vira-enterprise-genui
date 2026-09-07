import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  authenticateViraApplicationFederationSourceV2,
  type ViraApplicationSourceAttestation,
  type ViraApplicationSourceTrustRecord,
} from "../../packages/application-federation/src/index.js";

const now = 2_000_000_000_000;
const source = Object.freeze({ sourceId: "source.acme", applications: Object.freeze([]) });
const trust: ViraApplicationSourceTrustRecord = Object.freeze({
  version: "1",
  trustId: "trust.source.acme",
  sourceId: "source.acme",
  publisherId: "publisher.acme",
  keyId: "key.publisher.acme",
  keyRevision: 4,
  validFromEpochMs: now - 60_000,
  expiresAtEpochMs: now + 3_600_000,
  revokedAtEpochMs: null,
});

const digestProvider = vi.fn(({ canonicalSource }: { canonicalSource: string }) =>
  createHash("sha256").update(canonicalSource).digest("hex"));

async function attestation(overrides: Partial<ViraApplicationSourceAttestation> = {}): Promise<ViraApplicationSourceAttestation> {
  const digest = createHash("sha256")
    .update('{"sourceId":"source.acme","applications":[]}')
    .digest("hex");
  return Object.freeze({
    version: "1",
    sourceId: "source.acme",
    publisherId: "publisher.acme",
    keyId: "key.publisher.acme",
    keyRevision: 4,
    issuedAtEpochMs: now - 1_000,
    expiresAtEpochMs: now + 60_000,
    digest,
    signature: "c2lnbmVkLXNvdXJjZS1hdHRlc3RhdGlvbg",
    ...overrides,
  });
}

async function authenticate(
  options: {
    trust?: ViraApplicationSourceTrustRecord;
    evidence?: ViraApplicationSourceAttestation;
    source?: unknown;
    signatureResult?: boolean;
  } = {},
) {
  const signatureVerifier = vi.fn((input: { message: string; keyId: string; keyRevision: number }) => {
    expect(input.message).toContain('"trustId":"trust.source.acme"');
    expect(input.keyId).toBe("key.publisher.acme");
    expect(input.keyRevision).toBe(4);
    return options.signatureResult ?? true;
  });
  return authenticateViraApplicationFederationSourceV2({
    source: options.source ?? source,
    trust: options.trust ?? trust,
    attestation: options.evidence ?? await attestation(),
    nowEpochMs: now,
    digestProvider,
    signatureVerifier,
  });
}

describe("PROD-19A authenticated Application federation source admission", () => {
  it("admits only a canonical source whose digest and detached signature bind to the active publisher key revision", async () => {
    const result = await authenticate();
    expect(result).toMatchObject({
      ok: true,
      value: {
        version: "1",
        trustId: "trust.source.acme",
        publisherId: "publisher.acme",
        keyId: "key.publisher.acme",
        keyRevision: 4,
      },
    });
    if (!result.ok) return;
    expect(result.value.source).toEqual(source);
    expect(result.value.validUntilEpochMs).toBe(now + 60_000);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect("execute" in result.value).toBe(false);
    expect("credential" in result.value).toBe(false);
  });

  it("fails closed on key rotation drift rather than accepting a stale key revision", async () => {
    const evidence = await attestation({ keyRevision: 3 });
    expect(await authenticate({ evidence })).toMatchObject({ ok: false, issue: { code: "KEY_MISMATCH" } });
  });

  it("fails closed on source-id or publisher replay", async () => {
    expect(await authenticate({ source: { sourceId: "source.other", applications: [] } }))
      .toMatchObject({ ok: false, issue: { code: "SOURCE_MISMATCH" } });
    const publisherReplay = await attestation({ publisherId: "publisher.other" });
    expect(await authenticate({ evidence: publisherReplay }))
      .toMatchObject({ ok: false, issue: { code: "PUBLISHER_MISMATCH" } });
  });

  it("rejects revoked or expired trust independently of a valid signature", async () => {
    expect(await authenticate({ trust: { ...trust, revokedAtEpochMs: now - 1 } }))
      .toMatchObject({ ok: false, issue: { code: "TRUST_REVOKED" } });
    expect(await authenticate({ trust: { ...trust, expiresAtEpochMs: now } }))
      .toMatchObject({ ok: false, issue: { code: "TRUST_EXPIRED" } });
  });

  it("rejects attestation validity that escapes the trusted key window", async () => {
    const evidence = await attestation({ expiresAtEpochMs: trust.expiresAtEpochMs + 1 });
    expect(await authenticate({ evidence })).toMatchObject({
      ok: false,
      issue: { code: "ATTESTATION_OUTSIDE_TRUST_WINDOW" },
    });
  });

  it("rejects changed source bytes and invalid signatures without fallback", async () => {
    const evidence = await attestation({ digest: "f".repeat(64) });
    expect(await authenticate({ evidence })).toMatchObject({ ok: false, issue: { code: "DIGEST_MISMATCH" } });
    expect(await authenticate({ signatureResult: false })).toMatchObject({ ok: false, issue: { code: "SIGNATURE_INVALID" } });
  });

  it("keeps source conflict/discoverability/bounds with the canonical federation parser", async () => {
    expect(await authenticate({ source: { sourceId: "not valid", applications: [] } }))
      .toMatchObject({ ok: false, issue: { code: "INVALID_SOURCE" } });
  });
});
