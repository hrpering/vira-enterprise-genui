import type { ViraTransactionGrantVerifier } from "../../../packages/action-transaction/src/index.js";
import {
  consumeViraDurableExecutionStageB,
  type ViraDurableExecutionRecord,
} from "../../../packages/durable-execution/src/index.js";
import type { ViraDurableExecutionAuthoritySnapshot } from "../../../packages/durable-execution/src/authority.js";
import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import {
  runViraPrivateExecution,
  type ViraPrivateRunnerAdapter,
  type ViraPrivateRunnerSecretProvider,
} from "../../../packages/private-runner/src/index.js";
import type {
  ViraPostgresDurableExecutionAuthorityRepository,
  ViraPostgresDurableExecutionLeaseStore,
  ViraPostgresDurableExecutionOutcomeStore,
  ViraPostgresDurableExecutionRecoveryScanner,
  ViraPostgresDurableExecutionStore,
} from "../../../integrations/postgres/src/index.js";

export type ViraDurableExecutionWorkerResult =
  | { readonly ok: true; readonly kind: "idle" }
  | {
      readonly ok: true;
      readonly kind: "processed";
      readonly executionId: string;
      readonly status: "verifying" | "manual" | "uncertain";
      readonly revision: number;
    }
  | {
      readonly ok: false;
      readonly kind:
        | "recovery-rejected"
        | "authority-missing"
        | "authority-mismatch"
        | "lease-renew-rejected"
        | "stage-b-rejected"
        | "pre-dispatch-deferred"
        | "outcome-persist-failed";
      readonly executionId: string;
      readonly code: string;
    };

export interface ViraDurableExecutionWorkerDependencies {
  readonly scope: ViraEnterpriseScope;
  readonly workerId: string;
  readonly leaseMs: number;
  readonly now: () => number;
  readonly store: ViraPostgresDurableExecutionStore;
  readonly authorityRepository: ViraPostgresDurableExecutionAuthorityRepository;
  readonly recoveryScanner?: ViraPostgresDurableExecutionRecoveryScanner;
  readonly leaseStore: ViraPostgresDurableExecutionLeaseStore;
  readonly outcomeStore: ViraPostgresDurableExecutionOutcomeStore;
  readonly verifier: ViraTransactionGrantVerifier;
  readonly secretProvider: ViraPrivateRunnerSecretProvider;
  readonly adapter: ViraPrivateRunnerAdapter;
}

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const MAX_LEASE_MS = 5 * 60 * 1_000;

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function safePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function exactAuthority(
  record: ViraDurableExecutionRecord,
  authority: ViraDurableExecutionAuthoritySnapshot,
): boolean {
  return authority.executionId === record.executionId
    && exactScope(authority.scope, record.scope)
    && authority.transactionId === record.transactionId
    && authority.planDigest === record.planDigest
    && authority.planRevision === record.planRevision
    && authority.operationId === record.operationId
    && authority.grantId === record.grantId
    && authority.grantNonce === record.grantNonce;
}

function readNow(now: () => number): number {
  const value = now();
  if (!safePositive(value)) throw new TypeError("durable worker clock returned an invalid epoch millisecond value");
  return value;
}

function processedStatus(status: ViraDurableExecutionRecord["status"]): "verifying" | "manual" | "uncertain" {
  if (status === "verifying" || status === "manual" || status === "uncertain") return status;
  throw new TypeError("durable worker outcome store returned an unexpected post-dispatch status");
}

