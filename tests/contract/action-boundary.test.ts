import { describe, expect, it } from "vitest";
import {
  createViraActionBoundary,
  type ViraActionConfirmationGrant,
  type ViraActionIntent,
} from "../../packages/genui/src/index.js";

const instanceId = "instance-action-boundary";

function intent(
  id: string,
  expectedStateRevision = 42,
  idempotencyKey = `idem:${id}`,
  type = "commerce.order.submit",
): ViraActionIntent {
  return {
    version: "1",
    instanceId,
    expectedStateRevision,
    idempotencyKey,
    action: {
      id,
      type,
      source: "user",
      payload: { orderId: "order-1" },
    },
  };
}

function boundary(effect: "allow" | "deny" | "confirm" = "allow", initialRevision = 42) {
  let revision = initialRevision;
  const created = createViraActionBoundary({
    instanceId,
    catalog: [
      {
        actionType: "commerce.order.submit",
        effect: "write",
        idempotency: "action-id",
      },
      {
        actionType: "catalog.product.read",
        effect: "read",
        idempotency: "none",
      },
    ],
    permissionPolicy: {
      version: "1",
      rules: [
        { subject: "action", id: "commerce.order.submit", effect },
        { subject: "action", id: "catalog.product.read", effect: "allow" },
      ],
    },
    revisionProvider: () => revision,
  });
  return {
    created,
    setRevision(value: number) { revision = value; },
  };
}

function successfulWrite(stateRevision = 43) {
  return {
    outcome: "success" as const,
    stateRevision,
    data: { accepted: true },
  };
}

