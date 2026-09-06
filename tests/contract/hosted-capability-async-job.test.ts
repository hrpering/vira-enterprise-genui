import { describe, expect, it } from "vitest";
import type { ViraCapabilityDefinition } from "../../packages/capability-contract/src/index.js";
import type { ViraEnterpriseScope } from "../../packages/enterprise-context/src/index.js";
import {
  authorizeViraHostedCapabilityQueryRetry,
  createViraHostedCapabilityJobService,
  type ViraHostedCapabilityBinding,
  type ViraHostedCapabilityJob,
  type ViraHostedCapabilityJobCompletion,
  type ViraHostedCapabilityJobStartInput,
  type ViraHostedCapabilityJobStore,
  type ViraHostedCapabilityProviderAuthority,
} from "../../packages/hosted-capability-runtime/src/index.js";

const NOW = 1_900_000_000_000;
const scope: ViraEnterpriseScope = Object.freeze({
  version: "1",
  organizationId: "org-demo",
  projectId: "project-demo",
  environment: "staging",
});
const digestA = "a".repeat(64);
const digestB = "b".repeat(64);

function queryCapability(): ViraCapabilityDefinition {
  return {
    schemaVersion: "1",
    id: "demo.capability.document.export",
    version: "1.0.0",
    publisher: { id: "demo", name: "Demo Publisher" },
    metadata: { name: "Long document export" },
    input: { typeRef: null },
    output: { typeRef: null },
    contextRequirements: [],
    invocation: { kind: "query" },
  };
}

function actionCapability(): ViraCapabilityDefinition {
  return {
    ...queryCapability(),
    id: "demo.capability.document.publish",
    invocation: { kind: "action", actionType: "demo.document.publish" },
  };
}

function binding(capability = queryCapability()): ViraHostedCapabilityBinding {
  return {
    version: "1",
    bindingRef: { id: "demo.binding.document.export", versionRef: "1.0.0" },
    capabilityRef: { id: capability.id, versionRef: capability.version },
    providerId: "demo",
    locationId: null,
  };
}

function authority(overrides: Partial<ViraHostedCapabilityProviderAuthority> = {}): ViraHostedCapabilityProviderAuthority {
  return {
    version: "1",
    connectionId: "demo.connection",
    trustEvidenceId: "trust.demo.connection.e001",
    trusted: true,
    validUntilEpochMs: NOW + 600_000,
    ...overrides,
  };
}

function startInput(overrides: Partial<ViraHostedCapabilityJobStartInput> = {}): ViraHostedCapabilityJobStartInput {
  const capability = overrides.capability ?? queryCapability();
  return {
    id: "job.demo.export.e001",
    scope,
    invocationId: "invocation-export-001",
    capability,
    binding: overrides.binding ?? binding(capability),
    authority: authority(),
    providerJobRef: "provider-job-001",
    completionMode: "poll",
    retryPolicy: "query-safe",
    deadlineEpochMs: NOW + 60_000,
    ...overrides,
  };
}

function completion(
  source: "poll" | "webhook" = "poll",
  overrides: Partial<ViraHostedCapabilityJobCompletion> = {},
): ViraHostedCapabilityJobCompletion {
  return {
    source,
    completionId: "completion-001",
    completedAtEpochMs: NOW + 1_000,
    result: {
      outcome: "success",
      output: { typeRef: null, value: { artifactRef: "artifact.demo.export.e001" } },
      resultDigest: digestA,
    },
    ...overrides,
  };
}

function createMemoryStore(): ViraHostedCapabilityJobStore {
  const records = new Map<string, ViraHostedCapabilityJob>();
  const key = (jobScope: ViraEnterpriseScope, id: string) => `${jobScope.organizationId}|${jobScope.projectId}|${jobScope.environment}|${id}`;
  return Object.freeze({
    read(jobScope: ViraEnterpriseScope, id: string) {
      return records.get(key(jobScope, id));
    },
    create(job: ViraHostedCapabilityJob) {
      const recordKey = key(job.scope, job.id);
      if (records.has(recordKey)) return { ok: false as const, code: "ALREADY_EXISTS" as const };
      records.set(recordKey, job);
      return { ok: true as const, value: job };
    },
    replace(job: ViraHostedCapabilityJob, expectedRevision: number) {
      const recordKey = key(job.scope, job.id);
      const current = records.get(recordKey);
      if (!current) return { ok: false as const, code: "NOT_FOUND" as const };
      if (current.revision !== expectedRevision || job.revision !== expectedRevision + 1) return { ok: false as const, code: "VERSION_CONFLICT" as const };
      records.set(recordKey, job);
      return { ok: true as const, value: job };
    },
  });
}

