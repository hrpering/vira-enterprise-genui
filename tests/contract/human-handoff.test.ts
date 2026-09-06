import { describe, expect, it } from "vitest";
import {
  createViraApplicationRunService,
  createViraHumanTaskService,
  type ViraApplicationRun,
  type ViraApplicationRunStore,
  type ViraApplicationRunStoreMutationResult,
  type ViraHumanTask,
  type ViraHumanTaskStore,
  type ViraHumanTaskStoreMutationResult,
} from "../../packages/application-runtime/src/index.js";

const scope = { version: "1", organizationId: "org-demo", projectId: "project-demo", environment: "staging" } as const;
const release = { id: "demo.application", version: "1.2.3" } as const;
const entrypointRef = { id: "demo.flow.main", versionRef: "1.0.0" } as const;
const distributionDigest = "a".repeat(64);
const resolutionDigest = "b".repeat(64);
const alice = { version: "1", kind: "user", id: "user:alice", organizationId: "org-demo" } as const;
const bob = { version: "1", kind: "user", id: "user:bob", organizationId: "org-demo" } as const;
const carol = { version: "1", kind: "user", id: "user:carol", organizationId: "org-demo" } as const;

function resolution() {
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
      binding: { scope },
    },
    canonicalArtifact: "{canonical-resolution-artifact}",
    resolutionDigest,
  };
}

function runStore(): ViraApplicationRunStore & { records: Map<string, ViraApplicationRun> } {
  const records = new Map<string, ViraApplicationRun>();
  const key = (runScope: typeof scope, id: string) => `${runScope.organizationId}/${runScope.projectId}/${runScope.environment}/${id}`;
  return {
    records,
    async read(runScope, id) { return records.get(key(runScope as typeof scope, id)); },
    async create(run): Promise<ViraApplicationRunStoreMutationResult> {
      const k = key(run.scope as typeof scope, run.id);
      if (records.has(k)) return { ok: false, code: "ALREADY_EXISTS" };
      records.set(k, run);
      return { ok: true, value: run };
    },
    async replace(run, expectedRevision): Promise<ViraApplicationRunStoreMutationResult> {
      const k = key(run.scope as typeof scope, run.id);
      const current = records.get(k);
      if (!current) return { ok: false, code: "NOT_FOUND" };
      if (current.revision !== expectedRevision) return { ok: false, code: "VERSION_CONFLICT" };
      records.set(k, run);
      return { ok: true, value: run };
    },
  };
}

function taskStore(): ViraHumanTaskStore & { records: Map<string, ViraHumanTask> } {
  const records = new Map<string, ViraHumanTask>();
  const key = (taskScope: typeof scope, id: string) => `${taskScope.organizationId}/${taskScope.projectId}/${taskScope.environment}/${id}`;
  return {
    records,
    async read(taskScope, id) { return records.get(key(taskScope as typeof scope, id)); },
    async create(task): Promise<ViraHumanTaskStoreMutationResult> {
      const k = key(task.scope as typeof scope, task.id);
      if (records.has(k)) return { ok: false, code: "ALREADY_EXISTS" };
      records.set(k, task);
      return { ok: true, value: task };
    },
    async replace(task, expectedRevision): Promise<ViraHumanTaskStoreMutationResult> {
      const k = key(task.scope as typeof scope, task.id);
      const current = records.get(k);
      if (!current) return { ok: false, code: "NOT_FOUND" };
      if (current.revision !== expectedRevision) return { ok: false, code: "VERSION_CONFLICT" };
      records.set(k, task);
      return { ok: true, value: task };
    },
  };
}

function harness() {
  let now = 1_900_000_000_000;
  const runs = runStore();
  const tasks = taskStore();
  const runResult = createViraApplicationRunService({ store: runs, nowUnixMs: () => now });
  if (!runResult.ok) throw new Error(runResult.issue.message);
  const taskResult = createViraHumanTaskService({ store: tasks, runService: runResult.value, nowUnixMs: () => now });
  if (!taskResult.ok) throw new Error(taskResult.issue.message);
  return {
    runService: runResult.value,
    taskService: taskResult.value,
    runs,
    tasks,
    now: () => now,
    setNow(value: number) { now = value; },
  };
}

async function waitingHumanRun(runtime: ReturnType<typeof harness>, runId: string, taskId: string) {
  const created = await runtime.runService.create({ id: runId, scope, resolution: resolution(), entrypointRef, workContextId: null });
  if (!created.ok) throw new Error(created.issue.message);
  const waiting = await runtime.runService.wait({
    scope,
    id: runId,
    expectedRevision: created.value.revision,
    wait: { id: `wait.${taskId}`, kind: "human-task", reference: taskId, dueAtUnixMs: null },
  });
  if (!waiting.ok) throw new Error(waiting.issue.message);
  return waiting.value;
}

