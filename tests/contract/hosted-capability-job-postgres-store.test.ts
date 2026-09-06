import { describe, expect, it } from "vitest";
import type { ViraEnterpriseScope } from "../../packages/enterprise-context/src/index.js";
import type { ViraHostedCapabilityJob } from "../../packages/hosted-capability-runtime/src/index.js";
import { createPostgresHostedCapabilityJobStore, type PostgresClientLike, type PostgresQueryResult } from "../../integrations/postgres/src/index.js";

const NOW = 1_900_000_000_000;
const scope: ViraEnterpriseScope = Object.freeze({
  version: "1",
  organizationId: "org-demo",
  projectId: "project-demo",
  environment: "staging",
});

function runningJob(overrides: Partial<ViraHostedCapabilityJob> = {}): ViraHostedCapabilityJob {
  return {
    version: "1",
    id: "job.demo.export.pg001",
    scope,
    revision: 1,
    status: "running",
    invocationId: "invocation-export-pg001",
    capabilityRef: { id: "demo.capability.document.export", versionRef: "1.0.0" },
    bindingRef: { id: "demo.binding.document.export", versionRef: "1.0.0" },
    providerId: "demo",
    providerConnectionId: "demo.connection",
    trustEvidenceId: "trust.demo.connection.e001",
    providerJobRef: "provider-job-pg001",
    completionMode: "poll",
    retryPolicy: "query-safe",
    deadlineEpochMs: NOW + 60_000,
    startedAtEpochMs: NOW,
    updatedAtEpochMs: NOW,
    cancelRequestedAtEpochMs: null,
    cancelledAtEpochMs: null,
    timedOutAtEpochMs: null,
    completion: null,
    ...overrides,
  };
}

function rowFor(job: ViraHostedCapabilityJob, rowOverrides: Record<string, unknown> = {}) {
  return {
    organization_id: job.scope.organizationId,
    project_id: job.scope.projectId,
    environment: job.scope.environment,
    job_id: job.id,
    revision: job.revision,
    status: job.status,
    record: job,
    ...rowOverrides,
  };
}

interface QueryCall {
  readonly text: string;
  readonly values: readonly unknown[] | undefined;
}

function createPool(handler: (text: string, values: readonly unknown[] | undefined) => PostgresQueryResult<Record<string, unknown>>) {
  const calls: QueryCall[] = [];
  let releases = 0;
  const client: PostgresClientLike = {
    async query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
      calls.push({ text, values });
      return handler(text, values) as PostgresQueryResult<Row>;
    },
    release() {
      releases += 1;
    },
  };
  return {
    pool: { async connect() { return client; } },
    calls,
    releases: () => releases,
  };
}

function transactionNoop(text: string): PostgresQueryResult<Record<string, unknown>> | undefined {
  if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK" || text.startsWith("SELECT set_config") || text === "SELECT vira.require_scope()") {
    return { rows: [] };
  }
  return undefined;
}

describe("PROD-09 PostgreSQL async Capability job store", () => {
  it("creates durable job state under the exact tenant transaction identity", async () => {
    const fixture = runningJob();
    const h = createPool((text, values) => {
      const noop = transactionNoop(text);
      if (noop) return noop;
      if (text.includes("INSERT INTO vira.hosted_capability_job_state")) {
        expect(values?.slice(0, 6)).toEqual(["org-demo", "project-demo", "staging", fixture.id, 1, "running"]);
        const record = JSON.parse(String(values?.[6])) as ViraHostedCapabilityJob;
        return { rows: [rowFor(record)] };
      }
      throw new Error(`unexpected SQL: ${text}`);
    });
    const store = createPostgresHostedCapabilityJobStore(h.pool);
    const created = await store.create(fixture);
    expect(created).toMatchObject({ ok: true, value: { id: fixture.id, revision: 1, status: "running" } });
    expect(h.calls.some((call) => call.text.startsWith("SELECT set_config") && call.values?.join("|") === "org-demo|project-demo|staging")).toBe(true);
    expect(h.releases()).toBe(1);
  });

  it("uses expected revision in the SQL mutation predicate and classifies stale writers", async () => {
    const next = runningJob({
      revision: 2,
      status: "cancel-requested",
      updatedAtEpochMs: NOW + 1_000,
      cancelRequestedAtEpochMs: NOW + 1_000,
    });
    const h = createPool((text, values) => {
      const noop = transactionNoop(text);
      if (noop) return noop;
      if (text.includes("UPDATE vira.hosted_capability_job_state")) {
        expect(text).toContain("revision = $8");
        expect(values?.[7]).toBe(1);
        return { rows: [] };
      }
      if (text.includes("SELECT revision FROM vira.hosted_capability_job_state")) return { rows: [{ revision: 2 }] };
      throw new Error(`unexpected SQL: ${text}`);
    });
    const store = createPostgresHostedCapabilityJobStore(h.pool);
    await expect(store.replace(next, 1)).resolves.toEqual({ ok: false, code: "VERSION_CONFLICT" });
  });

  it("distinguishes a missing job from a stale revision", async () => {
    const next = runningJob({
      revision: 2,
      status: "cancel-requested",
      updatedAtEpochMs: NOW + 1_000,
      cancelRequestedAtEpochMs: NOW + 1_000,
    });
    const h = createPool((text) => {
      const noop = transactionNoop(text);
      if (noop) return noop;
      if (text.includes("UPDATE vira.hosted_capability_job_state")) return { rows: [] };
      if (text.includes("SELECT revision FROM vira.hosted_capability_job_state")) return { rows: [] };
      throw new Error(`unexpected SQL: ${text}`);
    });
    const store = createPostgresHostedCapabilityJobStore(h.pool);
    await expect(store.replace(next, 1)).resolves.toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("fails closed when PostgreSQL row identity disagrees with canonical JSON", async () => {
    const fixture = runningJob();
    const h = createPool((text) => {
      const noop = transactionNoop(text);
      if (noop) return noop;
      if (text.includes("FROM vira.hosted_capability_job_state")) {
        return { rows: [rowFor(fixture, { status: "completed" })] };
      }
      throw new Error(`unexpected SQL: ${text}`);
    });
    const store = createPostgresHostedCapabilityJobStore(h.pool);
    await expect(store.read(scope, fixture.id)).rejects.toThrow("row conflicts with its canonical record");
  });

  it("fails closed for malformed persisted temporal or completion state", async () => {
    const malformed = runningJob({
      status: "completed",
      completion: {
        source: "poll",
        completionId: "completion-pg001",
        completedAtEpochMs: NOW + 60_000,
        result: { outcome: "empty", resultDigest: "a".repeat(64) },
      },
      updatedAtEpochMs: NOW + 60_000,
    });
    const h = createPool((text) => {
      const noop = transactionNoop(text);
      if (noop) return noop;
      if (text.includes("FROM vira.hosted_capability_job_state")) return { rows: [rowFor(malformed)] };
      throw new Error(`unexpected SQL: ${text}`);
    });
    const store = createPostgresHostedCapabilityJobStore(h.pool);
    await expect(store.read(scope, malformed.id)).rejects.toThrow("completion timestamp is invalid");
  });
});