export async function runViraDurableExecutionWorkerOnce(
  dependencies: ViraDurableExecutionWorkerDependencies,
): Promise<ViraDurableExecutionWorkerResult> {
  if (
    dependencies === null
    || typeof dependencies !== "object"
    || !safeToken(dependencies.workerId)
    || !safePositive(dependencies.leaseMs)
    || dependencies.leaseMs > MAX_LEASE_MS
    || typeof dependencies.now !== "function"
    || dependencies.store === null
    || typeof dependencies.store !== "object"
    || dependencies.authorityRepository === null
    || typeof dependencies.authorityRepository !== "object"
    || (dependencies.recoveryScanner !== undefined && (
      dependencies.recoveryScanner === null
      || typeof dependencies.recoveryScanner !== "object"
      || typeof dependencies.recoveryScanner.findNextExpired !== "function"
    ))
    || dependencies.leaseStore === null
    || typeof dependencies.leaseStore !== "object"
    || dependencies.outcomeStore === null
    || typeof dependencies.outcomeStore !== "object"
    || dependencies.verifier === null
    || typeof dependencies.verifier !== "object"
    || dependencies.secretProvider === null
    || typeof dependencies.secretProvider !== "object"
    || dependencies.adapter === null
    || typeof dependencies.adapter !== "object"
  ) throw new TypeError("durable execution worker dependencies are invalid");

  if (dependencies.recoveryScanner !== undefined) {
    let expired;
    try {
      expired = await dependencies.recoveryScanner.findNextExpired(dependencies.scope);
    } catch {
      return {
        ok: false,
        kind: "recovery-rejected",
        executionId: "recovery.scan",
        code: "RECOVERY_SCAN_FAILED",
      };
    }
    if (expired !== undefined) {
      let recovered;
      try {
        recovered = await dependencies.store.recoverExpired({
          scope: dependencies.scope,
          executionId: expired.executionId,
          expectedRevision: expired.expectedRevision,
          nowEpochMs: expired.nowEpochMs,
        });
      } catch {
        return {
          ok: false,
          kind: "recovery-rejected",
          executionId: expired.executionId,
          code: "RECOVERY_STORE_FAILED",
        };
      }
      if (!recovered.ok && recovered.code !== "NOT_FOUND" && recovered.code !== "VERSION_CONFLICT") {
        return {
          ok: false,
          kind: "recovery-rejected",
          executionId: expired.executionId,
          code: recovered.code,
        };
      }
    }
  }

  const claimNow = readNow(dependencies.now);
  const claimed = await dependencies.store.claimNext({
    scope: dependencies.scope,
    workerId: dependencies.workerId,
    nowEpochMs: claimNow,
    leaseMs: dependencies.leaseMs,
  });
  if (claimed === undefined) return { ok: true, kind: "idle" };

  const authority = await dependencies.authorityRepository.readAuthority(claimed.scope, claimed.executionId);
  if (authority === undefined) {
    return {
      ok: false,
      kind: "authority-missing",
      executionId: claimed.executionId,
      code: "AUTHORITY_NOT_FOUND",
    };
  }
  if (!exactAuthority(claimed, authority)) {
    return {
      ok: false,
      kind: "authority-mismatch",
      executionId: claimed.executionId,
      code: "AUTHORITY_COORDINATE_MISMATCH",
    };
  }

  let renewed;
  try {
    renewed = await dependencies.leaseStore.renew({
      scope: claimed.scope,
      executionId: claimed.executionId,
      workerId: dependencies.workerId,
      leaseEpoch: claimed.leaseEpoch,
      expectedRevision: claimed.revision,
      nowEpochMs: readNow(dependencies.now),
      leaseMs: dependencies.leaseMs,
    });
  } catch {
    return {
      ok: false,
      kind: "lease-renew-rejected",
      executionId: claimed.executionId,
      code: "LEASE_STORE_FAILED",
    };
  }
  if (!renewed.ok) {
    return {
      ok: false,
      kind: "lease-renew-rejected",
      executionId: claimed.executionId,
      code: renewed.code,
    };
  }
  const leased = renewed.value;

  const stageB = await consumeViraDurableExecutionStageB({
    record: leased,
    frozen: authority.frozen,
    grant: authority.grant,
    operationId: leased.operationId,
    workerId: dependencies.workerId,
    leaseEpoch: leased.leaseEpoch,
    expectedRevision: leased.revision,
    nowEpochMs: readNow(dependencies.now),
    verifier: dependencies.verifier,
    store: dependencies.store,
  });
  if (!stageB.ok) {
    return {
      ok: false,
      kind: "stage-b-rejected",
      executionId: leased.executionId,
      code: stageB.issue.code,
    };
  }

  let dispatchRecord: ViraDurableExecutionRecord | undefined;
  let dispatchFenceCode: string | undefined;
  const fencedAdapter: ViraPrivateRunnerAdapter = {
    async invoke(input) {
      let started;
      try {
        started = await dependencies.store.markDispatchStarted({
          scope: stageB.value.scope,
          executionId: stageB.value.executionId,
          workerId: dependencies.workerId,
          leaseEpoch: stageB.value.leaseEpoch,
          expectedRevision: stageB.value.reservationRevision,
          nowEpochMs: readNow(dependencies.now),
        });
      } catch {
        dispatchFenceCode = "DISPATCH_FENCE_STORE_FAILED";
        throw new Error("durable dispatch fence failed before private adapter invocation");
      }
      if (!started.ok) {
        dispatchFenceCode = started.code;
        throw new Error("durable dispatch fence rejected before private adapter invocation");
      }
      dispatchRecord = started.value;
      return dependencies.adapter.invoke(input);
    },
  };

  const privateResult = await runViraPrivateExecution({
    permit: stageB.value,
    nowEpochMs: readNow(dependencies.now),
    secretProvider: dependencies.secretProvider,
    adapter: fencedAdapter,
  });

  if (dispatchRecord === undefined) {
    const code: string = privateResult.ok
      ? "DISPATCH_FENCE_NOT_REACHED"
      : dispatchFenceCode ?? privateResult.issue.code;
    return {
      ok: false,
      kind: "pre-dispatch-deferred",
      executionId: leased.executionId,
      code,
    };
  }

  const outcome = privateResult.ok
    ? privateResult.value.dispatch === "accepted" ? "accepted" : "rejected"
    : "uncertain";

  let persisted;
  try {
    persisted = await dependencies.outcomeStore.record({
      scope: dispatchRecord.scope,
      executionId: dispatchRecord.executionId,
      workerId: dependencies.workerId,
      leaseEpoch: dispatchRecord.leaseEpoch,
      expectedRevision: dispatchRecord.revision,
      nowEpochMs: readNow(dependencies.now),
      outcome,
    });
  } catch {
    return {
      ok: false,
      kind: "outcome-persist-failed",
      executionId: dispatchRecord.executionId,
      code: "OUTCOME_STORE_FAILED",
    };
  }
  if (!persisted.ok) {
    return {
      ok: false,
      kind: "outcome-persist-failed",
      executionId: dispatchRecord.executionId,
      code: persisted.code,
    };
  }

  return {
    ok: true,
    kind: "processed",
    executionId: persisted.value.executionId,
    status: processedStatus(persisted.value.status),
    revision: persisted.value.revision,
  };
}