describe("PROD-08 Human Task durable handoff", () => {
  it("assigns only from the exact waiting human-task run and retries assignment idempotently", async () => {
    const runtime = harness();
    const waiting = await waitingHumanRun(runtime, "run.handoff.001", "task.handoff.001");
    const input = {
      scope,
      id: "task.handoff.001",
      runId: waiting.id,
      expectedRunRevision: waiting.revision,
      assignee: alice,
      escalateAtUnixMs: runtime.now() + 100,
      expiresAtUnixMs: runtime.now() + 1_000,
    };
    const assigned = await runtime.taskService.assign(input);
    expect(assigned).toMatchObject({
      ok: true,
      value: {
        revision: 1,
        status: "assigned",
        runId: waiting.id,
        runRevision: waiting.revision,
        waitId: "wait.task.handoff.001",
        assignee: alice,
        claimant: null,
      },
    });
    if (!assigned.ok) return;
    expect(Object.isFrozen(assigned.value.assignee)).toBe(true);
    const retry = await runtime.taskService.assign(input);
    expect(retry).toMatchObject({ ok: true, value: { revision: 1, status: "assigned" } });
  });

  it("rejects orphan, wrong-wait and stale-run task assignments", async () => {
    const runtime = harness();
    const missing = await runtime.taskService.assign({
      scope,
      id: "task.orphan.001",
      runId: "run.missing.001",
      expectedRunRevision: 2,
      assignee: alice,
      escalateAtUnixMs: null,
      expiresAtUnixMs: null,
    });
    expect(missing).toMatchObject({ ok: false, issue: { code: "INVALID_BINDING" } });

    const created = await runtime.runService.create({ id: "run.event.001", scope, resolution: resolution(), entrypointRef, workContextId: null });
    if (!created.ok) throw new Error(created.issue.message);
    const eventWait = await runtime.runService.wait({
      scope,
      id: created.value.id,
      expectedRevision: 1,
      wait: { id: "wait.event.001", kind: "event", reference: "task.event.001", dueAtUnixMs: null },
    });
    if (!eventWait.ok) throw new Error(eventWait.issue.message);
    expect(await runtime.taskService.assign({
      scope,
      id: "task.event.001",
      runId: eventWait.value.id,
      expectedRunRevision: eventWait.value.revision,
      assignee: alice,
      escalateAtUnixMs: null,
      expiresAtUnixMs: null,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_BINDING" } });

    const waiting = await waitingHumanRun(runtime, "run.handoff.stale", "task.handoff.stale");
    expect(await runtime.taskService.assign({
      scope,
      id: "task.handoff.stale",
      runId: waiting.id,
      expectedRunRevision: waiting.revision - 1,
      assignee: alice,
      escalateAtUnixMs: null,
      expiresAtUnixMs: null,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_BINDING" } });
  });

  it("enforces assignee claim ownership, release and revision-safe reassignment", async () => {
    const runtime = harness();
    const waiting = await waitingHumanRun(runtime, "run.handoff.002", "task.handoff.002");
    const assigned = await runtime.taskService.assign({
      scope,
      id: "task.handoff.002",
      runId: waiting.id,
      expectedRunRevision: waiting.revision,
      assignee: alice,
      escalateAtUnixMs: null,
      expiresAtUnixMs: runtime.now() + 1_000,
    });
    if (!assigned.ok) throw new Error(assigned.issue.message);

    expect(await runtime.taskService.claim({ scope, id: assigned.value.id, expectedRevision: 1, actor: bob }))
      .toMatchObject({ ok: false, issue: { code: "ACTOR_MISMATCH" } });
    const claimed = await runtime.taskService.claim({ scope, id: assigned.value.id, expectedRevision: 1, actor: alice });
    expect(claimed).toMatchObject({ ok: true, value: { revision: 2, status: "claimed", claimant: alice } });
    if (!claimed.ok) return;

    expect(await runtime.taskService.reassign({ scope, id: claimed.value.id, expectedRevision: 2, assignee: bob }))
      .toMatchObject({ ok: false, issue: { code: "INVALID_STATE" } });
    expect(await runtime.taskService.release({ scope, id: claimed.value.id, expectedRevision: 2, actor: bob }))
      .toMatchObject({ ok: false, issue: { code: "ACTOR_MISMATCH" } });
    const released = await runtime.taskService.release({ scope, id: claimed.value.id, expectedRevision: 2, actor: alice });
    expect(released).toMatchObject({ ok: true, value: { revision: 3, status: "assigned", claimant: null } });
    if (!released.ok) return;
    const reassigned = await runtime.taskService.reassign({ scope, id: released.value.id, expectedRevision: 3, assignee: bob });
    expect(reassigned).toMatchObject({ ok: true, value: { revision: 4, status: "assigned", assignee: bob } });
    expect(await runtime.taskService.claim({ scope, id: released.value.id, expectedRevision: 3, actor: alice }))
      .toMatchObject({ ok: false, issue: { code: "CONFLICT" } });
  });

  it("allows only the current claimant to complete and rejects duplicate completion", async () => {
    const runtime = harness();
    const waiting = await waitingHumanRun(runtime, "run.handoff.003", "task.handoff.003");
    const assigned = await runtime.taskService.assign({
      scope,
      id: "task.handoff.003",
      runId: waiting.id,
      expectedRunRevision: waiting.revision,
      assignee: alice,
      escalateAtUnixMs: null,
      expiresAtUnixMs: null,
    });
    if (!assigned.ok) throw new Error(assigned.issue.message);
    const claimed = await runtime.taskService.claim({ scope, id: assigned.value.id, expectedRevision: 1, actor: alice });
    if (!claimed.ok) throw new Error(claimed.issue.message);

    expect(await runtime.taskService.complete({
      scope,
      id: claimed.value.id,
      expectedRevision: 2,
      actor: bob,
      resultRef: "work:handoff:result-003",
      evidenceRef: null,
    })).toMatchObject({ ok: false, issue: { code: "ACTOR_MISMATCH" } });

    const completed = await runtime.taskService.complete({
      scope,
      id: claimed.value.id,
      expectedRevision: 2,
      actor: alice,
      resultRef: "work:handoff:result-003",
      evidenceRef: "evidence:handoff:003",
    });
    expect(completed).toMatchObject({
      ok: true,
      value: {
        revision: 3,
        status: "completed",
        resultRef: "work:handoff:result-003",
        evidenceRef: "evidence:handoff:003",
      },
    });
    expect(await runtime.taskService.complete({
      scope,
      id: claimed.value.id,
      expectedRevision: 2,
      actor: alice,
      resultRef: "work:handoff:result-003",
      evidenceRef: "evidence:handoff:003",
    })).toMatchObject({ ok: false, issue: { code: "CONFLICT" } });
  });

  it("gates escalation and expiry by the service clock without stealing claimed work", async () => {
    const runtime = harness();
    const base = runtime.now();
    const waiting = await waitingHumanRun(runtime, "run.handoff.004", "task.handoff.004");
    const assigned = await runtime.taskService.assign({
      scope,
      id: "task.handoff.004",
      runId: waiting.id,
      expectedRunRevision: waiting.revision,
      assignee: alice,
      escalateAtUnixMs: base + 100,
      expiresAtUnixMs: base + 1_000,
    });
    if (!assigned.ok) throw new Error(assigned.issue.message);

    expect(await runtime.taskService.escalate({ scope, id: assigned.value.id, expectedRevision: 1, assignee: bob, nextEscalateAtUnixMs: null }))
      .toMatchObject({ ok: false, issue: { code: "DEADLINE_NOT_REACHED" } });
    runtime.setNow(base + 100);
    const escalated = await runtime.taskService.escalate({
      scope,
      id: assigned.value.id,
      expectedRevision: 1,
      assignee: bob,
      nextEscalateAtUnixMs: base + 500,
    });
    expect(escalated).toMatchObject({
      ok: true,
      value: { revision: 2, assignee: bob, escalationCount: 1, escalateAtUnixMs: base + 500 },
    });
    if (!escalated.ok) return;

    const claimed = await runtime.taskService.claim({ scope, id: escalated.value.id, expectedRevision: 2, actor: bob });
    if (!claimed.ok) throw new Error(claimed.issue.message);
    runtime.setNow(base + 500);
    expect(await runtime.taskService.escalate({ scope, id: claimed.value.id, expectedRevision: 3, assignee: carol, nextEscalateAtUnixMs: null }))
      .toMatchObject({ ok: false, issue: { code: "INVALID_STATE" } });
    expect(await runtime.taskService.expire({ scope, id: claimed.value.id, expectedRevision: 3 }))
      .toMatchObject({ ok: false, issue: { code: "DEADLINE_NOT_REACHED" } });

    runtime.setNow(base + 1_000);
    const expired = await runtime.taskService.expire({ scope, id: claimed.value.id, expectedRevision: 3 });
    expect(expired).toMatchObject({ ok: true, value: { revision: 4, status: "expired" } });
    if (!expired.ok) return;
    expect(await runtime.taskService.complete({
      scope,
      id: expired.value.id,
      expectedRevision: 4,
      actor: bob,
      resultRef: null,
      evidenceRef: null,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_STATE" } });
  });

  it("rejects cross-organization task actors", async () => {
    const runtime = harness();
    const waiting = await waitingHumanRun(runtime, "run.handoff.005", "task.handoff.005");
    const assigned = await runtime.taskService.assign({
      scope,
      id: "task.handoff.005",
      runId: waiting.id,
      expectedRunRevision: waiting.revision,
      assignee: alice,
      escalateAtUnixMs: null,
      expiresAtUnixMs: null,
    });
    if (!assigned.ok) throw new Error(assigned.issue.message);
    expect(await runtime.taskService.claim({
      scope,
      id: assigned.value.id,
      expectedRevision: 1,
      actor: { ...alice, organizationId: "org-other" },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_PRINCIPAL" } });
  });
});
