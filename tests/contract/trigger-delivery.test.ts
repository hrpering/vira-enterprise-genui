import { describe, expect, it } from "vitest";
import {
  VIRA_TRIGGER_PAYLOAD_MAX_BYTES,
  createViraTriggerInboxService,
  type ViraTriggerInboxRecord,
  type ViraTriggerInboxStore,
  type ViraTriggerInboxStoreMutationResult,
} from "../../packages/application-runtime/src/index.js";

const scope = { version: "1", organizationId: "org-demo", projectId: "project-demo", environment: "staging" } as const;
const entrypointRef = { id: "travel.flight.booking-flow", versionRef: "1" } as const;
const distributionDigest = "a".repeat(64);
const resolutionDigest = "b".repeat(64);
const payloadDigest = `sha256:${"c".repeat(64)}`;
const resolutionArtifactDigest = `sha256:${resolutionDigest}`;

function application() {
  return {
    schemaVersion: "2",
    identity: { id: "vira.flight-assistant" },
    version: "1.2.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [{
      id: "travel.flight.search",
      packId: "vira/flight-booking",
      packVersion: "2.1.0",
      entrypoint: "main",
    }],
    capabilities: [{ id: "travel.flight.search-capability", versionRef: "1" }],
    contextTypes: [{ id: "travel.flight.work-context", versionRef: "1" }],
    actions: [{ id: "travel.flight.book", versionRef: "2026-09-05" }],
    flows: [entrypointRef],
    brandRef: { id: "brand.vira", versionRef: "1" },
    governanceRequirements: [{ id: "governance.booking-approval", versionRef: "1" }],
    hostCompatibility: {
      minViraVersion: "1.0.0",
      maxViraVersion: "2.0.0",
      requiredCapabilities: ["host.date-picker"],
    },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    triggers: ["api", "webhook", "schedule", "application-call"].map((type) => ({ type, entrypointRef })),
    distribution: {
      name: "Flight Assistant",
      description: "A governed flight application.",
      tags: ["travel", "booking"],
      visibility: "organization",
      discoverable: true,
    },
    commercial: {
      entitlementRefs: [{ id: "entitlement.flight-assistant", versionRef: "1" }],
      meteringRefs: [{ id: "metering.flight-assistant", versionRef: "1" }],
      pricingRefs: [{ id: "pricing.flight-assistant", versionRef: "1" }],
      settlementRefs: [{ id: "settlement.flight-assistant", versionRef: "1" }],
    },
  };
}

function resolution(overrides: Record<string, unknown> = {}) {
  return {
    artifact: {
      schemaVersion: "1",
      release: { id: "vira.flight-assistant", version: "1.2.0" },
      environment: "staging",
      deploymentId: "deployment:flight:7",
      deploymentRevision: 7,
      artifactId: "application-artifact:flight:1.2.0",
      distributionDigest,
      publisherId: "vira",
      distribution: {
        schemaVersion: "2",
        application: application(),
        integrity: { algorithm: "sha256", digest: distributionDigest },
      },
      provenance: {},
      binding: { scope },
    },
    canonicalArtifact: "{canonical-resolution-artifact}",
    resolutionDigest,
    ...overrides,
  };
}

function artifact(
  id: string,
  digest: string,
  byteLength: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion: "1",
    id,
    revision: 1,
    scope,
    digest,
    mediaType: "application/json",
    byteLength,
    producer: { kind: "system", id: "trigger.ingress", revision: null },
    source: { kind: "provider", reference: "provider:webhook:demo" },
    lineage: [],
    classification: "internal",
    retention: {
      mode: "policy",
      policyRef: "retention.trigger.replay",
      retainUntilUnixMs: 2_000_000_000_000,
    },
    createdAtUnixMs: 1_900_000_000_000,
    ...overrides,
  };
}

function resolutionArtifact(overrides: Record<string, unknown> = {}) {
  return artifact("artifact.trigger.resolution.001", resolutionArtifactDigest, 512, overrides);
}

function payloadArtifact(overrides: Record<string, unknown> = {}) {
  return artifact("artifact.trigger.payload.001", payloadDigest, 256, overrides);
}

