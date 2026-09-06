import { describe, expect, it } from "vitest";
import {
  createViraActionBoundary,
  type ViraActionIntent,
} from "../../packages/action-boundary/src/index.js";

const instanceId = "instance-prod10-preflight";

function intent(
  id: string,
  expectedStateRevision = 42,
  type = "commerce.order.submit",
): ViraActionIntent {
  return {
    version: "1",
    instanceId,
    expectedStateRevision,
    idempotencyKey: `idem:${id}`,
    action: {
      id,
      type,
      source: "user",
      payload: { orderId: "order-1" },
    },
  };
}

function harness(effect: "allow" | "deny" | "confirm" = "allow", initialRevision = 42) {
  let revision = initialRevision;
  const created = createViraActionBoundary({
    instanceId,
    catalog: [
      { actionType: "commerce.order.submit", effect: "write", idempotency: "action-id" },
      { actionType: "catalog.product.read", effect: "read", idempotency: "none" },
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

describe("PROD-10 Action Boundary Stage A preflight", () => {
  it("returns allow semantics without reserving or consuming execution identity", () => {
    const test = harness("allow");
    expect(test.created.ok).toBe(true);
    if (!test.created.ok) return;

    const candidate = intent("action-preflight-allow");
    const first = test.created.value.preflight(candidate);
    const second = test.created.value.preflight(candidate);

    expect(first).toMatchObject({
      ok: true,
      value: {
        permission: "allow",
        currentRevision: 42,
        challenge: null,
        intent: { action: { id: "action-preflight-allow", type: "commerce.order.submit" } },
        definition: { actionType: "commerce.order.submit", effect: "write", idempotency: "action-id" },
      },
    });
    expect(second).toMatchObject({ ok: true, value: { permission: "allow", currentRevision: 42 } });
    expect(test.created.value.consumedAction("action-preflight-allow")).toBe(false);
    expect(test.created.value.consumedIdempotencyKey("idem:action-preflight-allow")).toBe(false);
  });

  it("returns an approval challenge for confirm policy without consuming approval or reservation", () => {
    const test = harness("confirm");
    expect(test.created.ok).toBe(true);
    if (!test.created.ok) return;

    const result = test.created.value.preflight(intent("action-preflight-confirm"));
    expect(result).toMatchObject({
      ok: true,
      value: {
        permission: "confirm",
        currentRevision: 42,
        challenge: {
          version: "1",
          instanceId,
          actionId: "action-preflight-confirm",
          actionType: "commerce.order.submit",
          effect: "write",
          expectedStateRevision: 42,
          idempotencyKey: "idem:action-preflight-confirm",
        },
      },
    });
    expect(test.created.value.consumedAction("action-preflight-confirm")).toBe(false);
    expect(test.created.value.consumedIdempotencyKey("idem:action-preflight-confirm")).toBe(false);
  });

  it("fails closed on denied policy, unknown Action and stale revision without reserving", () => {
    const denied = harness("deny");
    expect(denied.created.ok).toBe(true);
    if (!denied.created.ok) return;
    expect(denied.created.value.preflight(intent("action-denied")))
      .toMatchObject({ ok: false, issue: { code: "PERMISSION_DENIED" } });
    expect(denied.created.value.consumedAction("action-denied")).toBe(false);

    const allowed = harness("allow", 43);
    expect(allowed.created.ok).toBe(true);
    if (!allowed.created.ok) return;
    expect(allowed.created.value.preflight(intent("action-stale", 42)))
      .toMatchObject({ ok: false, issue: { code: "STALE_REVISION" } });
    expect(allowed.created.value.preflight(intent("action-unknown", 43, "missing.action")))
      .toMatchObject({ ok: false, issue: { code: "ACTION_NOT_REGISTERED" } });
    expect(allowed.created.value.consumedAction("action-stale")).toBe(false);
    expect(allowed.created.value.consumedAction("action-unknown")).toBe(false);
  });

  it("keeps preflight read-only while execute preserves canonical reservation semantics", async () => {
    const test = harness("allow");
    expect(test.created.ok).toBe(true);
    if (!test.created.ok) return;

    const candidate = intent("action-after-preflight");
    expect(test.created.value.preflight(candidate)).toMatchObject({ ok: true });
    expect(test.created.value.consumedAction("action-after-preflight")).toBe(false);

    let calls = 0;
    const executed = await test.created.value.execute(candidate, () => {
      calls += 1;
      return { outcome: "success", stateRevision: 43 };
    });
    expect(executed).toMatchObject({ ok: true, value: { permission: "allow" } });
    expect(calls).toBe(1);
    expect(test.created.value.consumedAction("action-after-preflight")).toBe(true);
    expect(test.created.value.consumedIdempotencyKey("idem:action-after-preflight")).toBe(true);
  });

  it("does not commit revision observations during pure preflight", () => {
    const test = harness("allow", 42);
    expect(test.created.ok).toBe(true);
    if (!test.created.ok) return;

    expect(test.created.value.preflight(intent("action-observe-42", 42))).toMatchObject({ ok: true });
    test.setRevision(41);
    expect(test.created.value.preflight(intent("action-observe-41", 41))).toMatchObject({ ok: true });
    expect(test.created.value.consumedAction("action-observe-42")).toBe(false);
    expect(test.created.value.consumedAction("action-observe-41")).toBe(false);
  });
});
