import { describe, expect, it } from "vitest";
import {
  VIRA_DURABLE_EXECUTION_WORKER_MAX_BATCH,
  runViraDurableExecutionWorkerBatch,
} from "../../apps/vira-worker/src/durable-execution-runtime.js";
import type {
  ViraDurableExecutionWorkerDependencies,
  ViraDurableExecutionWorkerResult,
} from "../../apps/vira-worker/src/durable-execution-worker.js";

const dependencies = Object.freeze({}) as unknown as ViraDurableExecutionWorkerDependencies;

function processed(revision: number): ViraDurableExecutionWorkerResult {
  return {
    ok: true,
    kind: "processed",
    executionId: `execution.runtime.${revision}`,
    status: "verifying",
    revision,
  };
}

describe("PROD-12 bounded durable execution worker runtime", () => {
  it("stops on idle after processing the available bounded work", async () => {
    const sequence: ViraDurableExecutionWorkerResult[] = [
      processed(1),
      processed(2),
      { ok: true, kind: "idle" },
    ];
    let calls = 0;

    const result = await runViraDurableExecutionWorkerBatch({
      dependencies,
      maxItems: 10,
      executeOnce() {
        const next = sequence[calls];
        calls += 1;
        if (next === undefined) throw new Error("runtime called beyond idle");
        return next;
      },
    });

    expect(result).toMatchObject({
      attempted: 3,
      processed: 2,
      stopReason: "idle",
    });
    expect(result.results).toHaveLength(3);
    expect(calls).toBe(3);
    expect(Object.isFrozen(result.results)).toBe(true);
  });

  it("stops on the first fail-closed worker result", async () => {
    const sequence: ViraDurableExecutionWorkerResult[] = [
      processed(1),
      {
        ok: false,
        kind: "stage-b-rejected",
        executionId: "execution.runtime.blocked",
        code: "AUTHORITY_REJECTED",
      },
      processed(3),
    ];
    let calls = 0;

    const result = await runViraDurableExecutionWorkerBatch({
      dependencies,
      maxItems: 10,
      executeOnce() {
        const next = sequence[calls];
        calls += 1;
        if (next === undefined) throw new Error("runtime called beyond sequence");
        return next;
      },
    });

    expect(result).toMatchObject({ attempted: 2, processed: 1, stopReason: "blocked" });
    expect(calls).toBe(2);
  });

  it("never processes more than the configured batch limit", async () => {
    let calls = 0;
    const result = await runViraDurableExecutionWorkerBatch({
      dependencies,
      maxItems: 2,
      executeOnce() {
        calls += 1;
        return processed(calls);
      },
    });

    expect(result).toMatchObject({ attempted: 2, processed: 2, stopReason: "limit" });
    expect(calls).toBe(2);
  });

  it("rejects zero, oversized and non-integer batch sizes", async () => {
    await expect(runViraDurableExecutionWorkerBatch({ dependencies, maxItems: 0 })).rejects.toThrow(/batch input/);
    await expect(runViraDurableExecutionWorkerBatch({
      dependencies,
      maxItems: VIRA_DURABLE_EXECUTION_WORKER_MAX_BATCH + 1,
    })).rejects.toThrow(/batch input/);
    await expect(runViraDurableExecutionWorkerBatch({ dependencies, maxItems: 1.5 })).rejects.toThrow(/batch input/);
  });
});