function memoryStore(): ViraTriggerInboxStore & { records: Map<string, ViraTriggerInboxRecord> } {
  const records = new Map<string, ViraTriggerInboxRecord>();
  const key = (itemScope: typeof scope, sourceRef: string, eventId: string) =>
    `${itemScope.organizationId}/${itemScope.projectId}/${itemScope.environment}/${sourceRef}/${eventId}`;
  return {
    records,
    async read(itemScope, sourceRef, eventId) {
      return records.get(key(itemScope as typeof scope, sourceRef, eventId));
    },
    async create(item): Promise<ViraTriggerInboxStoreMutationResult> {
      const recordKey = key(item.scope as typeof scope, item.sourceRef, item.eventId);
      if (records.has(recordKey)) return { ok: false, code: "ALREADY_EXISTS" };
      records.set(recordKey, item);
      return { ok: true, value: item };
    },
    async replace(item, expectedRevision): Promise<ViraTriggerInboxStoreMutationResult> {
      const recordKey = key(item.scope as typeof scope, item.sourceRef, item.eventId);
      const current = records.get(recordKey);
      if (!current) return { ok: false, code: "NOT_FOUND" };
      if (current.revision !== expectedRevision) return { ok: false, code: "VERSION_CONFLICT" };
      records.set(recordKey, item);
      return { ok: true, value: item };
    },
  };
}

function harness() {
  let now = 1_900_000_000_000;
  const store = memoryStore();
  const created = createViraTriggerInboxService({
    store,
    nowUnixMs: () => now,
    replayWindowMs: 10_000,
    allowedClockSkewMs: 500,
    processingLeaseMs: 1_000,
  });
  if (!created.ok) throw new Error(created.issue.message);
  return {
    service: created.value,
    store,
    now: () => now,
    setNow(value: number) { now = value; },
  };
}

function receiveInput(
  runtime: ReturnType<typeof harness>,
  overrides: Record<string, unknown> = {},
) {
  return {
    scope,
    sourceRef: "webhook:partner:demo",
    eventId: "event:demo:001",
    triggerType: "webhook",
    resolution: resolution(),
    entrypointRef,
    resolutionArtifact: resolutionArtifact(),
    payloadArtifact: payloadArtifact(),
    occurredAtUnixMs: runtime.now() - 100,
    ...overrides,
  };
}

