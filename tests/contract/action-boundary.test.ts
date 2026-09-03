import { describe, expect, it } from "vitest";
import {
  createViraActionBoundary,
  type ViraActionBoundaryProposal,
  type ViraActionConfirmationGrant,
} from "../../packages/genui/src/index.js";

const instanceId = "instance-action-boundary";

function proposal(
  id: string,
  type = "commerce.order.submit",
): ViraActionBoundaryProposal {
  return {
    version: "1",
    instanceId,
    action: {
      id,
      type,
      source: "user",
      payload: { orderId: "order-1" },
    },
  };
}

function boundary(effect: "allow" | "deny" | "confirm" = "allow") {
  return createViraActionBoundary({
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
  });
}

describe("MASTER-08 protected action boundary", () => {
  it("defaults to deny when no canonical permission rule exists", async () => {
    const created = createViraActionBoundary({
      instanceId,
      catalog: [{ actionType: "commerce.order.submit", effect: "write", idempotency: "action-id" }],
      permissionPolicy: { version: "1", rules: [] },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    let calls = 0;
    const result = await created.value.execute(proposal("action-default-deny"), () => {
      calls += 1;
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("PERMISSION_DENIED");
    expect(calls).toBe(0);
    expect(created.value.consumed("action-default-deny")).toBe(false);
  });

  it("executes an allowed protected action exactly once", async () => {
    const created = boundary("allow");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    let calls = 0;
    const first = await created.value.execute(proposal("action-once"), ({ permit }) => {
      calls += 1;
      expect(permit.effect).toBe("write");
      expect(permit.idempotency).toBe("action-id");
      return { accepted: true };
    });
    expect(first.ok).toBe(true);
    expect(created.value.consumed("action-once")).toBe(true);

    const replay = await created.value.execute(proposal("action-once"), () => {
      calls += 1;
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.issue.code).toBe("DUPLICATE_ACTION");
    expect(calls).toBe(1);
  });

  it("requires an exact matching confirmation grant", async () => {
    const created = boundary("confirm");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    let calls = 0;
    const candidate = proposal("action-confirm");
    const challenge = await created.value.execute(candidate, () => {
      calls += 1;
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
    });
    expect(created.value.consumed("action-confirm")).toBe(false);

    const wrong: ViraActionConfirmationGrant = {
      version: "1",
      instanceId,
      actionId: "different-action",
      actionType: "commerce.order.submit",
    };
    const rejected = await created.value.execute(candidate, () => {
      calls += 1;
    }, wrong);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.issue.code).toBe("INVALID_CONFIRMATION");
    expect(calls).toBe(0);

    const exact: ViraActionConfirmationGrant = {
      version: "1",
      instanceId,
      actionId: "action-confirm",
      actionType: "commerce.order.submit",
    };
    const accepted = await created.value.execute(candidate, () => {
      calls += 1;
      return "done";
    }, exact);
    expect(accepted.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it("fails closed on exact-instance mismatch", async () => {
    const created = boundary();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    let calls = 0;
    const candidate = proposal("action-instance");
    const result = await created.value.execute({ ...candidate, instanceId: "another-instance" }, () => {
      calls += 1;
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("INSTANCE_MISMATCH");
    expect(calls).toBe(0);
  });

  it("rejects local Runtime Core built-ins from the protected Host catalog", () => {
    const created = createViraActionBoundary({
      instanceId,
      catalog: [{ actionType: "runtime.patch.apply", effect: "write", idempotency: "action-id" }],
      permissionPolicy: {
        version: "1",
        rules: [{ subject: "action", id: "runtime.patch.apply", effect: "allow" }],
      },
    });
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.issue.code).toBe("INVALID_CATALOG");
  });

  it("requires action-id idempotency for write and irreversible definitions", () => {
    const created = createViraActionBoundary({
      instanceId,
      catalog: [{ actionType: "commerce.order.submit", effect: "write", idempotency: "none" }],
      permissionPolicy: { version: "1", rules: [] },
    });
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.issue.code).toBe("INVALID_CATALOG");
  });

  it("keeps an action consumed after uncertain executor failure", async () => {
    const created = boundary();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const first = await created.value.execute(proposal("action-uncertain"), () => {
      throw new Error("transport lost after side effect");
    });
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.issue.code).toBe("EXECUTOR_FAILED");
    expect(created.value.consumed("action-uncertain")).toBe(true);

    const replay = await created.value.execute(proposal("action-uncertain"), () => "must-not-run");
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.issue.code).toBe("DUPLICATE_ACTION");
  });

  it("reserves before await so concurrent duplicate execution cannot cross twice", async () => {
    const created = boundary();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const firstPromise = created.value.execute(proposal("action-concurrent"), async () => {
      calls += 1;
      await gate;
      return "first";
    });

    const second = await created.value.execute(proposal("action-concurrent"), () => {
      calls += 1;
      return "second";
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.issue.code).toBe("DUPLICATE_ACTION");
    expect(calls).toBe(1);

    release();
    const first = await firstPromise;
    expect(first.ok).toBe(true);
    expect(calls).toBe(1);
  });
});
