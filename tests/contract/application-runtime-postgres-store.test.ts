import { describe, expect, it } from "vitest";
import {
  createPostgresApplicationRunStore,
  createPostgresHumanTaskStore,
  createPostgresTriggerInboxStore,
} from "../../integrations/postgres/src/index.js";
import type {
  PostgresClientLike,
  PostgresPoolLike,
  PostgresQueryResult,
} from "../../integrations/postgres/src/transaction.js";
import type {
  ViraApplicationRun,
  ViraHumanTask,
  ViraTriggerInboxRecord,
} from "../../packages/application-runtime/src/index.js";

interface QueryCall {
  readonly text: string;
  readonly values: readonly unknown[] | undefined;
}

type QueryHandler = (text: string, values: readonly unknown[] | undefined) => readonly Record<string, unknown>[];

class FakeClient implements PostgresClientLike {
  readonly calls: QueryCall[] = [];
  released = false;

  constructor(private readonly handler: QueryHandler = () => []) {}

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PostgresQueryResult<Row>> {
    this.calls.push({ text, values });
    return { rows: [...this.handler(text, values)] as unknown as Row[] };
  }

  release(): void {
    this.released = true;
  }
}

function pool(client: FakeClient): PostgresPoolLike {
  return { connect: async () => client };
}

const scope = Object.freeze({
  version: "1" as const,
  organizationId: "org-vira",
  projectId: "runtime-project",
  environment: "staging" as const,
});
const assignee = Object.freeze({
  version: "1" as const,
  kind: "user" as const,
  id: "user:alice",
  organizationId: "org-vira",
});

function runRecord(overrides: Partial<ViraApplicationRun> = {}): ViraApplicationRun {
  return {
    version: "1",
    id: "run.db.001",
    scope,
    revision: 1,
    status: "running",
    resolution: {
      release: { id: "vira.runtime-app", version: "1.0.0" },
      environment: "staging",
      deploymentId: "deployment:vira:runtime:1",
      deploymentRevision: 1,
      artifactId: "artifact:vira:runtime:1",
      distributionDigest: "a".repeat(64),
      resolutionDigest: "b".repeat(64),
    },
    entrypointRef: { id: "vira.runtime.flow", versionRef: "1.0.0" },
    workContextId: null,
    wait: null,
    createdAtUnixMs: 1_900_000_000_000,
    updatedAtUnixMs: 1_900_000_000_000,
    ...overrides,
  };
}

function humanTaskRecord(overrides: Partial<ViraHumanTask> = {}): ViraHumanTask {
  return {
    version: "1",
    id: "task.db.001",
    scope,
    revision: 1,
    runId: "run.db.001",
    runRevision: 1,
    waitId: "wait.db.001",
    status: "assigned",
    assignee,
    claimant: null,
    resultRef: null,
    evidenceRef: null,
    escalationCount: 0,
    escalateAtUnixMs: null,
    expiresAtUnixMs: null,
    lastEscalatedAtUnixMs: null,
    createdAtUnixMs: 1_900_000_000_000,
    updatedAtUnixMs: 1_900_000_000_000,
    closedAtUnixMs: null,
    ...overrides,
  };
}

function triggerRecord(overrides: Partial<ViraTriggerInboxRecord> = {}): ViraTriggerInboxRecord {
  return {
    version: "1",
    sourceRef: "provider.github.webhook",
    eventId: "event.db.001",
    scope,
    revision: 1,
    status: "pending",
    triggerType: "webhook",
    entrypointRef: { id: "vira.runtime.flow", versionRef: "1.0.0" },
    resolution: {
      release: { id: "vira.runtime-app", version: "1.0.0" },
      environment: "staging",
      deploymentId: "deployment:vira:runtime:1",
      deploymentRevision: 1,
      artifactId: "artifact:vira:runtime:1",
      distributionDigest: "a".repeat(64),
      resolutionDigest: "b".repeat(64),
    },
    resolutionArtifactRef: {
      id: "artifact.resolution.db.001",
      revision: 1,
      digest: `sha256:${"b".repeat(64)}`,
    },
    payloadArtifactRef: {
      id: "artifact.payload.db.001",
      revision: 1,
      digest: `sha256:${"c".repeat(64)}`,
    },
    occurredAtUnixMs: 1_900_000_000_000,
    receivedAtUnixMs: 1_900_000_000_000,
    replayExpiresAtUnixMs: 1_900_003_600_000,
    processingRef: null,
    leaseUntilUnixMs: null,
    processedRunId: null,
    updatedAtUnixMs: 1_900_000_000_000,
    ...overrides,
  };
}

function runRow(record = runRecord(), overrides: Record<string, unknown> = {}) {
  return {
    organization_id: scope.organizationId,
    project_id: scope.projectId,
    environment: scope.environment,
    run_id: record.id,
    revision: String(record.revision),
    status: record.status,
    record,
    ...overrides,
  };
}

