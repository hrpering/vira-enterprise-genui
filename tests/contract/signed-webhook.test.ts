import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createViraPrivateObjectStore,
  type ViraPrivateObjectStoreDriver,
  type ViraPrivateObjectStoreDriverRecord,
  type ViraPrivateObjectStoreDriverPutResult,
} from "../../integrations/object-store/index.js";
import {
  createViraSignedWebhookReceiver,
  type ViraWebhookSecretResolver,
} from "../../integrations/webhook/index.js";
import { VIRA_TRIGGER_PAYLOAD_MAX_BYTES } from "../../packages/application-runtime/src/index.js";

const scope = { version: "1", organizationId: "org-demo", projectId: "project-demo", environment: "staging" } as const;
const sourceRef = "provider.github.webhook";
const secretRef = {
  version: "1",
  organizationId: "org-demo",
  projectId: "project-demo",
  environment: "staging",
  provider: "secret.kms",
  key: "webhooks/github",
  versionRef: "v1",
} as const;
const keyBytes = new TextEncoder().encode("test-webhook-key-material");

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function signature(body: Uint8Array, key = keyBytes): string {
  return `sha256=${createHmac("sha256", key).update(body).digest("hex")}`;
}

function payloadArtifact(body: Uint8Array, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1",
    id: "artifact.webhook.github.event",
    revision: 1,
    scope: { ...scope },
    digest: sha256(body),
    mediaType: "application/json",
    byteLength: body.byteLength,
    producer: { kind: "provider", id: sourceRef, revision: null },
    source: { kind: "provider", reference: sourceRef },
    lineage: [],
    classification: "confidential",
    retention: { mode: "policy", policyRef: "retention.webhook.payload", retainUntilUnixMs: 2_000_000_000_000 },
    createdAtUnixMs: 1_900_000_000_000,
    ...overrides,
  };
}

function memoryDriver(): ViraPrivateObjectStoreDriver & { records: Map<string, ViraPrivateObjectStoreDriverRecord> } {
  const records = new Map<string, ViraPrivateObjectStoreDriverRecord>();
  return {
    records,
    async putIfAbsent(key, value): Promise<ViraPrivateObjectStoreDriverPutResult> {
      const existing = records.get(key);
      if (existing) return { status: "exists", value: existing };
      records.set(key, value);
      return { status: "stored" };
    },
    async get(key) {
      return records.get(key) ?? null;
    },
  };
}

function harness(resolverOverride?: ViraWebhookSecretResolver) {
  const driver = memoryDriver();
  const store = createViraPrivateObjectStore(driver);
  if (!store.ok) throw new Error(store.issue.message);
  let resolverCalls = 0;
  const resolver: ViraWebhookSecretResolver = resolverOverride ?? {
    resolve(input) {
      resolverCalls += 1;
      expect(input.scope).toEqual(scope);
      expect(input.secretRef).toEqual(secretRef);
      return new Uint8Array(keyBytes);
    },
  };
  const receiver = createViraSignedWebhookReceiver({
    secretResolver: resolver,
    objectStore: store.value,
    nowUnixMs: () => 1_900_000_000_100,
  });
  if (!receiver.ok) throw new Error(receiver.issue.message);
  return { receiver: receiver.value, store: store.value, driver, resolverCalls: () => resolverCalls };
}

function request(body: Uint8Array, overrides: Record<string, unknown> = {}) {
  return {
    scope,
    sourceRef,
    secretRef,
    signature: signature(body),
    body,
    payloadArtifact: payloadArtifact(body),
    ...overrides,
  } as never;
}