describe("MASTER-08 protected action boundary", () => {
  it("defaults to deny when no canonical permission rule exists", async () => {
    const created = createViraActionBoundary({
      instanceId,
      catalog: [{ actionType: "commerce.order.submit", effect: "write", idempotency: "action-id" }],
      permissionPolicy: { version: "1", rules: [] },
      revisionProvider: () => 42,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    let calls = 0;
    const result = await created.value.execute(intent("action-default-deny"), () => {
      calls += 1;
      return successfulWrite();
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("PERMISSION_DENIED");
    expect(calls).toBe(0);
    expect(created.value.consumedAction("action-default-deny")).toBe(false);
  });

  it("executes an allowed ActionIntent once and emits canonical ActionReceipt", async () => {
    const harness = boundary("allow");
    expect(harness.created.ok).toBe(true);
    if (!harness.created.ok) return;

    let calls = 0;
    const first = await harness.created.value.execute(intent("action-once"), ({ permit, intent: normalized }) => {
      calls += 1;
      expect(permit.effect).toBe("write");
      expect(permit.idempotency).toBe("action-id");
      expect(permit.expectedStateRevision).toBe(42);
      expect(normalized.idempotencyKey).toBe("idem:action-once");
      return successfulWrite(43);
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value.receipt).toEqual({
        version: "1",
        instanceId,
        actionId: "action-once",
        actionType: "commerce.order.submit",
        effect: "write",
        idempotencyKey: "idem:action-once",
        expectedStateRevision: 42,
        observedStateRevision: 43,
        outcome: "success",
        data: { accepted: true },
      });
    }
    expect(harness.created.value.consumedAction("action-once")).toBe(true);
    expect(harness.created.value.consumedIdempotencyKey("idem:action-once")).toBe(true);

    const replay = await harness.created.value.execute(intent("action-once"), () => {
      calls += 1;
      return successfulWrite();
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.issue.code).toBe("DUPLICATE_ACTION");
    expect(calls).toBe(1);
  });

  it("requires an exact matching approval grant", async () => {
    const harness = boundary("confirm");
    expect(harness.created.ok).toBe(true);
    if (!harness.created.ok) return;

    let calls = 0;
    const candidate = intent("action-confirm");
    const challenge = await harness.created.value.execute(candidate, () => {
      calls += 1;
      return successfulWrite();
    });
    expect(challenge.ok).toBe(false);
    if (challenge.ok) return;
    expect(challenge.issue.code).toBe("CONFIRMATION_REQUIRED");
    expect(challenge.challenge).toEqual({
      version: "1",
      instanceId,
      actionId: "action-confirm",
      actionType: "commerce.order.submit",
      effect: "write",
      expectedStateRevision: 42,
      idempotencyKey: "idem:action-confirm",
    });
    expect(harness.created.value.consumedAction("action-confirm")).toBe(false);

    const wrong: ViraActionConfirmationGrant = {
      version: "1",
      instanceId,
      actionId: "different-action",
      actionType: "commerce.order.submit",
      expectedStateRevision: 42,
      idempotencyKey: "idem:action-confirm",
    };
    const rejected = await harness.created.value.execute(candidate, () => {
      calls += 1;
      return successfulWrite();
    }, wrong);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.issue.code).toBe("INVALID_CONFIRMATION");
    expect(calls).toBe(0);

    const exact: ViraActionConfirmationGrant = {
      version: "1",
      instanceId,
      actionId: "action-confirm",
      actionType: "commerce.order.submit",
      expectedStateRevision: 42,
      idempotencyKey: "idem:action-confirm",
    };
    const accepted = await harness.created.value.execute(candidate, () => {
      calls += 1;
      return successfulWrite();
    }, exact);
    expect(accepted.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it("fails closed on exact-instance mismatch", async () => {
    const harness = boundary();
    expect(harness.created.ok).toBe(true);
    if (!harness.created.ok) return;

    let calls = 0;
    const candidate = intent("action-instance");
    const result = await harness.created.value.execute({ ...candidate, instanceId: "another-instance" }, () => {
      calls += 1;
      return successfulWrite();
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("INSTANCE_MISMATCH");
    expect(calls).toBe(0);
  });

  it("rejects stale state revision before reserving or executing", async () => {
    const harness = boundary("allow", 43);
    expect(harness.created.ok).toBe(true);
    if (!harness.created.ok) return;

    let calls = 0;
    const result = await harness.created.value.execute(intent("action-stale", 42), () => {
      calls += 1;
      return successfulWrite(44);
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("STALE_REVISION");
    expect(calls).toBe(0);
    expect(harness.created.value.consumedAction("action-stale")).toBe(false);
  });

  it("rejects local Runtime Core built-ins from the protected Host catalog", () => {
    const created = createViraActionBoundary({
      instanceId,
      catalog: [{ actionType: "runtime.patch.apply", effect: "write", idempotency: "action-id" }],
      permissionPolicy: {
        version: "1",
        rules: [{ subject: "action", id: "runtime.patch.apply", effect: "allow" }],
      },
      revisionProvider: () => 42,
    });
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.issue.code).toBe("INVALID_CATALOG");
  });

  it("requires action-id idempotency for write and irreversible definitions", () => {
    const created = createViraActionBoundary({
      instanceId,
      catalog: [{ actionType: "commerce.order.submit", effect: "write", idempotency: "none" }],
      permissionPolicy: { version: "1", rules: [] },
      revisionProvider: () => 42,
    });
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.issue.code).toBe("INVALID_CATALOG");
  });

  it("keeps action and idempotency identities consumed after uncertain adapter failure", async () => {
    const harness = boundary();
    expect(harness.created.ok).toBe(true);
    if (!harness.created.ok) return;

    const first = await harness.created.value.execute(intent("action-uncertain"), () => {
      throw new Error("transport lost after side effect");
    });
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.issue.code).toBe("EXECUTOR_FAILED");
    expect(harness.created.value.consumedAction("action-uncertain")).toBe(true);
    expect(harness.created.value.consumedIdempotencyKey("idem:action-uncertain")).toBe(true);

    const replay = await harness.created.value.execute(intent("action-uncertain"), () => successfulWrite());
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.issue.code).toBe("DUPLICATE_ACTION");
  });

  it("rejects retry with a new action id but an already consumed idempotency key", async () => {
    const harness = boundary();
    expect(harness.created.ok).toBe(true);
    if (!harness.created.ok) return;

    const key = "idem:booking-confirm";
    const first = await harness.created.value.execute(intent("action-key-1", 42, key), () => successfulWrite(43));
    expect(first.ok).toBe(true);
    harness.setRevision(43);

    let calls = 0;
    const retry = await harness.created.value.execute(intent("action-key-2", 43, key), () => {
      calls += 1;
      return successfulWrite(44);
    });
    expect(retry.ok).toBe(false);
    if (!retry.ok) expect(retry.issue.code).toBe("DUPLICATE_IDEMPOTENCY_KEY");
    expect(calls).toBe(0);
  });

  it("reserves before await so concurrent duplicate execution cannot cross twice", async () => {
    const harness = boundary();
    expect(harness.created.ok).toBe(true);
    if (!harness.created.ok) return;

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const firstPromise = harness.created.value.execute(intent("action-concurrent"), async () => {
      calls += 1;
      await gate;
      return successfulWrite(43);
    });

    const second = await harness.created.value.execute(intent("action-concurrent"), () => {
      calls += 1;
      return successfulWrite(43);
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.issue.code).toBe("DUPLICATE_ACTION");
    expect(calls).toBe(1);

    release();
    const first = await firstPromise;
    expect(first.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it("fails closed when a successful write adapter does not advance revision", async () => {
    const harness = boundary();
    expect(harness.created.ok).toBe(true);
    if (!harness.created.ok) return;

    const result = await harness.created.value.execute(intent("action-bad-receipt"), () => successfulWrite(42));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("INVALID_ADAPTER_RESULT");
    expect(harness.created.value.consumedAction("action-bad-receipt")).toBe(true);
  });
});
