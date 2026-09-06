import { describe, expect, it } from "vitest";
import {
  createViraApplicationRunService,
  type ViraApplicationRun,
  type ViraApplicationRunStore,
  type ViraApplicationRunStoreMutationResult,
} from "../../packages/application-runtime/src/index.js";

const scope = { version: "1", organizationId: "org-demo", projectId: "project-demo", environment: "staging" } as const;
const release = { id: "demo.application", version: "1.2.3" } as const;
const entrypointRef = { id: "demo.flow.main", versionRef: "1.0.0" } as const;
const distributionDigest = "a".repeat(64);
const resolutionDigest = "b".repeat(64);

function resolution(overrides: Record<string, unknown> = {}) {
  return {
    artifact: {
      schemaVersion: "1",
      release,
      environment: "staging",
      deploymentId: "deployment:demo:7",
      deploymentRevision: 7,
      artifactId: "application-artifact:demo:1.2.3",
      distributionDigest,
      publisherId: "publisher.demo",
      distribution: {
        schemaVersion: "2",
        application: {
          schemaVersion: "2",
          identity: { id: "demo.application" },
          version: "1.2.3",
          flows: [entrypointRef],
        },
        integrity: { algorithm: "sha256", digest: distributionDigest },
      },
      provenance: {},
      binding: {
        scope,
      },
    },
    canonicalArtifact: "{canonical-resolution-artifact}",
    resolutionDigest,
    ...overrides,
  };
}

function memoryStore(): ViraApplicationRunStore & { records: Map<string, ViraApplicationRun> } {
  const records = new Map<string, ViraApplicationRun>();
  const key = (runScope: typeof scope, id: string) => `${runScope.organizationId}/${runScope.projectId}/${runScope.environment}/${id}`;
  return {
    records,
    async read(runScope, id) {
      return records.get(key(runScope as typeof scope, id));
    },
    async create(run): Promise<ViraApplicationRunStoreMutationResult> {
      const recordKey = key(run.scope as typeof scope, run.id);
      if (records.has(recordKey)) return { ok: false, code: "ALREADY_EXISTS" };
      records.set(recordKey, run);
      return { ok: true, value: run };
    },
    async replace(run, expectedRevision): Promise<ViraApplicationRunStoreMutationResult> {
      const recordKey = key(run.scope as typeof scope, run.id);
      const current = records.get(recordKey);
      if (!current) return { ok: false, code: "NOT_FOUND" };
      if (current.revision !== expectedRevision) return { ok: false, code: "VERSION_CONFLICT" };
      records.set(recordKey, run);
      return { ok: true, value: run };
    },
  };
}

function service(store = memoryStore()) {
  let now = 1_900_000_000_000;
  const result = createViraApplicationRunService({ store, nowUnixMs: () => ++now });
  if (!result.ok) throw new Error(result.issue.message);
  return { service: result.value, store };
}

describe("PROD-08 durable ApplicationRun resume foundation", () => {
  it("pins exact resolution identity without persisting the distribution/binding blob", async () => {
    const runtime = service();
    const created = await runtime.service.create({
      id: "run.demo.001",
      scope,
      resolution: resolution(),
      entrypointRef,
      workContextId: "work.demo.001",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.resolution).toEqual({
      release,
      environment: "staging",
      deploymentId: "deployment:demo:7",
      deploymentRevision: 7,
      artifactId: "application-artifact:demo:1.2.3",
      distributionDigest,
      resolutionDigest,
    });
    expect(created.value).not.toHaveProperty("distribution");
    expect(created.value.resolution).not.toHaveProperty("binding");
    expect(created.value.revision).toBe(1);
    expect(created.value.status).toBe("running");
  });

  it("enters a durable wait then resumes exactly once through CAS revision ownership", async () => {
    const runtime = service();
    const created = await runtime.service.create({ id: "run.demo.002", scope, resolution: resolution(), entrypointRef, workContextId: null });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const waiting = await runtime.service.wait({
      scope,
      id: created.value.id,
      expectedRevision: created.value.revision,
      wait: { id: "wait.demo.001", kind: "event", reference: "event:provider:ready", dueAtUnixMs: null },
    });
    expect(waiting).toMatchObject({ ok: true, value: { revision: 2, status: "waiting", wait: { id: "wait.demo.001" } } });
    if (!waiting.ok) return;

    const first = await runtime.service.resume({ scope, id: waiting.value.id, expectedRevision: 2, waitId: "wait.demo.001" });
    expect(first).toMatchObject({ ok: true, value: { revision: 3, status: "running", wait: null } });

    const duplicate = await runtime.service.resume({ scope, id: waiting.value.id, expectedRevision: 2, waitId: "wait.demo.001" });
    expect(duplicate).toMatchObject({ ok: false, issue: { code: "CONFLICT" } });
  });

  it("preserves the exact release/resolution pin across wait and resume", async () => {
    const runtime = service();
    const created = await runtime.service.create({ id: "run.demo.003", scope, resolution: resolution(), entrypointRef, workContextId: null });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const pin = created.value.resolution;
    const waiting = await runtime.service.wait({
      scope,
      id: created.value.id,
      expectedRevision: 1,
      wait: { id: "wait.demo.timer", kind: "timer", reference: "timer:2026-09-07", dueAtUnixMs: 2_000_000_000_000 },
    });
    expect(waiting.ok).toBe(true);
    if (!waiting.ok) return;
    const resumed = await runtime.service.resume({ scope, id: waiting.value.id, expectedRevision: 2, waitId: "wait.demo.timer" });
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.value.resolution).toEqual(pin);
    expect(Object.isFrozen(resumed.value.resolution)).toBe(true);
  });

  it("rejects scope drift, forged distribution identity and undeclared entrypoints", async () => {
    const runtime = service();
    const crossScope = await runtime.service.create({
      id: "run.demo.004",
      scope: { ...scope, organizationId: "org-other" },
      resolution: resolution(),
      entrypointRef,
      workContextId: null,
    });
    expect(crossScope).toMatchObject({ ok: false, issue: { code: "INVALID_RESOLUTION" } });

    const forged = resolution();
    (forged.artifact.distribution.application.identity as { id: string }).id = "other.application";
    expect(await runtime.service.create({ id: "run.demo.005", scope, resolution: forged, entrypointRef, workContextId: null }))
      .toMatchObject({ ok: false, issue: { code: "INVALID_RESOLUTION" } });

    expect(await runtime.service.create({
      id: "run.demo.006",
      scope,
      resolution: resolution(),
      entrypointRef: { id: "demo.flow.missing", versionRef: "1.0.0" },
      workContextId: null,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_ENTRYPOINT" } });
  });

  it("rejects ambiguous wait timing authority", async () => {
    const runtime = service();
    const created = await runtime.service.create({ id: "run.demo.007", scope, resolution: resolution(), entrypointRef, workContextId: null });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await runtime.service.wait({
      scope,
      id: created.value.id,
      expectedRevision: 1,
      wait: { id: "wait.bad.event", kind: "event", reference: "event:x", dueAtUnixMs: 2_000_000_000_000 },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_WAIT" } });
  });
});
