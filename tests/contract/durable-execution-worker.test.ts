import { describe, expect, it } from "vitest";
import { runViraDurableExecutionWorkerOnce } from "../../apps/vira-worker/src/durable-execution-worker.js";
import {
  createViraHumanApprovalEvidence,
  createViraTransactionComprehension,
  issueViraTransactionExecutionGrant,
} from "../../packages/action-transaction/src/index.js";
import {
  claimViraDurableExecution,
  createViraDurableExecutionRecord,
  type ViraDurableExecutionRecord,
  type ViraDurableExecutionStageBConsumeResult,
} from "../../packages/durable-execution/src/index.js";
import {
  createViraDurableExecutionAuthoritySnapshot,
  type ViraDurableExecutionAuthoritySnapshot,
} from "../../packages/durable-execution/src/authority.js";
import type {
  ViraPostgresDurableExecutionAuthorityRepository,
  ViraPostgresDurableExecutionLeaseStore,
  ViraPostgresDurableExecutionOutcomeStore,
  ViraPostgresDurableExecutionStore,
} from "../../integrations/postgres/src/index.js";
import {
  NOW,
  frozenPlan,
  signer,
  user,
  verifier,
} from "./prod11-transaction-fixture.js";

async function context() {
  const frozen = frozenPlan();
  const review = createViraTransactionComprehension(frozen);
  if (!review.ok) throw new Error(review.issue.message);
  const approval = createViraHumanApprovalEvidence({
    approvalId: "approval.prod12.worker",
    frozen,
    review: review.value,
    issuer: user,
    decision: "approved",
    issuedAtEpochMs: NOW,
    expiresAtEpochMs: NOW + 120_000,
  });
  if (!approval.ok) throw new Error(approval.issue.message);
  const grant = await issueViraTransactionExecutionGrant({
    frozen,
    approval: approval.value,
    operationId: "publish.document",
    grantId: "grant.prod12.worker",
    nonce: "nonce.prod12.worker",
    issuedAtEpochMs: NOW + 1,
    expiresAtEpochMs: NOW + 60_000,
    signer: signer(),
  });
  if (!grant.ok) throw new Error(grant.issue.message);
  const queued = createViraDurableExecutionRecord({
    executionId: "execution.prod12.worker",
    frozen,
    grant: grant.value,
    operationId: "publish.document",
    createdAtEpochMs: NOW + 1,
  });
  if (!queued.ok) throw new Error(queued.issue.message);
  const claimed = claimViraDurableExecution({
    record: queued.value,
    workerId: "worker.prod12.worker",
    nowEpochMs: NOW + 2,
    leaseMs: 30_000,
  });
  if (!claimed.ok) throw new Error(claimed.issue.message);
  const authority = createViraDurableExecutionAuthoritySnapshot({
    record: queued.value,
    frozen,
    grant: grant.value,
  });
  if (!authority.ok) throw new Error(authority.code);
  return { frozen, grant: grant.value, queued: queued.value, claimed: claimed.value, authority: authority.value };
}

function started(record: ViraDurableExecutionRecord, revision: number): ViraDurableExecutionRecord {
  return Object.freeze({
    ...record,
    revision,
    dispatchState: "started",
    updatedAtEpochMs: record.updatedAtEpochMs + 1,
  });
}

function storeFor(
  claimed: ViraDurableExecutionRecord,
  events: string[],
  options: { readonly fence?: "ok" | "reject" } = {},
): ViraPostgresDurableExecutionStore {
  return Object.freeze({
    async read() {
      return claimed;
    },
    async create(record: Parameters<ViraPostgresDurableExecutionStore["create"]>[0]) {
      return { ok: true as const, value: record };
    },
    async claimNext() {
      events.push("claim");
      return claimed;
    },
    async markDispatchStarted(input: Parameters<ViraPostgresDurableExecutionStore["markDispatchStarted"]>[0]) {
      events.push("dispatch-fence");
      if (options.fence === "reject") return { ok: false as const, code: "VERSION_CONFLICT" as const };
      if (input.expectedRevision !== 4) return { ok: false as const, code: "VERSION_CONFLICT" as const };
      return { ok: true as const, value: started(claimed, 5) };
    },
    async recoverExpired() {
      return { ok: false as const, code: "INVALID_STATE" as const };
    },
    consumeGrantAndReserveEffect(
      input: Parameters<ViraPostgresDurableExecutionStore["consumeGrantAndReserveEffect"]>[0],
    ): ViraDurableExecutionStageBConsumeResult {
      events.push("stage-b-authority");
      return {
        ok: true,
        value: {
          revision: input.expectedRevision + 1,
          reservationId: "reservation:prod12:worker",
        },
      };
    },
    async listOutbox() {
      return Object.freeze([]);
    },
    async acceptOutboxConsumer() {
      return "accepted" as const;
    },
  });
}

