import { describe, expect, it } from "vitest";
import {
  parseViraArtifactMetadata,
  parseViraArtifactRevisionReference,
} from "../../packages/artifact-contract/src/index.js";

const digestA = `sha256:${"a".repeat(64)}`;
const digestB = `sha256:${"b".repeat(64)}`;

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1",
    id: "artifact.report.final",
    revision: 2,
    scope: { version: "1", organizationId: "org-demo", projectId: "project-demo", environment: "staging" },
    digest: digestA,
    mediaType: "application/pdf",
    byteLength: 2048,
    producer: { kind: "application-run", id: "run:demo-001", revision: 7 },
    source: { kind: "derived", reference: "run:demo-001:step:summary" },
    lineage: [{ id: "artifact.report.source", revision: 1, digest: digestB }],
    classification: "confidential",
    retention: { mode: "policy", policyRef: "retention.project.standard", retainUntilUnixMs: 2_000_000_000_000 },
    createdAtUnixMs: 1_900_000_000_000,
    ...overrides,
  };
}

describe("PROD-08 artifact contract", () => {
  it("accepts tenant-scoped immutable exact artifact metadata and freezes nested authority fields", () => {
    const result = parseViraArtifactMetadata(artifact());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.scope).toEqual({
      version: "1",
      organizationId: "org-demo",
      projectId: "project-demo",
      environment: "staging",
    });
    expect(result.value.lineage).toEqual([{ id: "artifact.report.source", revision: 1, digest: digestB }]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.scope)).toBe(true);
    expect(Object.isFrozen(result.value.producer)).toBe(true);
    expect(Object.isFrozen(result.value.source)).toBe(true);
    expect(Object.isFrozen(result.value.lineage)).toBe(true);
    expect(Object.isFrozen(result.value.lineage[0])).toBe(true);
    expect(Object.isFrozen(result.value.retention)).toBe(true);
  });

  it("owns exact standalone revision-reference parsing for downstream durable stores", () => {
    const parsed = parseViraArtifactRevisionReference({
      id: "artifact.report.source",
      revision: 7,
      digest: digestB,
    });
    expect(parsed).toEqual({
      ok: true,
      value: { id: "artifact.report.source", revision: 7, digest: digestB },
    });
    if (parsed.ok) expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(parseViraArtifactRevisionReference({ id: "artifact.report.source", revision: 0, digest: digestB }))
      .toMatchObject({ ok: false, issue: { code: "INVALID_REVISION", path: "$.revision" } });
    expect(parseViraArtifactRevisionReference({ id: "artifact.report.source", revision: 1, digest: "sha256:latest" }))
      .toMatchObject({ ok: false, issue: { code: "INVALID_DIGEST", path: "$.digest" } });
    expect(parseViraArtifactRevisionReference({ id: "artifact.report.source", revision: 1, digest: digestB, url: "https://example.invalid" }))
      .toMatchObject({ ok: false, issue: { code: "UNKNOWN_FIELD", path: "$.url" } });
  });

  it("rejects raw bytes, secret-like extra fields and malformed tenant scope fail-closed", () => {
    expect(parseViraArtifactMetadata(artifact({ bytes: "base64-payload" }))).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.bytes" },
    });
    expect(parseViraArtifactMetadata(artifact({ secretValue: "never" }))).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.secretValue" },
    });
    expect(parseViraArtifactMetadata(artifact({
      scope: { version: "1", organizationId: "ORG BAD", projectId: "project-demo", environment: "staging" },
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_SCOPE" } });
  });

  it("pins lineage to exact immutable revisions and digests", () => {
    expect(parseViraArtifactMetadata(artifact({
      lineage: [{ id: "artifact.report.source", revision: 1, digest: "sha256:latest" }],
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_LINEAGE" } });
    expect(parseViraArtifactMetadata(artifact({
      lineage: [
        { id: "artifact.report.source", revision: 1, digest: digestB },
        { id: "artifact.report.source", revision: 1, digest: digestB },
      ],
    }))).toMatchObject({ ok: false, issue: { code: "DUPLICATE_LINEAGE" } });
    expect(parseViraArtifactMetadata(artifact({
      lineage: [{ id: "artifact.report.final", revision: 2, digest: digestA }],
    }))).toMatchObject({ ok: false, issue: { code: "SELF_LINEAGE" } });
  });

  it("requires derived artifacts to identify exact lineage", () => {
    expect(parseViraArtifactMetadata(artifact({ lineage: [] }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_LINEAGE" },
    });
  });

  it("enforces classification and retention semantics", () => {
    expect(parseViraArtifactMetadata(artifact({ classification: "secret-ish" }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CLASSIFICATION" },
    });
    expect(parseViraArtifactMetadata(artifact({
      retention: { mode: "policy", policyRef: null, retainUntilUnixMs: 2_000_000_000_000 },
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_RETENTION" } });
    expect(parseViraArtifactMetadata(artifact({
      retention: { mode: "permanent", policyRef: null, retainUntilUnixMs: 2_000_000_000_000 },
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_RETENTION" } });
  });
});
