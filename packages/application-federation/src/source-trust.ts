import {
  serializeViraApplicationDistributionEnvelopeV2,
} from "@vira-enterprise-genui/application-distribution";
import { isSemanticNamespace } from "@vira-enterprise-genui/protocol";
import { parseViraApplicationFederationSnapshotV2 } from "./v2-federation.js";
import type { ViraApplicationFederationSourceV2 } from "./v2-types.js";

export const VIRA_APPLICATION_SOURCE_TRUST_VERSION = "1" as const;
export const VIRA_APPLICATION_SOURCE_TRUST_DIGEST_ALGORITHM = "sha256" as const;
export const VIRA_APPLICATION_SOURCE_TRUST_SIGNATURE_ALGORITHM = "ed25519" as const;

export interface ViraApplicationSourceTrustRecord {
  readonly version: typeof VIRA_APPLICATION_SOURCE_TRUST_VERSION;
  readonly trustId: string;
  readonly sourceId: string;
  readonly publisherId: string;
  readonly keyId: string;
  readonly keyRevision: number;
  readonly validFromEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly revokedAtEpochMs: number | null;
}

export interface ViraApplicationSourceAttestation {
  readonly version: typeof VIRA_APPLICATION_SOURCE_TRUST_VERSION;
  readonly sourceId: string;
  readonly publisherId: string;
  readonly keyId: string;
  readonly keyRevision: number;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly digest: string;
  readonly signature: string;
}

export interface ViraApplicationSourceDigestInput {
  readonly algorithm: typeof VIRA_APPLICATION_SOURCE_TRUST_DIGEST_ALGORITHM;
  readonly sourceId: string;
  readonly publisherId: string;
  readonly canonicalSource: string;
}

export type ViraApplicationSourceDigestProvider = (
  input: ViraApplicationSourceDigestInput,
) => string | Promise<string>;

export interface ViraApplicationSourceSignatureInput {
  readonly algorithm: typeof VIRA_APPLICATION_SOURCE_TRUST_SIGNATURE_ALGORITHM;
  readonly keyId: string;
  readonly keyRevision: number;
  readonly message: string;
  readonly signature: string;
}

export type ViraApplicationSourceSignatureVerifier = (
  input: ViraApplicationSourceSignatureInput,
) => boolean | Promise<boolean>;

export interface ViraAuthenticatedApplicationSource {
  readonly version: typeof VIRA_APPLICATION_SOURCE_TRUST_VERSION;
  readonly source: ViraApplicationFederationSourceV2;
  readonly trustId: string;
  readonly publisherId: string;
  readonly keyId: string;
  readonly keyRevision: number;
  readonly digest: string;
  readonly validUntilEpochMs: number;
}

export type ViraApplicationSourceTrustIssueCode =
  | "INVALID_INPUT"
  | "INVALID_SOURCE"
  | "INVALID_TRUST_RECORD"
  | "INVALID_ATTESTATION"
  | "SOURCE_MISMATCH"
  | "PUBLISHER_MISMATCH"
  | "KEY_MISMATCH"
  | "TRUST_NOT_YET_VALID"
  | "TRUST_EXPIRED"
  | "TRUST_REVOKED"
  | "ATTESTATION_NOT_YET_VALID"
  | "ATTESTATION_EXPIRED"
  | "ATTESTATION_OUTSIDE_TRUST_WINDOW"
  | "INVALID_DIGEST_PROVIDER"
  | "DIGEST_PROVIDER_FAILED"
  | "DIGEST_MISMATCH"
  | "INVALID_SIGNATURE_VERIFIER"
  | "SIGNATURE_VERIFIER_FAILED"
  | "SIGNATURE_INVALID";

