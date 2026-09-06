import { describe, expect, it } from "vitest";
import {
  createViraApplicationRunService,
  createViraTriggerInboxService,
  type ViraApplicationRun,
  type ViraApplicationRunStore,
  type ViraApplicationRunStoreMutationResult,
  type ViraTriggerInboxRecord,
  type ViraTriggerInboxStore,
  type ViraTriggerInboxStoreMutationResult,
} from "../../packages/application-runtime/src/index.js";

const DAY_MS = 86_400_000;
const scope = { version: "1", organizationId: "org-demo", projectId: "project-demo", environment: "staging" } as const;
const entrypointRef = { id: "travel.flight.booking-flow", versionRef: "1" } as const;
const distributionDigest = "a".repeat(64);
const resolutionDigest = "b".repeat(64);
const resolutionArtifactDigest = `sha256:${resolutionDigest}`;
const payloadDigest = `sha256:${"c".repeat(64)}`;

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

function resolution() {
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
  };
}

function artifact(id: string, digest: string, byteLength: number) {
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
      retainUntilUnixMs: 2_100_000_000_000,
    },
    createdAtUnixMs: 1_900_000_000_000,
  };
}

function runStore(): ViraApplicationRunStore & { records: Map<string, ViraApplicationRun> } {
  const records = new Map<string, ViraApplicationRun>();
  const key = (itemScope: typeof scope, id: string) =>
    `${itemScope.organizationId}/${itemScope.projectId}/${itemScope.environment}/${id}`;
  return {
    records,
    async read(itemScope, id) { return records.get(key(itemScope as typeof scope, id)); },
    async create(run): Promise<ViraApplicationRunStoreMutationResult> {
      const itemKey = key(run.scope as typeof scope, run.id);
      if (records.has(itemKey)) return { ok: false, code: "ALREADY_EXISTS" };
      records.set(itemKey, run);
      return { ok: true, value: run };
    },
    async replace(run, expectedRevision): Promise<ViraApplicationRunStoreMutationResult> {
      const itemKey = key(run.scope as typeof scope, run.id);
      const current = records.get(itemKey);
      if (!current) return { ok: false, code: "NOT_FOUND" };
      if (current.revision !== expectedRevision) return { ok: false, code: "VERSION_CONFLICT" };
      records.set(itemKey, run);
      return { ok: true, value: run };
    },
  };
}

function triggerStore(): ViraTriggerInboxStore & { records: Map<string, ViraTriggerInboxRecord> } {
  const records = new Map<string, ViraTriggerInboxRecord>();
  const key = (itemScope: typeof scope, sourceRef: string, eventId: string) =>
    `${itemScope.organizationId}/${itemScope.projectId}/${itemScope.environment}/${sourceRef}/${eventId}`;
  return {
    records,
    async read(itemScope, sourceRef, eventId) {
      return records.get(key(itemScope as typeof scope, sourceRef, eventId));
    },
    async create(item): Promise<ViraTriggerInboxStoreMutationResult> {
      const itemKey = key(item.scope as typeof scope, item.sourceRef, item.eventId);
      if (records.has(itemKey)) return { ok: false, code: "ALREADY_EXISTS" };
      records.set(itemKey, item);
      return { ok: true, value: item };
    },
    async replace(item, expectedRevision): Promise<ViraTriggerInboxStoreMutationResult> {
      const itemKey = key(item.scope as typeof scope, item.sourceRef, item.eventId);
      const current = records.get(itemKey);
      if (!current) return { ok: false, code: "NOT_FOUND" };
      if (current.revision !== expectedRevision) return { ok: false, code: "VERSION_CONFLICT" };
      records.set(itemKey, item);
      return { ok: true, value: item };
    },
  };
}

function harness() {
  let now = 1_900_000_000_000;
  const runs = runStore();
  const triggers = triggerStore();
  const run = createViraApplicationRunService({ store: runs, nowUnixMs: () => now });
  const trigger = createViraTriggerInboxService({
    store: triggers,
    nowUnixMs: () => now,
    replayWindowMs: DAY_MS,
    allowedClockSkewMs: 500,
    processingLeaseMs: 1_000,
  });
  if (!run.ok) throw new Error(run.issue.message);
  if (!trigger.ok) throw new Error(trigger.issue.message);
  return {
    run: run.value,
    trigger: trigger.value,
    now: () => now,
    setNow(value: number) { now = value; },
  };
}