function harness() {
  let now = NOW;
  const store = createMemoryStore();
  const service = createViraHostedCapabilityJobService({ store, nowEpochMs: () => now });
  return {
    store,
    service,
    setNow(value: number) { now = value; },
  };
}

describe("PROD-09 async hosted Capability jobs", () => {
  it("starts a long-running query as durable state and can resume through a recreated service", async () => {
    const { store, service } = harness();
    const started = await service.start(startInput());
    expect(started).toMatchObject({
      ok: true,
      value: {
        id: "job.demo.export.e001",
        revision: 1,
        status: "running",
        providerConnectionId: "demo.connection",
        trustEvidenceId: "trust.demo.connection.e001",
        providerJobRef: "provider-job-001",
        completionMode: "poll",
        retryPolicy: "query-safe",
      },
    });
    const recreated = createViraHostedCapabilityJobService({ store, nowEpochMs: () => NOW + 1 });
    const resumed = await recreated.read(scope, "job.demo.export.e001");
    expect(resumed).toMatchObject({ ok: true, value: { revision: 1, status: "running" } });
  });

  it("keeps protected Actions out of async jobs and executable query retry", async () => {
    const { service } = harness();
    const action = actionCapability();
    const blockedStart = await service.start(startInput({
      capability: action,
      binding: binding(action),
    }));
    expect(blockedStart).toMatchObject({ ok: false, issue: { code: "ACTION_BOUNDARY_REQUIRED" } });

    expect(authorizeViraHostedCapabilityQueryRetry({
      capability: queryCapability(),
      retryPolicy: "query-safe",
    })).toMatchObject({ ok: true, value: { retryPolicy: "query-safe" } });
    expect(authorizeViraHostedCapabilityQueryRetry({
      capability: queryCapability(),
      retryPolicy: "provider-declared",
    })).toMatchObject({ ok: false, issue: { code: "RETRY_NOT_QUERY_SAFE" } });
    expect(authorizeViraHostedCapabilityQueryRetry({
      capability: action,
      retryPolicy: "query-safe",
    })).toMatchObject({ ok: false, issue: { code: "ACTION_BOUNDARY_REQUIRED" } });
  });

  it("uses one CAS completion primitive for poll and replay-safe duplicate completion", async () => {
    const h = harness();
    await h.service.start(startInput());
    h.setNow(NOW + 2_000);
    const completed = await h.service.complete({
      scope,
      id: "job.demo.export.e001",
      expectedRevision: 1,
      completion: completion("poll"),
    });
    expect(completed).toMatchObject({ ok: true, value: { revision: 2, status: "completed" } });

    const duplicate = await h.service.complete({
      scope,
      id: "job.demo.export.e001",
      expectedRevision: 1,
      completion: completion("poll"),
    });
    expect(duplicate).toMatchObject({ ok: true, replay: true, value: { revision: 2, status: "completed" } });

    const conflicting = await h.service.complete({
      scope,
      id: "job.demo.export.e001",
      expectedRevision: 2,
      completion: completion("poll", {
        completionId: "completion-002",
        result: { outcome: "empty", resultDigest: digestB },
      }),
    });
    expect(conflicting).toMatchObject({ ok: false, issue: { code: "TERMINAL_STATE" } });
  });

  it("routes webhook completion through the same state machine and rejects source drift", async () => {
    const h = harness();
    await h.service.start(startInput({
      id: "job.demo.export.e002",
      providerJobRef: "provider-job-002",
      completionMode: "webhook",
    }));
    h.setNow(NOW + 2_000);
    expect(await h.service.complete({
      scope,
      id: "job.demo.export.e002",
      expectedRevision: 1,
      completion: completion("poll"),
    })).toMatchObject({ ok: false, issue: { code: "INVALID_COMPLETION" } });
    expect(await h.service.complete({
      scope,
      id: "job.demo.export.e002",
      expectedRevision: 1,
      completion: completion("webhook"),
    })).toMatchObject({ ok: true, value: { status: "completed", completion: { source: "webhook" } } });
  });

  it("models cancellation ambiguity without pretending cancel-requested means cancelled", async () => {
    const h = harness();
    await h.service.start(startInput({ id: "job.demo.export.e003", providerJobRef: "provider-job-003" }));
    h.setNow(NOW + 1_000);
    const requested = await h.service.requestCancel({
      scope,
      id: "job.demo.export.e003",
      expectedRevision: 1,
      authority: authority(),
    });
    expect(requested).toMatchObject({ ok: true, value: { revision: 2, status: "cancel-requested", cancelledAtEpochMs: null } });

    h.setNow(NOW + 2_000);
    const providerWonRace = await h.service.complete({
      scope,
      id: "job.demo.export.e003",
      expectedRevision: 2,
      completion: completion("poll", { completedAtEpochMs: NOW + 1_500 }),
    });
    expect(providerWonRace).toMatchObject({ ok: true, value: { status: "completed" } });

    await h.service.start(startInput({ id: "job.demo.export.e004", providerJobRef: "provider-job-004" }));
    const requestedAgain = await h.service.requestCancel({
      scope,
      id: "job.demo.export.e004",
      expectedRevision: 1,
      authority: authority(),
    });
    expect(requestedAgain).toMatchObject({ ok: true, value: { revision: 2, status: "cancel-requested" } });
    const cancelled = await h.service.confirmCancelled({ scope, id: "job.demo.export.e004", expectedRevision: 2 });
    expect(cancelled).toMatchObject({ ok: true, value: { revision: 3, status: "cancelled" } });
    expect(await h.service.complete({
      scope,
      id: "job.demo.export.e004",
      expectedRevision: 3,
      completion: completion("poll", { completionId: "completion-late" }),
    })).toMatchObject({ ok: false, issue: { code: "LATE_COMPLETION" } });
  });

  it("makes timeout terminal and rejects late completion", async () => {
    const h = harness();
    await h.service.start(startInput({
      id: "job.demo.export.e005",
      providerJobRef: "provider-job-005",
      deadlineEpochMs: NOW + 100,
    }));
    expect(await h.service.timeout({ scope, id: "job.demo.export.e005", expectedRevision: 1 })).toMatchObject({
      ok: false,
      issue: { code: "TIMEOUT_NOT_REACHED" },
    });
    h.setNow(NOW + 100);
    const timedOut = await h.service.timeout({ scope, id: "job.demo.export.e005", expectedRevision: 1 });
    expect(timedOut).toMatchObject({ ok: true, value: { revision: 2, status: "timed-out" } });
    expect(await h.service.complete({
      scope,
      id: "job.demo.export.e005",
      expectedRevision: 2,
      completion: completion("poll", { completedAtEpochMs: NOW + 50 }),
    })).toMatchObject({ ok: false, issue: { code: "LATE_COMPLETION" } });
  });

  it("fails provider work closed when authority is revoked or belongs to another connection", async () => {
    const h = harness();
    await h.service.start(startInput({ id: "job.demo.export.e006", providerJobRef: "provider-job-006" }));
    expect(await h.service.authorizePoll({
      scope,
      id: "job.demo.export.e006",
      expectedRevision: 1,
      authority: authority({ connectionId: "other.connection" }),
    })).toMatchObject({ ok: false, issue: { code: "PROVIDER_AUTHORITY_MISMATCH" } });
    expect(await h.service.authorizePoll({
      scope,
      id: "job.demo.export.e006",
      expectedRevision: 1,
      authority: authority({ validUntilEpochMs: NOW }),
    })).toMatchObject({ ok: false, issue: { code: "PROVIDER_AUTHORITY_REVOKED" } });

    await h.service.start(startInput({ id: "job.demo.export.e008", providerJobRef: "provider-job-008" }));
    expect(await h.service.requestCancel({
      scope,
      id: "job.demo.export.e008",
      expectedRevision: 1,
      authority: authority(),
    })).toMatchObject({ ok: true, value: { revision: 2, status: "cancel-requested" } });
    expect(await h.service.requestCancel({
      scope,
      id: "job.demo.export.e008",
      expectedRevision: 2,
      authority: authority({ validUntilEpochMs: NOW }),
    })).toMatchObject({ ok: false, issue: { code: "PROVIDER_AUTHORITY_REVOKED" } });
    expect(await h.service.requestCancel({
      scope,
      id: "job.demo.export.e008",
      expectedRevision: 2,
      authority: authority({ connectionId: "other.connection" }),
    })).toMatchObject({ ok: false, issue: { code: "PROVIDER_AUTHORITY_MISMATCH" } });
  });

  it("uses expected revision as the mutation CAS boundary", async () => {
    const h = harness();
    await h.service.start(startInput({ id: "job.demo.export.e007", providerJobRef: "provider-job-007" }));
    h.setNow(NOW + 1_000);
    expect(await h.service.requestCancel({
      scope,
      id: "job.demo.export.e007",
      expectedRevision: 1,
      authority: authority(),
    })).toMatchObject({ ok: true, value: { revision: 2 } });
    expect(await h.service.requestCancel({
      scope,
      id: "job.demo.export.e007",
      expectedRevision: 1,
      authority: authority(),
    })).toMatchObject({ ok: false, issue: { code: "VERSION_CONFLICT" } });
  });
});