function authorityRepository(
  authority: ViraDurableExecutionAuthoritySnapshot,
  events: string[],
): ViraPostgresDurableExecutionAuthorityRepository {
  return Object.freeze({
    async enqueueWithAuthority() {
      return { ok: false as const, code: "ALREADY_EXISTS" as const };
    },
    async readAuthority() {
      events.push("authority");
      return authority;
    },
  });
}

function leaseStore(
  claimed: ViraDurableExecutionRecord,
  events: string[],
  mode: "ok" | "reject" = "ok",
): ViraPostgresDurableExecutionLeaseStore {
  return Object.freeze({
    async renew(input: Parameters<ViraPostgresDurableExecutionLeaseStore["renew"]>[0]) {
      events.push("lease-renew");
      if (mode === "reject") return { ok: false as const, code: "VERSION_CONFLICT" as const };
      if (claimed.lease === null) return { ok: false as const, code: "INVALID_STATE" as const };
      return {
        ok: true as const,
        value: Object.freeze({
          ...claimed,
          revision: input.expectedRevision + 1,
          lease: Object.freeze({
            workerId: input.workerId,
            epoch: input.leaseEpoch,
            expiresAtEpochMs: input.nowEpochMs + input.leaseMs,
          }),
          updatedAtEpochMs: input.nowEpochMs,
        }),
      };
    },
  });
}

function outcomeStore(
  record: ViraDurableExecutionRecord,
  events: string[],
): ViraPostgresDurableExecutionOutcomeStore {
  return Object.freeze({
    async record(input: Parameters<ViraPostgresDurableExecutionOutcomeStore["record"]>[0]) {
      events.push(`outcome:${input.outcome}`);
      const status = input.outcome === "accepted"
        ? "verifying" as const
        : input.outcome === "rejected"
          ? "manual" as const
          : "uncertain" as const;
      return {
        ok: true as const,
        value: Object.freeze({
          ...record,
          revision: input.expectedRevision + 1,
          status,
          lease: null,
          dispatchState: "started" as const,
          updatedAtEpochMs: input.nowEpochMs,
        }),
      };
    },
  });
}

function nowSequence() {
  let value = NOW + 2;
  return () => {
    value += 1;
    return value;
  };
}

