import { describe, expect, it } from "vitest";
import {
  createRuntimePermissionPolicy,
  createRuntimeState,
  reduceRuntime,
  transitionRuntimeLifecycle,
} from "../../packages/runtime-core/src/index.js";

function state() {
  const result = createRuntimeState("experience-1", {
    version: "1",
    id: "plan-1",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: { status: "draft" },
    capabilities: {},
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function policy(rules: unknown[]) {
  const result = createRuntimePermissionPolicy({ version: "1", rules });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

describe("runtime reducer", () => {
  it("fails closed for forged/invalid runtime state before effects", () => {
    const forged = { ...state(), revision: -1 };
    const result = reduceRuntime(
      forged,
      { id: "action-1", type: "search.submit", source: "user" },
      policy([{ subject: "action", id: "search.submit", effect: "allow" }]),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "runtime.state.invalid", path: "$.state.revision" } });
  });

  it("fails closed before effects for an unmatched action", () => {
    expect(reduceRuntime(
      state(),
      { id: "action-1", type: "search.submit", source: "system" },
      policy([]),
    )).toMatchObject({ ok: false, error: { code: "runtime.permission.denied" } });
  });

  it("fails closed for an invalid unnormalized policy", () => {
    expect(reduceRuntime(
      state(),
      { id: "action-1", type: "search.submit", source: "system" },
      { version: "1", rules: [], defaultEffect: "allow" },
    )).toMatchObject({ ok: false, error: { code: "runtime.permission.denied", path: "$.policy" } });
  });

  it("returns confirmation as a data-only effect without execution/state mutation", () => {
    const current = state();
    const result = reduceRuntime(
      current,
      { id: "action-1", type: "booking.confirm", source: "user", payload: { bookingId: "B1" } },
      policy([{ subject: "action", id: "booking.confirm", effect: "confirm" }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state).toEqual(current);
    expect(result.value.effects[0]).toMatchObject({ type: "confirmation-required", action: { type: "booking.confirm" } });
    expect(Object.isFrozen(result.value.state)).toBe(true);
  });

  it("does not emit confirmation for malformed built-in actions", () => {
    expect(reduceRuntime(
      state(),
      { id: "action-life", type: "runtime.lifecycle.transition", source: "host", payload: { target: "mounting", extra: true } },
      policy([{ subject: "action", id: "runtime.lifecycle.transition", effect: "confirm" }]),
    )).toMatchObject({ ok: false, error: { code: "runtime.action.invalid" } });
  });

  it("routes an allowed domain action to a host effect without executing it", () => {
    const current = state();
    const result = reduceRuntime(
      current,
      { id: "action-1", type: "search.submit", source: "user", payload: { query: "BER" } },
      policy([{ subject: "action", id: "search.submit", effect: "allow" }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state).toEqual(current);
    expect(result.value.effects).toEqual([
      expect.objectContaining({ type: "host-action", action: expect.objectContaining({ type: "search.submit" }) }),
    ]);
    expect(Object.isFrozen(result.value.effects)).toBe(true);
    expect(Object.isFrozen(result.value.effects[0])).toBe(true);
  });

  it("applies an explicitly allowed runtime patch with no host effect", () => {
    const current = state();
    const result = reduceRuntime(
      current,
      {
        id: "action-patch",
        type: "runtime.patch.apply",
        source: "host",
        payload: { patch: { version: "1", operations: [{ op: "replace", path: "/state/status", value: "ready" }] } },
      },
      policy([{ subject: "action", id: "runtime.patch.apply", effect: "allow" }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.plan.state.status).toBe("ready");
    expect(result.value.state.revision).toBe(1);
    expect(result.value.effects).toEqual([]);
    expect(current.plan.state.status).toBe("draft");
  });

  it("does not apply a confirm-gated patch", () => {
    const current = state();
    const result = reduceRuntime(
      current,
      {
        id: "action-patch",
        type: "runtime.patch.apply",
        source: "system",
        payload: { patch: { version: "1", operations: [{ op: "replace", path: "/state/status", value: "ready" }] } },
      },
      policy([{ subject: "action", id: "runtime.patch.apply", effect: "confirm" }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.plan.state.status).toBe("draft");
    expect(result.value.effects[0]?.type).toBe("confirmation-required");
  });

  it("applies an explicitly allowed lifecycle transition", () => {
    expect(reduceRuntime(
      state(),
      { id: "action-life", type: "runtime.lifecycle.transition", source: "host", payload: { target: "mounting" } },
      policy([{ subject: "action", id: "runtime.lifecycle.transition", effect: "allow" }]),
    )).toMatchObject({ ok: true, value: { state: { lifecycle: "mounting", revision: 1 }, effects: [] } });
  });

  it("rejects patch and generic host effects after a terminal lifecycle", () => {
    let current = state();
    for (const target of ["mounting", "active", "completed"] as const) {
      const transitioned = transitionRuntimeLifecycle(current, target);
      if (!transitioned.ok) throw new Error(transitioned.issue.message);
      current = transitioned.value;
    }

    expect(reduceRuntime(
      current,
      { id: "action-patch", type: "runtime.patch.apply", source: "host", payload: { patch: { version: "1", operations: [] } } },
      policy([{ subject: "action", id: "runtime.patch.apply", effect: "allow" }]),
    )).toMatchObject({ ok: false, error: { code: "runtime.patch.rejected", path: "$.lifecycle" } });

    expect(reduceRuntime(
      current,
      { id: "action-host", type: "search.submit", source: "user" },
      policy([{ subject: "action", id: "search.submit", effect: "allow" }]),
    )).toMatchObject({ ok: false, error: { code: "runtime.action.unhandled", path: "$.lifecycle" } });
  });

  it("maps malformed and lifecycle-invalid actions to canonical errors", () => {
    expect(reduceRuntime(
      state(),
      { id: "bad id", type: "search.submit", source: "user" },
      policy([{ subject: "action", id: "search.submit", effect: "allow" }]),
    )).toMatchObject({ ok: false, error: { code: "runtime.action.invalid" } });

    expect(reduceRuntime(
      state(),
      { id: "action-life", type: "runtime.lifecycle.transition", source: "host", payload: { target: "active" } },
      policy([{ subject: "action", id: "runtime.lifecycle.transition", effect: "confirm" }]),
    )).toMatchObject({ ok: false, error: { code: "runtime.lifecycle.invalid-transition" } });
  });
});
