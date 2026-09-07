import {
  runViraDurableExecutionWorkerOnce,
  type ViraDurableExecutionWorkerDependencies,
  type ViraDurableExecutionWorkerResult,
} from "./durable-execution-worker.js";

export const VIRA_DURABLE_EXECUTION_WORKER_MAX_BATCH = 100;

export type ViraDurableExecutionWorkerBatchStopReason = "idle" | "blocked" | "limit";

export interface ViraDurableExecutionWorkerBatchResult {
  readonly attempted: number;
  readonly processed: number;
  readonly stopReason: ViraDurableExecutionWorkerBatchStopReason;
  readonly results: readonly ViraDurableExecutionWorkerResult[];
}

export interface ViraRunDurableExecutionWorkerBatchInput {
  readonly dependencies: ViraDurableExecutionWorkerDependencies;
  readonly maxItems: number;
  readonly executeOnce?: (
    dependencies: ViraDurableExecutionWorkerDependencies,
  ) => Promise<ViraDurableExecutionWorkerResult> | ViraDurableExecutionWorkerResult;
}

function validBatchSize(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= VIRA_DURABLE_EXECUTION_WORKER_MAX_BATCH;
}

export async function runViraDurableExecutionWorkerBatch(
  input: ViraRunDurableExecutionWorkerBatchInput,
): Promise<ViraDurableExecutionWorkerBatchResult> {
  if (
    input === null
    || typeof input !== "object"
    || input.dependencies === null
    || typeof input.dependencies !== "object"
    || !validBatchSize(input.maxItems)
    || (input.executeOnce !== undefined && typeof input.executeOnce !== "function")
  ) throw new TypeError("durable execution worker batch input is invalid");

  const executeOnce = input.executeOnce ?? runViraDurableExecutionWorkerOnce;
  const results: ViraDurableExecutionWorkerResult[] = [];
  let processed = 0;

  for (let index = 0; index < input.maxItems; index += 1) {
    const result = await executeOnce(input.dependencies);
    results.push(result);

    if (result.ok && result.kind === "processed") {
      processed += 1;
      continue;
    }

    return Object.freeze({
      attempted: results.length,
      processed,
      stopReason: result.ok ? "idle" : "blocked",
      results: Object.freeze([...results]),
    });
  }

  return Object.freeze({
    attempted: results.length,
    processed,
    stopReason: "limit",
    results: Object.freeze([...results]),
  });
}