describe("PROD-08 durable trigger delivery", () => {
  it("accepts all canonical Application V2 trigger types without storing raw payload or full resolution", async () => {
    const runtime = harness();
    for (const [index, triggerType] of ["api", "webhook", "schedule", "application-call"].entries()) {
      const received = await runtime.service.receive(receiveInput(runtime, {
        sourceRef: `source:${triggerType}`,
        eventId: `event:type:${index}`,
        triggerType,
      }));
      expect(received.ok).toBe(true);
      if (!received.ok) continue;
      expect(received.value.duplicate).toBe(false);
      expect(received.value.record.triggerType).toBe(triggerType);
      expect(received.value.record.entrypointRef).toEqual(entrypointRef);
      expect(received.value.record.resolution).toEqual({
        release: { id: "vira.flight-assistant", version: "1.2.0" },
        environment: "staging",
        deploymentId: "deployment:flight:7",
        deploymentRevision: 7,
        artifactId: "application-artifact:flight:1.2.0",
        distributionDigest,
        resolutionDigest,
      });
      expect(received.value.record.resolutionArtifactRef).toEqual({
        id: "artifact.trigger.resolution.001",
        revision: 1,
        digest: resolutionArtifactDigest,
      });
      expect(received.value.record.payloadArtifactRef).toEqual({
        id: "artifact.trigger.payload.001",
        revision: 1,
        digest: payloadDigest,
      });
      expect(received.value.record).not.toHaveProperty("payload");
      expect(received.value.record).not.toHaveProperty("canonicalArtifact");
      expect(received.value.record.resolution).not.toHaveProperty("binding");
      expect(received.value.record.resolution).not.toHaveProperty("distribution");
    }
  });

  it("deduplicates exact source+event delivery but rejects conflicting replay", async () => {
    const runtime = harness();
    const input = receiveInput(runtime);
    const first = await runtime.service.receive(input);
    expect(first).toMatchObject({ ok: true, value: { duplicate: false, record: { revision: 1, status: "pending" } } });
    const duplicate = await runtime.service.receive(input);
    expect(duplicate).toMatchObject({ ok: true, value: { duplicate: true, record: { revision: 1, status: "pending" } } });

    const conflicting = await runtime.service.receive(receiveInput(runtime, {
      payloadArtifact: payloadArtifact({ id: "artifact.trigger.payload.conflict", digest: `sha256:${"d".repeat(64)}` }),
    }));
    expect(conflicting).toMatchObject({ ok: false, issue: { code: "REPLAY_CONFLICT", path: "$.eventId" } });
  });

  it("scopes event-id uniqueness by sourceRef instead of globally", async () => {
    const runtime = harness();
    const first = await runtime.service.receive(receiveInput(runtime, { sourceRef: "webhook:partner:a" }));
    const second = await runtime.service.receive(receiveInput(runtime, { sourceRef: "webhook:partner:b" }));
    expect(first).toMatchObject({ ok: true, value: { duplicate: false } });
    expect(second).toMatchObject({ ok: true, value: { duplicate: false } });
    expect(runtime.store.records.size).toBe(2);
  });

  it("rejects undeclared trigger entrypoints and forged resolution artifact identity", async () => {
    const runtime = harness();
    expect(await runtime.service.receive(receiveInput(runtime, {
      entrypointRef: { id: "travel.flight.missing", versionRef: "1" },
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_TRIGGER" } });

    expect(await runtime.service.receive(receiveInput(runtime, {
      eventId: "event:demo:resolution-mismatch",
      resolutionArtifact: resolutionArtifact({ digest: `sha256:${"e".repeat(64)}` }),
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_RESOLUTION", path: "$.resolutionArtifact" } });
  });

  it("enforces replay age, future clock skew and bounded tenant-scoped payload artifacts", async () => {
    const runtime = harness();
    expect(await runtime.service.receive(receiveInput(runtime, {
      eventId: "event:demo:stale",
      occurredAtUnixMs: runtime.now() - 10_001,
    }))).toMatchObject({ ok: false, issue: { code: "REPLAY_EXPIRED" } });
    expect(await runtime.service.receive(receiveInput(runtime, {
      eventId: "event:demo:future",
      occurredAtUnixMs: runtime.now() + 501,
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT", path: "$.occurredAtUnixMs" } });
    expect(await runtime.service.receive(receiveInput(runtime, {
      eventId: "event:demo:oversized",
      payloadArtifact: payloadArtifact({ byteLength: VIRA_TRIGGER_PAYLOAD_MAX_BYTES + 1 }),
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_PAYLOAD" } });
    expect(await runtime.service.receive(receiveInput(runtime, {
      eventId: "event:demo:cross-scope",
      payloadArtifact: payloadArtifact({
        scope: { ...scope, organizationId: "org-other" },
      }),
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_PAYLOAD" } });
  });

  it("uses revision-safe processing leases and allows takeover only after lease expiry", async () => {
    const runtime = harness();
    const received = await runtime.service.receive(receiveInput(runtime, { eventId: "event:lease:001" }));
    if (!received.ok) throw new Error(received.issue.message);
    const claimed = await runtime.service.claim({
      scope,
      sourceRef: received.value.record.sourceRef,
      eventId: received.value.record.eventId,
      expectedRevision: 1,
      processingRef: "worker:a",
    });
    expect(claimed).toMatchObject({
      ok: true,
      value: { revision: 2, status: "processing", processingRef: "worker:a" },
    });
    if (!claimed.ok || claimed.value.leaseUntilUnixMs === null) return;

    expect(await runtime.service.claim({
      scope,
      sourceRef: claimed.value.sourceRef,
      eventId: claimed.value.eventId,
      expectedRevision: 2,
      processingRef: "worker:b",
    })).toMatchObject({ ok: false, issue: { code: "LEASE_ACTIVE" } });

    runtime.setNow(claimed.value.leaseUntilUnixMs);
    const takeover = await runtime.service.claim({
      scope,
      sourceRef: claimed.value.sourceRef,
      eventId: claimed.value.eventId,
      expectedRevision: 2,
      processingRef: "worker:b",
    });
    expect(takeover).toMatchObject({
      ok: true,
      value: { revision: 3, status: "processing", processingRef: "worker:b" },
    });
  });

  it("rejects completion after lease expiry and requires a revision-safe takeover", async () => {
    const runtime = harness();
    const received = await runtime.service.receive(receiveInput(runtime, { eventId: "event:lease:expired" }));
    if (!received.ok) throw new Error(received.issue.message);
    const claimed = await runtime.service.claim({
      scope,
      sourceRef: received.value.record.sourceRef,
      eventId: received.value.record.eventId,
      expectedRevision: 1,
      processingRef: "worker:expired",
    });
    if (!claimed.ok || claimed.value.leaseUntilUnixMs === null) throw new Error("expected active lease");

    runtime.setNow(claimed.value.leaseUntilUnixMs);
    expect(await runtime.service.complete({
      scope,
      sourceRef: claimed.value.sourceRef,
      eventId: claimed.value.eventId,
      expectedRevision: 2,
      processingRef: "worker:expired",
      runId: "run.trigger.expired",
    })).toMatchObject({ ok: false, issue: { code: "LEASE_MISMATCH" } });

    const takeover = await runtime.service.claim({
      scope,
      sourceRef: claimed.value.sourceRef,
      eventId: claimed.value.eventId,
      expectedRevision: 2,
      processingRef: "worker:takeover",
    });
    expect(takeover).toMatchObject({ ok: true, value: { revision: 3, processingRef: "worker:takeover" } });
    if (!takeover.ok) return;
    expect(await runtime.service.complete({
      scope,
      sourceRef: takeover.value.sourceRef,
      eventId: takeover.value.eventId,
      expectedRevision: 3,
      processingRef: "worker:expired",
      runId: "run.trigger.stale-worker",
    })).toMatchObject({ ok: false, issue: { code: "LEASE_MISMATCH" } });
  });

  it("requires the exact lease owner for release/complete and rejects duplicate completion", async () => {
    const runtime = harness();
    const received = await runtime.service.receive(receiveInput(runtime, { eventId: "event:complete:001" }));
    if (!received.ok) throw new Error(received.issue.message);
    const claimed = await runtime.service.claim({
      scope,
      sourceRef: received.value.record.sourceRef,
      eventId: received.value.record.eventId,
      expectedRevision: 1,
      processingRef: "worker:a",
    });
    if (!claimed.ok) throw new Error(claimed.issue.message);

    expect(await runtime.service.release({
      scope,
      sourceRef: claimed.value.sourceRef,
      eventId: claimed.value.eventId,
      expectedRevision: 2,
      processingRef: "worker:other",
    })).toMatchObject({ ok: false, issue: { code: "LEASE_MISMATCH" } });

    const released = await runtime.service.release({
      scope,
      sourceRef: claimed.value.sourceRef,
      eventId: claimed.value.eventId,
      expectedRevision: 2,
      processingRef: "worker:a",
    });
    expect(released).toMatchObject({ ok: true, value: { revision: 3, status: "pending", processingRef: null } });
    if (!released.ok) return;

    const reclaimed = await runtime.service.claim({
      scope,
      sourceRef: released.value.sourceRef,
      eventId: released.value.eventId,
      expectedRevision: 3,
      processingRef: "worker:b",
    });
    if (!reclaimed.ok) throw new Error(reclaimed.issue.message);

    expect(await runtime.service.complete({
      scope,
      sourceRef: reclaimed.value.sourceRef,
      eventId: reclaimed.value.eventId,
      expectedRevision: 4,
      processingRef: "worker:other",
      runId: "run.trigger.001",
    })).toMatchObject({ ok: false, issue: { code: "LEASE_MISMATCH" } });

    const completed = await runtime.service.complete({
      scope,
      sourceRef: reclaimed.value.sourceRef,
      eventId: reclaimed.value.eventId,
      expectedRevision: 4,
      processingRef: "worker:b",
      runId: "run.trigger.001",
    });
    expect(completed).toMatchObject({
      ok: true,
      value: { revision: 5, status: "processed", processingRef: null, processedRunId: "run.trigger.001" },
    });
    expect(await runtime.service.complete({
      scope,
      sourceRef: reclaimed.value.sourceRef,
      eventId: reclaimed.value.eventId,
      expectedRevision: 4,
      processingRef: "worker:b",
      runId: "run.trigger.001",
    })).toMatchObject({ ok: false, issue: { code: "CONFLICT" } });
  });
});