describe("PROD-08 PostgreSQL runtime durable stores", () => {
  it("reads ApplicationRun only inside the exact transaction-local enterprise scope", async () => {
    const client = new FakeClient((text) => text.includes("FROM vira.application_run_state") ? [runRow()] : []);
    const store = createPostgresApplicationRunStore(pool(client));

    const result = await store.read(scope, "run.db.001");
    expect(result).toMatchObject({ id: "run.db.001", revision: 1, status: "running" });
    expect(client.calls[0]?.text).toBe("BEGIN");
    expect(client.calls[1]).toEqual({
      text: "SELECT set_config('vira.organization_id', $1, true), set_config('vira.project_id', $2, true), set_config('vira.environment', $3, true)",
      values: ["org-vira", "runtime-project", "staging"],
    });
    expect(client.calls.some((call) => call.text === "SELECT vira.require_scope()")).toBe(true);
    expect(client.calls.some((call) => call.text.includes("FROM vira.application_run_state") && call.values?.at(-1) === "run.db.001")).toBe(true);
    expect(client.calls.at(-1)?.text).toBe("COMMIT");
    expect(client.released).toBe(true);
  });

  it("compares expected revision atomically in ApplicationRun UPDATE and classifies a stale writer as VERSION_CONFLICT", async () => {
    const client = new FakeClient((text) => {
      if (text.includes("UPDATE vira.application_run_state")) return [];
      if (text.includes("SELECT revision FROM vira.application_run_state")) return [{ revision: "2" }];
      return [];
    });
    const store = createPostgresApplicationRunStore(pool(client));
    const next = runRecord({ revision: 2, status: "waiting", wait: { id: "wait.db.001", kind: "event", reference: "event:ready", dueAtUnixMs: null } });

    await expect(store.replace(next, 1)).resolves.toEqual({ ok: false, code: "VERSION_CONFLICT" });
    const update = client.calls.find((call) => call.text.includes("UPDATE vira.application_run_state"));
    expect(update?.text).toContain("AND revision = $8");
    expect(update?.values?.at(-1)).toBe(1);
    expect(client.calls.at(-1)?.text).toBe("COMMIT");
  });

  it("rejects SQL row and JSON-record identity drift and rolls back", async () => {
    const client = new FakeClient((text) => text.includes("FROM vira.application_run_state")
      ? [runRow(runRecord(), { status: "waiting" })]
      : []);
    const store = createPostgresApplicationRunStore(pool(client));

    await expect(store.read(scope, "run.db.001")).rejects.toThrow(TypeError);
    expect(client.calls.some((call) => call.text === "ROLLBACK")).toBe(true);
    expect(client.calls.some((call) => call.text === "COMMIT")).toBe(false);
    expect(client.released).toBe(true);
  });

  it("uses exact durable composite keys for HumanTask and TriggerInbox lookups", async () => {
    const client = new FakeClient();
    const human = createPostgresHumanTaskStore(pool(client));
    const trigger = createPostgresTriggerInboxStore(pool(client));

    await expect(human.read(scope, "task.db.001")).resolves.toBeUndefined();
    await expect(trigger.read(scope, "provider.github.webhook", "event.db.001")).resolves.toBeUndefined();

    const humanLookup = client.calls.find((call) => call.text.includes("FROM vira.human_task_state"));
    expect(humanLookup?.values).toEqual(["org-vira", "runtime-project", "staging", "task.db.001"]);
    const triggerLookup = client.calls.find((call) => call.text.includes("FROM vira.trigger_inbox_state"));
    expect(triggerLookup?.values).toEqual(["org-vira", "runtime-project", "staging", "provider.github.webhook", "event.db.001"]);
  });

  it("embeds expectedRevision in HumanTask and TriggerInbox UPDATE predicates", async () => {
    const client = new FakeClient();
    const human = createPostgresHumanTaskStore(pool(client));
    const trigger = createPostgresTriggerInboxStore(pool(client));

    await expect(human.replace(humanTaskRecord({ revision: 2, status: "claimed", claimant: assignee }), 1))
      .resolves.toEqual({ ok: false, code: "NOT_FOUND" });
    await expect(trigger.replace(triggerRecord({
      revision: 2,
      status: "processing",
      processingRef: "worker:runtime:001",
      leaseUntilUnixMs: 1_900_000_100_000,
      updatedAtUnixMs: 1_900_000_000_100,
    }), 1)).resolves.toEqual({ ok: false, code: "NOT_FOUND" });

    const humanUpdate = client.calls.find((call) => call.text.includes("UPDATE vira.human_task_state"));
    expect(humanUpdate?.text).toContain("AND revision = $8");
    expect(humanUpdate?.values?.at(-1)).toBe(1);
    const triggerUpdate = client.calls.find((call) => call.text.includes("UPDATE vira.trigger_inbox_state"));
    expect(triggerUpdate?.text).toContain("AND revision = $9");
    expect(triggerUpdate?.values?.at(-1)).toBe(1);
  });
});
