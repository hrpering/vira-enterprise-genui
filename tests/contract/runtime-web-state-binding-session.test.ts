import { describe, expect, it } from "vitest";
import { createRuntimeState } from "../../packages/runtime-core/src/index.js";
import {
  createStateBindingSession,
} from "../../packages/runtime-web/src/index.js";
import type { RuntimeWebActionIdFactory } from "../../packages/runtime-web/src/index.js";

function initialState() {
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

function mutableState() {
  return JSON.parse(JSON.stringify(initialState())) as {
    experienceId: string;
    revision: number;
    lifecycle: string;
    plan: { state: { status: string } };
  };
}

function policy(effect: "allow" | "deny" | "confirm", type = "travel.flight.search.submit") {
  return {
    version: "1",
    rules: [{ subject: "action", id: type, effect }],
  };
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

function sessionFor(
  calls: { value: number },
  effect: "allow" | "deny" | "confirm" = "allow",
  actionType = "travel.flight.search.submit",
) {
  const result = createStateBindingSession({
    state: initialState(),
    policy: policy(effect, actionType),
    actionAdapter: adapter(actionType),
  }, idFactory(calls));
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

describe("runtime-web state binding session", () => {
  it("keeps one current RuntimeState reference for same-revision host effects", () => {
    const calls = { value: 0 };
    const session = sessionFor(calls);
    const before = session.currentState();
    const result = session.process({ event: "submit", payload: { query: "BER" } });
    expect(result).toMatchObject({
      ok: true,
      value: { stateChanged: false, effects: [{ type: "host-action" }] },
    });
    if (!result.ok) return;
    expect(result.value.state).toBe(before);
    expect(session.currentState()).toBe(before);
    expect(calls.value).toBe(1);
  });

  it("does not advance state for confirmation-required reductions", () => {
    const calls = { value: 0 };
    const session = sessionFor(calls, "confirm");
    const before = session.currentState();
    const result = session.process({ event: "submit" });
    expect(result).toMatchObject({ ok: true, value: { stateChanged: false, effects: [{ type: "confirmation-required" }] } });
    if (!result.ok) return;
    expect(result.value.state).toBe(before);
    expect(session.currentState()).toBe(before);
  });

  it("atomically advances current state for an allowed Runtime Core patch", () => {
    const calls = { value: 0 };
    const session = sessionFor(calls, "allow", "runtime.patch.apply");
    const before = session.currentState();
    const result = session.process({
      event: "submit",
      payload: {
        patch: {
          version: "1",
          operations: [{ op: "replace", path: "/state/status", value: "ready" }],
        },
      },
    });
    expect(result).toMatchObject({
      ok: true,
      value: { stateChanged: true, state: { revision: 1, plan: { state: { status: "ready" } } }, effects: [] },
    });
    if (!result.ok) return;
    expect(session.currentState()).toBe(result.value.state);
    expect(session.currentState()).not.toBe(before);
    expect(before.plan.state.status).toBe("draft");
  });

  it("leaves current state untouched for permission denial and invalid events", () => {
    const deniedCalls = { value: 0 };
    const denied = sessionFor(deniedCalls, "deny");
    const deniedBefore = denied.currentState();
    expect(denied.process({ event: "submit" })).toMatchObject({ ok: false, stage: "runtime", error: { code: "runtime.permission.denied" } });
    expect(denied.currentState()).toBe(deniedBefore);

    const invalidCalls = { value: 0 };
    const invalid = sessionFor(invalidCalls);
    const invalidBefore = invalid.currentState();
    expect(invalid.process({ event: "unknown" })).toMatchObject({ ok: false, stage: "event" });
    expect(invalid.currentState()).toBe(invalidBefore);
    expect(invalidCalls.value).toBe(0);
  });

  it("normalizes creation inputs instead of retaining caller-owned mutable state/policy/adapter objects", () => {
    const calls = { value: 0 };
    const rawState = mutableState();
    const rawPolicy = policy("allow");
    const rawAdapter = adapter();
    const created = createStateBindingSession({ state: rawState, policy: rawPolicy, actionAdapter: rawAdapter }, idFactory(calls));
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    rawState.plan.state.status = "mutated";
    rawPolicy.rules[0]!.effect = "deny";
    rawAdapter.mappings[0]!.actionType = "admin.delete";

    expect(created.value.currentState().plan.state.status).toBe("draft");
    const result = created.value.process({ event: "submit" });
    expect(result).toMatchObject({ ok: true, value: { action: { type: "travel.flight.search.submit" } } });
  });

  it("fails creation closed for invalid initial state, policy, adapter, or unknown root fields", () => {
    expect(createStateBindingSession({
      state: { ...initialState(), revision: -1 },
      policy: policy("allow"),
      actionAdapter: adapter(),
    }, idFactory({ value: 0 }))).toMatchObject({ ok: false, issue: { code: "INVALID_INITIAL_STATE", path: "$.state.revision" } });

    expect(createStateBindingSession({
      state: initialState(),
      policy: { version: "1", rules: [], defaultEffect: "allow" },
      actionAdapter: adapter(),
    }, idFactory({ value: 0 }))).toMatchObject({ ok: false, issue: { code: "INVALID_POLICY" } });

    expect(createStateBindingSession({
      state: initialState(),
      policy: policy("allow"),
      actionAdapter: { ...adapter(), execute: "forbidden" },
    }, idFactory({ value: 0 }))).toMatchObject({ ok: false, issue: { code: "INVALID_ACTION_ADAPTER" } });

    expect(createStateBindingSession({
      state: initialState(),
      policy: policy("allow"),
      actionAdapter: adapter(),
      queue: "forbidden",
    }, idFactory({ value: 0 }))).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT", path: "$.queue" } });
  });

  it("disposal prevents further processing before action ID allocation", () => {
    const calls = { value: 0 };
    const session = sessionFor(calls);
    const before = session.currentState();
    session.dispose();
    session.dispose();
    expect(session.process({ event: "submit" })).toMatchObject({
      ok: false,
      stage: "session",
      issue: { code: "SESSION_DISPOSED" },
    });
    expect(session.currentState()).toBe(before);
    expect(calls.value).toBe(0);
  });
});