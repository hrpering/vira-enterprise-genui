import { describe, expect, it } from "vitest";
import {
  createViraActionBoundary,
  type ViraActionIntent,
} from "../../packages/genui/src/index.js";

const instanceId = "instance-revision-concurrency";

function intent(id: string, expectedStateRevision: number): ViraActionIntent {
  return {
    version: "1",
    instanceId,
    expectedStateRevision,
    idempotencyKey: `idem:${id}`,
    action: {
      id,
      type: "commerce.order.submit",
      source: "user",
      payload: { orderId: id },
    },
  };
}

function createHarness(initialRevision = 42) {
  let revision = initialRevision;
  const created = createViraActionBoundary({
    instanceId,
    catalog: [{ actionType: "commerce.order.submit", effect: "write", idempotency: "action-id" }],
    permissionPolicy: {
      version: "1",
      rules: [{ subject: "action", id: "commerce.order.submit", effect: "allow" }],
    },
    revisionProvider: () => revision,
  });
  return {
    created,
    setRevision(value: number) { revision = value; },
  };
}

describe("MASTER-08 effect-revision ownership", () => {
  it("allows only one effectful ActionIntent to own a state revision at a time", async () => {
    const harness = createHarness();
    expect(harness.created.ok).toBe(true);
    if (!harness.created.ok) return;

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;

    const firstPromise = harness.created.value.execute(intent("action-rev-a", 42), async () => {
      calls += 1;
      await gate;
      return { outcome: "success" as const, stateRevision: 43 };
    });

    const second = await harness.created.value.execute(intent("action-rev-b", 42), () => {
      calls += 1;
      return { outcome: "success" as const, stateRevision: 43 };
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.issue.code).toBe("REVISION_CONFLICT");
    expect(calls).toBe(1);
    expect(harness.created.value.consumedAction("action-rev-b")).toBe(false);

    release();
    expect((await firstPromise).ok).toBe(true);
  });

  it("releases effect-revision ownership after a trusted deterministic no-effect result", async () => {
    const harness = createHarness();
    expect(harness.created.ok).toBe(true);
    if (!harness.created.ok) return;

    const first = await harness.created.value.execute(intent("action-no-effect-a", 42), () => ({
      outcome: "error" as const,
      stateRevision: 42,
      data: { reason: "validation-rejected" },
    }));
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value.receipt.outcome).toBe("error");

    let calls = 0;
    const second = await harness.created.value.execute(intent("action-no-effect-b", 42), () => {
      calls += 1;
      return { outcome: "success" as const, stateRevision: 43 };
    });
    expect(second.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it("fails closed when the trusted revision provider regresses", async () => {
    const harness = createHarness(42);
    expect(harness.created.ok).toBe(true);
    if (!harness.created.ok) return;

    expect(harness.created.value.currentRevision()).toBe(42);
    harness.setRevision(41);

    let calls = 0;
    const result = await harness.created.value.execute(intent("action-regressed", 41), () => {
      calls += 1;
      return { outcome: "success" as const, stateRevision: 42 };
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("INVALID_REVISION");
    expect(calls).toBe(0);
    expect(harness.created.value.consumedAction("action-regressed")).toBe(false);
  });
});
