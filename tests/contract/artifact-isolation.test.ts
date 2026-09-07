import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createViraPrivateObjectStore,
  type ViraPrivateObjectStoreDriver,
  type ViraPrivateObjectStoreDriverRecord,
} from "../../integrations/object-store/index.js";

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function artifact(bytes: Uint8Array, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1",
    id: "artifact.private.report",
    revision: 1,
    scope: { version: "1", organizationId: "org-a", projectId: "project-a", environment: "staging" },
    digest: sha256(bytes),
    mediaType: "application/pdf",
    byteLength: bytes.byteLength,
    producer: { kind: "application-run", id: "run:private-001", revision: 3 },
    source: { kind: "generated", reference: "run:private-001:step:report" },
    lineage: [],
    classification: "confidential",
    retention: { mode: "ephemeral", policyRef: null, retainUntilUnixMs: 2_000_000_000_000 },
    createdAtUnixMs: 1_900_000_000_000,
    ...overrides,
  };
}

function memoryDriver(): ViraPrivateObjectStoreDriver & { records: Map<string, ViraPrivateObjectStoreDriverRecord> } {
  const records = new Map<string, ViraPrivateObjectStoreDriverRecord>();
  return {
    records,
    putIfAbsent(key, value) {
      const existing = records.get(key);
      if (existing) return { status: "exists", value: existing };
      records.set(key, Object.freeze({ ...value, body: new Uint8Array(value.body) }));
      return { status: "stored" };
    },
    get(key) {
      const value = records.get(key);
      if (!value) return null;
      return Object.freeze({ ...value, body: new Uint8Array(value.body) });
    },
  };
}

describe("PROD-08 private artifact object-store", () => {
  it("stores and reads bytes only through exact tenant/environment-scoped artifact identity", async () => {
    const driver = memoryDriver();
    const created = createViraPrivateObjectStore(driver);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const bytes = new TextEncoder().encode("private report bytes");
    const metadata = artifact(bytes);
    const write = await created.value.put({ artifact: metadata, bytes });
    expect(write).toMatchObject({ ok: true, value: { stored: true } });
    if (!write.ok) return;
    expect(write.value.objectRef).toContain("org-a/project-a/staging/artifact.private.report/1");

    const read = await created.value.get({ scope: metadata.scope, artifact: write.value.artifact });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(new TextDecoder().decode(read.value.bytes)).toBe("private report bytes");

    const foreign = await created.value.get({
      scope: { version: "1", organizationId: "org-b", projectId: "project-a", environment: "staging" },
      artifact: write.value.artifact,
    });
    expect(foreign).toMatchObject({ ok: false, issue: { code: "ARTIFACT_NOT_FOUND" } });
  });

  it("verifies bytes against metadata digest before persistence", async () => {
    const created = createViraPrivateObjectStore(memoryDriver());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const expected = new TextEncoder().encode("expected");
    const tampered = new TextEncoder().encode("tampered");
    const result = await created.value.put({ artifact: artifact(expected), bytes: tampered });
    expect(result).toMatchObject({ ok: false, issue: { code: "DIGEST_MISMATCH" } });
  });

  it("makes an artifact revision immutable even when a caller supplies a new valid digest", async () => {
    const driver = memoryDriver();
    const created = createViraPrivateObjectStore(driver);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const first = new TextEncoder().encode("first immutable body");
    const second = new TextEncoder().encode("second immutable body");
    expect((await created.value.put({ artifact: artifact(first), bytes: first })).ok).toBe(true);
    const conflict = await created.value.put({ artifact: artifact(second), bytes: second });
    expect(conflict).toMatchObject({ ok: false, issue: { code: "ARTIFACT_CONFLICT" } });
  });

  it("returns copies so callers cannot mutate driver-owned stored bytes", async () => {
    const driver = memoryDriver();
    const created = createViraPrivateObjectStore(driver);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const bytes = new TextEncoder().encode("copy-safe");
    const write = await created.value.put({ artifact: artifact(bytes), bytes });
    expect(write.ok).toBe(true);
    if (!write.ok) return;
    const read = await created.value.get({ scope: artifact(bytes).scope, artifact: write.value.artifact });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    read.value.bytes[0] = 0;
    const reread = await created.value.get({ scope: artifact(bytes).scope, artifact: write.value.artifact });
    expect(reread.ok).toBe(true);
    if (!reread.ok) return;
    expect(new TextDecoder().decode(reread.value.bytes)).toBe("copy-safe");
  });
});
