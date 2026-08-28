import { describe, expect, it } from "vitest";
import {
  createRuntimePermissionPolicy,
  createRuntimeState,
} from "../../packages/runtime-core/src/index.js";
import {
  reduceUserEvent,
} from "../../packages/runtime-web/src/index.js";
import type { RuntimeWebActionIdFactory } from "../../packages/runtime-web/src/index.js";

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

function policy(type: string, effect: "allow" | "deny" | "confirm") {
  const result = createRuntimePermissionPolicy({
    version: "1",
    rules: [{ subject: "action", id: type, effect }],
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function adapter(actionType = "travel.flight.search.submit") {
  return {
    version: "1",
    id: "acme.web.actions",
    mappings: [{ event: "submit", actionType }],
  };
}

function idFactory(calls: { value: number }): RuntimeWebActionIdFactory {
  return {
    nextId() {
      calls.value += 1;
      return `action-${calls.value}`;
    },
  };
}

describe("runtime-web user event reducer bridge", () => {
  it("routes an allowed user event to a data-only host effect without executing it", () => {
    const calls = { value: 0 };
    const current = state();
    const result = reduceUserEvent({
      state: current,
      policy: policy("travel.flight.search.submit", "allow"),
      actionAdapter: adapter(),
      event: { event: "submit", payload: { query: "BER" } },
    }, idFactory(calls));

    expect(result).toMatchObject({
      ok: true,
      value: {
        action: { id: "action-1", source: "user", type: "travel.flight.search.submit" },
        state: current,
        effects: [{ type: "host-action", action: { type: "travel.flight.search.submit", source: "user" } }],
      },
    });
    expect(calls.value).toBe(1);
    if (!result.ok) return;
    expect(result.value.state).toEqual(current);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.effects)).toBe(true);
  });

  it("keeps confirm as a data-only effect with unchanged state", () => {
    const calls = { value: 0 };
    const current = state();
    const result = reduceUserEvent({
      state: current,
      policy: policy("travel.flight.search.submit", "confirm"),
      actionAdapter: adapter(),
      event: { event: "submit" },
    }, idFactory(calls));
    expect(result).toMatchObject({
      ok: true,
      value: { state: current, effects: [{ type: "confirmation-required" }] },
    });
    if (!result.ok) return;
    expect(result.value.state.plan.state.status).toBe("draft");
  });

  it("returns Runtime Core permission denial as a runtime-stage error", () => {
    const calls = { value: 0 };
    const result = reduceUserEvent({
      state: state(),
      policy: policy("travel.flight.search.submit", "deny"),
      actionAdapter: adapter(),
      event: { event: "submit" },
    }, idFactory(calls));
    expect(result).toMatchObject({
      ok: false,
      stage: "runtime",
      error: { code: "runtime.permission.denied" },
    });
    expect(calls.value).toBe(1);
  });

  it("uses Runtime Core built-in patch semantics when explicitly allowed", () => {
    const calls = { value: 0 };
    const current = state();
    const result = reduceUserEvent({
      state: current,
      policy: policy("runtime.patch.apply", "allow"),
      actionAdapter: adapter("runtime.patch.apply"),
      event: {
        event: "submit",
        payload: {
          patch: {
            version: "1",
            operations: [{ op: "replace", path: "/state/status", value: "ready" }],
          },
        },
      },
    }, idFactory(calls));
    expect(result).toMatchObject({
      ok: true,
      value: { state: { revision: 1, plan: { state: { status: "ready" } } }, effects: [] },
    });
    expect(current.plan.state.status).toBe("draft");
  });

  it("does not consume IDs or reach runtime reduction for invalid/unmapped events", () => {
    const calls = { value: 0 };
    const result = reduceUserEvent({
      state: state(),
      policy: policy("travel.flight.search.submit", "allow"),
      actionAdapter: adapter(),
      event: { event: "unknown" },
    }, idFactory(calls));
    expect(result).toMatchObject({ ok: false, stage: "event", issue: { code: "INVALID_ACTION_EVENT" } });
    expect(calls.value).toBe(0);
  });

  it("fails closed for an unnormalized policy instead of adding Runtime Web permission defaults", () => {
    const calls = { value: 0 };
    const result = reduceUserEvent({
      state: state(),
      policy: { version: "1", rules: [], defaultEffect: "allow" },
      actionAdapter: adapter(),
      event: { event: "submit" },
    }, idFactory(calls));
    expect(result).toMatchObject({
      ok: false,
      stage: "runtime",
      error: { code: "runtime.permission.denied", path: "$.policy" },
    });
  });
});