describe("PROD-08 signed webhook verification", () => {
  it("verifies HMAC-SHA256 before privately persisting the exact provider payload artifact", async () => {
    const runtime = harness();
    const body = new TextEncoder().encode('{"event":"push","id":42}');
    const result = await runtime.receiver.receive(request(body));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      version: "1",
      sourceRef,
      artifact: { id: "artifact.webhook.github.event", revision: 1, digest: sha256(body) },
      stored: true,
      receivedAtUnixMs: 1_900_000_000_100,
    });
    expect(runtime.resolverCalls()).toBe(1);
    expect(runtime.driver.records.size).toBe(1);
    const receiptJson = JSON.stringify(result.value);
    expect(receiptJson).not.toContain("test-webhook-key-material");
    expect(receiptJson).not.toContain("signature");
    expect(receiptJson).not.toContain("secretRef");

    const read = await runtime.store.get({ scope, artifact: result.value.artifact });
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value.bytes).toEqual(body);
  });

  it("rejects bad signatures before any payload object is persisted", async () => {
    const runtime = harness();
    const body = new TextEncoder().encode('{"event":"bad-signature"}');
    const result = await runtime.receiver.receive(request(body, { signature: `sha256=${"0".repeat(64)}` }));
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_SIGNATURE" } });
    expect(runtime.driver.records.size).toBe(0);
  });

  it("fails closed on cross-scope SecretRef without resolving secret material", async () => {
    const runtime = harness();
    const body = new TextEncoder().encode('{"event":"cross-scope"}');
    const result = await runtime.receiver.receive(request(body, {
      secretRef: { ...secretRef, organizationId: "org-other" },
    }));
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_SECRET_REF" } });
    expect(runtime.resolverCalls()).toBe(0);
    expect(runtime.driver.records.size).toBe(0);
  });

  it("rejects oversized bodies before secret resolution or persistence", async () => {
    const runtime = harness();
    const body = new Uint8Array(VIRA_TRIGGER_PAYLOAD_MAX_BYTES + 1);
    const result = await runtime.receiver.receive(request(body));
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_PAYLOAD", path: "$.body" } });
    expect(runtime.resolverCalls()).toBe(0);
    expect(runtime.driver.records.size).toBe(0);
  });

  it("rejects digest, provider identity and tenant drift after signature verification", async () => {
    const body = new TextEncoder().encode('{"event":"metadata-drift"}');

    const digestRuntime = harness();
    expect(await digestRuntime.receiver.receive(request(body, {
      payloadArtifact: payloadArtifact(body, { digest: `sha256:${"f".repeat(64)}` }),
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_PAYLOAD" } });
    expect(digestRuntime.driver.records.size).toBe(0);

    const providerRuntime = harness();
    expect(await providerRuntime.receiver.receive(request(body, {
      payloadArtifact: payloadArtifact(body, { producer: { kind: "provider", id: "provider.other", revision: null } }),
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_PAYLOAD" } });
    expect(providerRuntime.driver.records.size).toBe(0);

    const scopeRuntime = harness();
    expect(await scopeRuntime.receiver.receive(request(body, {
      payloadArtifact: payloadArtifact(body, { scope: { ...scope, projectId: "project-other" } }),
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_PAYLOAD" } });
    expect(scopeRuntime.driver.records.size).toBe(0);
  });

  it("snapshots mutable request state before awaiting secret resolution", async () => {
    let enterResolver!: () => void;
    let releaseResolver!: () => void;
    const entered = new Promise<void>((resolve) => { enterResolver = resolve; });
    const gate = new Promise<void>((resolve) => { releaseResolver = resolve; });
    const runtime = harness({
      async resolve(input) {
        expect(input.scope).toEqual(scope);
        expect(input.secretRef).toEqual(secretRef);
        enterResolver();
        await gate;
        return new Uint8Array(keyBytes);
      },
    });

    const originalBody = new TextEncoder().encode('{"event":"snapshot","id":7}');
    const mutableBody = new Uint8Array(originalBody);
    const mutableArtifact = payloadArtifact(mutableBody) as {
      scope: { projectId: string };
      digest: string;
      producer: { id: string };
      source: { reference: string };
    };
    const mutableSecretRef = { ...secretRef } as {
      version: "1";
      organizationId: string;
      projectId: string;
      environment: "staging";
      provider: string;
      key: string;
      versionRef: string;
    };
    const mutableScope = { ...scope } as {
      version: "1";
      organizationId: string;
      projectId: string;
      environment: "staging";
    };
    const mutableRequest = {
      scope: mutableScope,
      sourceRef,
      secretRef: mutableSecretRef,
      signature: signature(mutableBody),
      body: mutableBody,
      payloadArtifact: mutableArtifact,
    };

    const pending = runtime.receiver.receive(mutableRequest as never);
    await entered;

    mutableRequest.sourceRef = "provider.attacker.webhook";
    mutableRequest.signature = `sha256=${"0".repeat(64)}`;
    mutableScope.projectId = "project-other";
    mutableSecretRef.organizationId = "org-other";
    mutableBody.fill(0x78);
    mutableArtifact.scope.projectId = "project-other";
    mutableArtifact.digest = sha256(mutableBody);
    mutableArtifact.producer.id = "provider.attacker.webhook";
    mutableArtifact.source.reference = "provider.attacker.webhook";

    releaseResolver();
    const result = await pending;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sourceRef).toBe(sourceRef);
    expect(result.value.payloadArtifact.scope).toEqual(scope);
    expect(result.value.payloadArtifact.producer.id).toBe(sourceRef);
    expect(result.value.payloadArtifact.source.reference).toBe(sourceRef);
    expect(result.value.artifact.digest).toBe(sha256(originalBody));

    const read = await runtime.store.get({ scope, artifact: result.value.artifact });
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value.bytes).toEqual(originalBody);
    expect(runtime.driver.records.size).toBe(1);
  });

  it("fails closed when transient secret resolution throws or returns invalid key material", async () => {
    const body = new TextEncoder().encode('{"event":"resolver-failure"}');
    const throws = harness({ resolve() { throw new Error("vault unavailable"); } });
    expect(await throws.receiver.receive(request(body))).toMatchObject({
      ok: false,
      issue: { code: "SECRET_RESOLUTION_FAILED" },
    });
    expect(throws.driver.records.size).toBe(0);

    const invalid = harness({ resolve() { return new Uint8Array(0); } });
    expect(await invalid.receiver.receive(request(body))).toMatchObject({
      ok: false,
      issue: { code: "SECRET_RESOLUTION_FAILED" },
    });
    expect(invalid.driver.records.size).toBe(0);
  });
});
