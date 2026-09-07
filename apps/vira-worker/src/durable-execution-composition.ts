import type { ViraTransactionGrantVerifier } from "../../../packages/action-transaction/src/index.js";
import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import type {
  ViraPrivateRunnerAdapter,
  ViraPrivateRunnerSecretProvider,
} from "../../../packages/private-runner/src/index.js";
import {
  canonicalizeEnterpriseScope,
  createPostgresDurableExecutionAuthorityRepository,
  createPostgresDurableExecutionLeaseStore,
  createPostgresDurableExecutionOutcomeStore,
  createPostgresDurableExecutionRecoveryScanner,
  createPostgresDurableExecutionStore,
  type PostgresPoolLike,
} from "../../../integrations/postgres/src/index.js";
import {
  runViraDurableExecutionWorkerBatch,
  type ViraDurableExecutionWorkerBatchResult,
} from "./durable-execution-runtime.js";
import type { ViraDurableExecutionWorkerDependencies } from "./durable-execution-worker.js";

export interface ViraDurableExecutionWorkerCompositionInput {
  readonly pool: PostgresPoolLike;
  readonly scope: ViraEnterpriseScope;
  readonly workerId: string;
  readonly leaseMs: number;
  readonly now?: () => number;
  readonly verifier: ViraTransactionGrantVerifier;
  readonly secretProvider: ViraPrivateRunnerSecretProvider;
  readonly adapter: ViraPrivateRunnerAdapter;
}

export interface ViraDurableExecutionWorkerComposition {
  readonly dependencies: ViraDurableExecutionWorkerDependencies;
  readonly runBatch: (maxItems: number) => Promise<ViraDurableExecutionWorkerBatchResult>;
}

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const MAX_LEASE_MS = 5 * 60 * 1_000;

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function safeLeaseMs(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= MAX_LEASE_MS;
}

function systemNow(): number {
  return Date.now();
}

export function createViraDurableExecutionWorkerComposition(
  input: ViraDurableExecutionWorkerCompositionInput,
): ViraDurableExecutionWorkerComposition {
  if (
    input === null
    || typeof input !== "object"
    || input.pool === null
    || typeof input.pool !== "object"
    || typeof input.pool.connect !== "function"
    || input.scope === null
    || typeof input.scope !== "object"
    || !safeToken(input.workerId)
    || !safeLeaseMs(input.leaseMs)
    || (input.now !== undefined && typeof input.now !== "function")
    || input.verifier === null
    || typeof input.verifier !== "object"
    || typeof input.verifier.verify !== "function"
    || input.secretProvider === null
    || typeof input.secretProvider !== "object"
    || typeof input.secretProvider.resolve !== "function"
    || input.adapter === null
    || typeof input.adapter !== "object"
    || typeof input.adapter.invoke !== "function"
  ) throw new TypeError("durable execution worker composition input is invalid");

  const scope = canonicalizeEnterpriseScope(input.scope);
  const store = createPostgresDurableExecutionStore(input.pool);
  const authorityRepository = createPostgresDurableExecutionAuthorityRepository(input.pool);
  const recoveryScanner = createPostgresDurableExecutionRecoveryScanner(input.pool);
  const leaseStore = createPostgresDurableExecutionLeaseStore(input.pool);
  const outcomeStore = createPostgresDurableExecutionOutcomeStore(input.pool);

  const dependencies: ViraDurableExecutionWorkerDependencies = Object.freeze({
    scope,
    workerId: input.workerId,
    leaseMs: input.leaseMs,
    now: input.now ?? systemNow,
    store,
    authorityRepository,
    recoveryScanner,
    leaseStore,
    outcomeStore,
    verifier: input.verifier,
    secretProvider: input.secretProvider,
    adapter: input.adapter,
  });

  return Object.freeze({
    dependencies,
    runBatch(maxItems: number) {
      return runViraDurableExecutionWorkerBatch({ dependencies, maxItems });
    },
  });
}