describe("PROD-12 durable execution worker composition", () => {
  it("renews the lease before Stage B, fences dispatch before adapter invocation, then moves accepted to verifying", async () => {
    const ctx = await context();
    const events: string[] = [];
    let adapterCalls = 0;
    const store = storeFor(ctx.claimed, events);

    const result = await runViraDurableExecutionWorkerOnce({
      scope: ctx.claimed.scope,
      workerId: "worker.prod12.worker",
      leaseMs: 30_000,
      now: nowSequence(),
      store,
      authorityRepository: authorityRepository(ctx.authority, events),
      leaseStore: leaseStore(ctx.claimed, events),
      outcomeStore: outcomeStore(started(ctx.claimed, 5), events),
      verifier: verifier(),
      secretProvider: {
        resolve({ scope, secretRef }) {
          events.push("secret");
          return {
            scope,
            secretRef,
            credential: "credential-prod12-worker",
            expiresAtEpochMs: NOW + 20_000,
          };
        },
      },
      adapter: {
        invoke() {
          events.push("adapter");
          adapterCalls += 1;
          return { dispatch: "accepted" };
        },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      kind: "processed",
      executionId: "execution.prod12.worker",
      status: "verifying",
      revision: 6,
    });
    expect(adapterCalls).toBe(1);
    expect(events).toEqual([
      "claim",
      "authority",
      "lease-renew",
      "stage-b-authority",
      "secret",
      "dispatch-fence",
      "adapter",
      "outcome:accepted",
    ]);
  });

  it("stops before Stage B when the fenced lease cannot be renewed", async () => {
    const ctx = await context();
    const events: string[] = [];
    let adapterCalls = 0;

    const result = await runViraDurableExecutionWorkerOnce({
      scope: ctx.claimed.scope,
      workerId: "worker.prod12.worker",
      leaseMs: 30_000,
      now: nowSequence(),
      store: storeFor(ctx.claimed, events),
      authorityRepository: authorityRepository(ctx.authority, events),
      leaseStore: leaseStore(ctx.claimed, events, "reject"),
      outcomeStore: outcomeStore(started(ctx.claimed, 5), events),
      verifier: verifier(),
      secretProvider: {
        resolve() {
          throw new Error("must not resolve");
        },
      },
      adapter: {
        invoke() {
          adapterCalls += 1;
          return { dispatch: "accepted" };
        },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      kind: "lease-renew-rejected",
      code: "VERSION_CONFLICT",
    });
    expect(adapterCalls).toBe(0);
    expect(events).toEqual(["claim", "authority", "lease-renew"]);
  });

  it("does not record dispatch or invoke the adapter when secret resolution fails", async () => {
    const ctx = await context();
    const events: string[] = [];
    let adapterCalls = 0;

    const result = await runViraDurableExecutionWorkerOnce({
      scope: ctx.claimed.scope,
      workerId: "worker.prod12.worker",
      leaseMs: 30_000,
      now: nowSequence(),
      store: storeFor(ctx.claimed, events),
      authorityRepository: authorityRepository(ctx.authority, events),
      leaseStore: leaseStore(ctx.claimed, events),
      outcomeStore: outcomeStore(started(ctx.claimed, 5), events),
      verifier: verifier(),
      secretProvider: {
        resolve() {
          events.push("secret");
          throw new Error("vault unavailable");
        },
      },
      adapter: {
        invoke() {
          adapterCalls += 1;
          return { dispatch: "accepted" };
        },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      kind: "pre-dispatch-deferred",
      code: "SECRET_RESOLUTION_FAILED",
    });
    expect(adapterCalls).toBe(0);
    expect(events).toEqual(["claim", "authority", "lease-renew", "stage-b-authority", "secret"]);
  });

  it("never invokes the real adapter when the durable dispatch fence is rejected", async () => {
    const ctx = await context();
    const events: string[] = [];
    let adapterCalls = 0;

    const result = await runViraDurableExecutionWorkerOnce({
      scope: ctx.claimed.scope,
      workerId: "worker.prod12.worker",
      leaseMs: 30_000,
      now: nowSequence(),
      store: storeFor(ctx.claimed, events, { fence: "reject" }),
      authorityRepository: authorityRepository(ctx.authority, events),
      leaseStore: leaseStore(ctx.claimed, events),
      outcomeStore: outcomeStore(started(ctx.claimed, 5), events),
      verifier: verifier(),
      secretProvider: {
        resolve({ scope, secretRef }) {
          events.push("secret");
          return {
            scope,
            secretRef,
            credential: "credential-prod12-worker",
            expiresAtEpochMs: NOW + 20_000,
          };
        },
      },
      adapter: {
        invoke() {
          adapterCalls += 1;
          return { dispatch: "accepted" };
        },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      kind: "pre-dispatch-deferred",
      code: "VERSION_CONFLICT",
    });
    expect(adapterCalls).toBe(0);
    expect(events).toEqual([
      "claim",
      "authority",
      "lease-renew",
      "stage-b-authority",
      "secret",
      "dispatch-fence",
    ]);
  });

  it("persists uncertain when the real adapter throws after dispatch-started is durable", async () => {
    const ctx = await context();
    const events: string[] = [];

    const result = await runViraDurableExecutionWorkerOnce({
      scope: ctx.claimed.scope,
      workerId: "worker.prod12.worker",
      leaseMs: 30_000,
      now: nowSequence(),
      store: storeFor(ctx.claimed, events),
      authorityRepository: authorityRepository(ctx.authority, events),
      leaseStore: leaseStore(ctx.claimed, events),
      outcomeStore: outcomeStore(started(ctx.claimed, 5), events),
      verifier: verifier(),
      secretProvider: {
        resolve({ scope, secretRef }) {
          events.push("secret");
          return {
            scope,
            secretRef,
            credential: "credential-prod12-worker",
            expiresAtEpochMs: NOW + 20_000,
          };
        },
      },
      adapter: {
        invoke() {
          events.push("adapter");
          throw new Error("transport reset after request write");
        },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      kind: "processed",
      status: "uncertain",
      revision: 6,
    });
    expect(events).toEqual([
      "claim",
      "authority",
      "lease-renew",
      "stage-b-authority",
      "secret",
      "dispatch-fence",
      "adapter",
      "outcome:uncertain",
    ]);
  });

  it("fails before lease renewal and Stage B when the persisted authority coordinates drift", async () => {
    const ctx = await context();
    const events: string[] = [];
    let adapterCalls = 0;
    const drifted: ViraDurableExecutionAuthoritySnapshot = Object.freeze({
      ...ctx.authority,
      planDigest: "b".repeat(64),
    });

    const result = await runViraDurableExecutionWorkerOnce({
      scope: ctx.claimed.scope,
      workerId: "worker.prod12.worker",
      leaseMs: 30_000,
      now: nowSequence(),
      store: storeFor(ctx.claimed, events),
      authorityRepository: authorityRepository(drifted, events),
      leaseStore: leaseStore(ctx.claimed, events),
      outcomeStore: outcomeStore(started(ctx.claimed, 5), events),
      verifier: verifier(),
      secretProvider: {
        resolve() {
          throw new Error("must not resolve");
        },
      },
      adapter: {
        invoke() {
          adapterCalls += 1;
          return { dispatch: "accepted" };
        },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      kind: "authority-mismatch",
      code: "AUTHORITY_COORDINATE_MISMATCH",
    });
    expect(adapterCalls).toBe(0);
    expect(events).toEqual(["claim", "authority"]);
  });
});