function receiveInput(eventId: string, occurredAtUnixMs: number) {
  return {
    scope,
    sourceRef: "webhook:partner:resilience",
    eventId,
    triggerType: "webhook",
    resolution: resolution(),
    entrypointRef,
    resolutionArtifact: artifact("artifact.resolution.resilience", resolutionArtifactDigest, 512),
    payloadArtifact: artifact("artifact.payload.resilience", payloadDigest, 256),
    occurredAtUnixMs,
  };
}

describe("PROD-08 durability resilience evidence", () => {
  it("accepts the exact replay-window boundary and rejects one millisecond older delivery", async () => {
    const runtime = harness();
    const boundary = await runtime.trigger.receive(receiveInput("event:boundary:ok", runtime.now() - DAY_MS));
    expect(boundary).toMatchObject({ ok: true, value: { duplicate: false, record: { status: "pending" } } });

    const expired = await runtime.trigger.receive(receiveInput("event:boundary:expired", runtime.now() - DAY_MS - 1));
    expect(expired).toMatchObject({ ok: false, issue: { code: "REPLAY_EXPIRED", path: "$.occurredAtUnixMs" } });
  });

  it("keeps an accepted early event durable beyond 24h so a later exact-pinned run wait can consume it once", async () => {
    const runtime = harness();
    const base = runtime.now();
    const input = receiveInput("event:early:001", base - 100);
    const received = await runtime.trigger.receive(input);
    if (!received.ok) throw new Error(received.issue.message);
    const earlyPin = received.value.record.resolution;
    expect(received.value.record.status).toBe("pending");

    runtime.setNow(base + DAY_MS + 1);
    const stillPending = await runtime.trigger.read(scope, input.sourceRef, input.eventId);
    expect(stillPending).toMatchObject({ ok: true, value: { revision: 1, status: "pending" } });

    const created = await runtime.run.create({
      id: "run.early.001",
      scope,
      resolution: resolution(),
      entrypointRef,
      workContextId: null,
    });
    if (!created.ok) throw new Error(created.issue.message);
    expect(created.value.resolution).toEqual(earlyPin);
    const waiting = await runtime.run.wait({
      scope,
      id: created.value.id,
      expectedRevision: 1,
      wait: { id: "wait.early.001", kind: "event", reference: input.eventId, dueAtUnixMs: null },
    });
    if (!waiting.ok) throw new Error(waiting.issue.message);

    const claimed = await runtime.trigger.claim({
      scope,
      sourceRef: input.sourceRef,
      eventId: input.eventId,
      expectedRevision: 1,
      processingRef: "worker:resilience:001",
    });
    if (!claimed.ok) throw new Error(claimed.issue.message);
    const completed = await runtime.trigger.complete({
      scope,
      sourceRef: input.sourceRef,
      eventId: input.eventId,
      expectedRevision: 2,
      processingRef: "worker:resilience:001",
      runId: created.value.id,
    });
    expect(completed).toMatchObject({ ok: true, value: { revision: 3, status: "processed", processedRunId: "run.early.001" } });

    const resumed = await runtime.run.resume({
      scope,
      id: created.value.id,
      expectedRevision: waiting.value.revision,
      waitId: waiting.value.wait?.id ?? "",
    });
    expect(resumed).toMatchObject({ ok: true, value: { revision: 3, status: "running", wait: null } });

    expect(await runtime.trigger.complete({
      scope,
      sourceRef: input.sourceRef,
      eventId: input.eventId,
      expectedRevision: 2,
      processingRef: "worker:resilience:001",
      runId: created.value.id,
    })).toMatchObject({ ok: false, issue: { code: "CONFLICT" } });
    expect(await runtime.run.resume({
      scope,
      id: created.value.id,
      expectedRevision: waiting.value.revision,
      waitId: waiting.value.wait?.id ?? "",
    })).toMatchObject({ ok: false, issue: { code: "CONFLICT" } });

    expect(await runtime.trigger.receive(input)).toMatchObject({
      ok: false,
      issue: { code: "REPLAY_EXPIRED", path: "$.occurredAtUnixMs" },
    });
    expect(await runtime.trigger.read(scope, input.sourceRef, input.eventId)).toMatchObject({
      ok: true,
      value: { revision: 3, status: "processed", processedRunId: "run.early.001" },
    });
  });
});