export interface ViraApplicationSourceTrustIssue {
  readonly code: ViraApplicationSourceTrustIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraApplicationSourceTrustResult =
  | { readonly ok: true; readonly value: ViraAuthenticatedApplicationSource }
  | { readonly ok: false; readonly issue: ViraApplicationSourceTrustIssue };

const trustKeys = Object.freeze([
  "version", "trustId", "sourceId", "publisherId", "keyId", "keyRevision",
  "validFromEpochMs", "expiresAtEpochMs", "revokedAtEpochMs",
] as const);
const attestationKeys = Object.freeze([
  "version", "sourceId", "publisherId", "keyId", "keyRevision",
  "issuedAtEpochMs", "expiresAtEpochMs", "digest", "signature",
] as const);
const digestPattern = /^[0-9a-f]{64}$/;
const signaturePattern = /^[A-Za-z0-9_-]{16,512}$/;

function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function time(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function fail(code: ViraApplicationSourceTrustIssueCode, path: string, message: string): ViraApplicationSourceTrustResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function trustRecord(value: unknown): value is ViraApplicationSourceTrustRecord {
  return plain(value)
    && exactKeys(value, trustKeys)
    && value.version === VIRA_APPLICATION_SOURCE_TRUST_VERSION
    && typeof value.trustId === "string" && isSemanticNamespace(value.trustId)
    && typeof value.sourceId === "string" && isSemanticNamespace(value.sourceId)
    && typeof value.publisherId === "string" && isSemanticNamespace(value.publisherId)
    && typeof value.keyId === "string" && isSemanticNamespace(value.keyId)
    && Number.isSafeInteger(value.keyRevision) && (value.keyRevision as number) >= 1
    && time(value.validFromEpochMs)
    && time(value.expiresAtEpochMs)
    && (value.validFromEpochMs as number) < (value.expiresAtEpochMs as number)
    && (value.revokedAtEpochMs === null || time(value.revokedAtEpochMs));
}

function attestation(value: unknown): value is ViraApplicationSourceAttestation {
  return plain(value)
    && exactKeys(value, attestationKeys)
    && value.version === VIRA_APPLICATION_SOURCE_TRUST_VERSION
    && typeof value.sourceId === "string" && isSemanticNamespace(value.sourceId)
    && typeof value.publisherId === "string" && isSemanticNamespace(value.publisherId)
    && typeof value.keyId === "string" && isSemanticNamespace(value.keyId)
    && Number.isSafeInteger(value.keyRevision) && (value.keyRevision as number) >= 1
    && time(value.issuedAtEpochMs)
    && time(value.expiresAtEpochMs)
    && (value.issuedAtEpochMs as number) < (value.expiresAtEpochMs as number)
    && typeof value.digest === "string" && digestPattern.test(value.digest)
    && typeof value.signature === "string" && signaturePattern.test(value.signature);
}

function canonicalSource(source: ViraApplicationFederationSourceV2): string | null {
  const serialized: string[] = [];
  for (const envelope of source.applications) {
    const result = serializeViraApplicationDistributionEnvelopeV2(envelope);
    if (!result.ok) return null;
    serialized.push(result.value);
  }
  return `{"sourceId":${JSON.stringify(source.sourceId)},"applications":[${serialized.join(",")}]}`;
}

function signedMessage(
  trust: ViraApplicationSourceTrustRecord,
  evidence: ViraApplicationSourceAttestation,
): string {
  return JSON.stringify({
    version: VIRA_APPLICATION_SOURCE_TRUST_VERSION,
    trustId: trust.trustId,
    sourceId: evidence.sourceId,
    publisherId: evidence.publisherId,
    keyId: evidence.keyId,
    keyRevision: evidence.keyRevision,
    issuedAtEpochMs: evidence.issuedAtEpochMs,
    expiresAtEpochMs: evidence.expiresAtEpochMs,
    digest: evidence.digest,
  });
}

export async function authenticateViraApplicationFederationSourceV2(input: unknown): Promise<ViraApplicationSourceTrustResult> {
  if (!plain(input) || !time(input.nowEpochMs)) {
    return fail("INVALID_INPUT", "$", "authenticated federation source input is invalid");
  }
  if (!trustRecord(input.trust)) return fail("INVALID_TRUST_RECORD", "$.trust", "source trust record is invalid");
  if (!attestation(input.attestation)) return fail("INVALID_ATTESTATION", "$.attestation", "source attestation is invalid");
  if (typeof input.digestProvider !== "function") return fail("INVALID_DIGEST_PROVIDER", "$.digestProvider", "digest provider is required");
  if (typeof input.signatureVerifier !== "function") return fail("INVALID_SIGNATURE_VERIFIER", "$.signatureVerifier", "signature verifier is required");

  const snapshot = parseViraApplicationFederationSnapshotV2({
    schemaVersion: "2",
    sources: [input.source],
  });
  if (!snapshot.ok || snapshot.value.sources.length !== 1) {
    return fail("INVALID_SOURCE", "$.source", "federation source failed canonical validation");
  }
  const source = snapshot.value.sources[0]!;
  const trust = input.trust;
  const evidence = input.attestation;
  const now = input.nowEpochMs;

  if (source.sourceId !== trust.sourceId || evidence.sourceId !== trust.sourceId) {
    return fail("SOURCE_MISMATCH", "$.source.sourceId", "source id does not match trusted source identity");
  }
  if (evidence.publisherId !== trust.publisherId) {
    return fail("PUBLISHER_MISMATCH", "$.attestation.publisherId", "attested publisher does not match source trust record");
  }
  if (evidence.keyId !== trust.keyId || evidence.keyRevision !== trust.keyRevision) {
    return fail("KEY_MISMATCH", "$.attestation.keyId", "attestation key id/revision does not match the active trusted key");
  }
  if (now < trust.validFromEpochMs) return fail("TRUST_NOT_YET_VALID", "$.trust.validFromEpochMs", "source trust is not yet valid");
  if (now >= trust.expiresAtEpochMs) return fail("TRUST_EXPIRED", "$.trust.expiresAtEpochMs", "source trust has expired");
  if (trust.revokedAtEpochMs !== null && trust.revokedAtEpochMs <= now) {
    return fail("TRUST_REVOKED", "$.trust.revokedAtEpochMs", "source trust has been revoked");
  }
  if (evidence.issuedAtEpochMs > now) return fail("ATTESTATION_NOT_YET_VALID", "$.attestation.issuedAtEpochMs", "source attestation is from the future");
  if (now >= evidence.expiresAtEpochMs) return fail("ATTESTATION_EXPIRED", "$.attestation.expiresAtEpochMs", "source attestation has expired");
  if (evidence.issuedAtEpochMs < trust.validFromEpochMs || evidence.expiresAtEpochMs > trust.expiresAtEpochMs) {
    return fail("ATTESTATION_OUTSIDE_TRUST_WINDOW", "$.attestation", "source attestation exceeds the trusted key window");
  }

  const canonical = canonicalSource(source);
  if (canonical === null) return fail("INVALID_SOURCE", "$.source", "canonical source serialization failed");
  let digest: unknown;
  try {
    digest = await (input.digestProvider as ViraApplicationSourceDigestProvider)({
      algorithm: VIRA_APPLICATION_SOURCE_TRUST_DIGEST_ALGORITHM,
      sourceId: source.sourceId,
      publisherId: trust.publisherId,
      canonicalSource: canonical,
    });
  } catch {
    return fail("DIGEST_PROVIDER_FAILED", "$.digestProvider", "source digest provider failed");
  }
  if (typeof digest !== "string" || !digestPattern.test(digest)) {
    return fail("DIGEST_PROVIDER_FAILED", "$.digestProvider", "source digest provider returned an invalid sha256 digest");
  }
  if (digest !== evidence.digest) return fail("DIGEST_MISMATCH", "$.attestation.digest", "source bytes do not match the signed attestation digest");

  let verified: unknown;
  try {
    verified = await (input.signatureVerifier as ViraApplicationSourceSignatureVerifier)({
      algorithm: VIRA_APPLICATION_SOURCE_TRUST_SIGNATURE_ALGORITHM,
      keyId: trust.keyId,
      keyRevision: trust.keyRevision,
      message: signedMessage(trust, evidence),
      signature: evidence.signature,
    });
  } catch {
    return fail("SIGNATURE_VERIFIER_FAILED", "$.signatureVerifier", "source signature verifier failed");
  }
  if (verified !== true) return fail("SIGNATURE_INVALID", "$.attestation.signature", "source attestation signature is invalid");

  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_APPLICATION_SOURCE_TRUST_VERSION,
      source,
      trustId: trust.trustId,
      publisherId: trust.publisherId,
      keyId: trust.keyId,
      keyRevision: trust.keyRevision,
      digest,
      validUntilEpochMs: Math.min(trust.expiresAtEpochMs, evidence.expiresAtEpochMs),
    }),
  };
}
