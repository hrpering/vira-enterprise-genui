import { describe, expect, it } from "vitest";
import { createUserActionFromEvent } from "../../packages/runtime-web/src/index.js";
import type { RuntimeWebActionIdFactory } from "../../packages/runtime-web/src/index.js";

function actionAdapter() {
  return {
    version: "1",
    id: "acme.web.actions",
    mappings: [{ event: "search.submit", actionType: "travel.flight.search.submit" }],
  };
}

function factory(ids: string[], calls: { value: number }): RuntimeWebActionIdFactory {
  return {
    nextId() {
      const index = calls.value;
      calls.value += 1;
      return ids[index] ?? "missing-id";
    },
  };
}

describe("runtime-web user event bridge", () => {
  it("creates a canonical RuntimeAction with source fixed to user", () => {
    const calls = { value: 0 };
    const result = createUserActionFromEvent(
      { actionAdapter: actionAdapter(), event: { event: "search.submit", payload: { origin: "IST" } } },
      factory(["action-1"], calls),
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        id: "action-1",
        type: "travel.flight.search.submit",
        source: "user",
        payload: { origin: "IST" },
      },
    });
    expect(calls.value).toBe(1);
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.payload)).toBe(true);
  });

  it("does not consume an ID when the adapter/event is invalid or unmapped", () => {
    const calls = { value: 0 };
    expect(createUserActionFromEvent(
      { actionAdapter: actionAdapter(), event: { event: "unknown.event" } },
      factory(["action-1"], calls),
    )).toMatchObject({ ok: false, issue: { code: "INVALID_ACTION_EVENT", path: "$.event.event" } });
    expect(calls.value).toBe(0);
  });

  it("attributes adapter validation failures to the adapter surface before touching the event or ID factory", () => {
    const calls = { value: 0 };
    expect(createUserActionFromEvent(
      { actionAdapter: { ...actionAdapter(), permission: "allow" }, event: { event: "search.submit" } },
      factory(["action-1"], calls),
    )).toMatchObject({ ok: false, issue: { code: "INVALID_ACTION_EVENT", path: "$.actionAdapter.permission" } });
    expect(calls.value).toBe(0);
  });

  it("does not permit input to provide id, source, or permission fields", () => {
    for (const field of ["id", "source", "permission", "authorize", "execute", "callback"]) {
      const calls = { value: 0 };
      expect(createUserActionFromEvent(
        { actionAdapter: actionAdapter(), event: { event: "search.submit" }, [field]: "forbidden" },
        factory(["action-1"], calls),
      )).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT", path: `$.${field}` } });
      expect(calls.value).toBe(0);
    }
  });

  it("fails closed for invalid IDs returned by the trusted factory", () => {
    const calls = { value: 0 };
    expect(createUserActionFromEvent(
      { actionAdapter: actionAdapter(), event: { event: "search.submit" } },
      factory(["bad id"], calls),
    )).toMatchObject({
      ok: false,
      issue: { code: "INVALID_RUNTIME_ACTION", path: "$.action.id" },
    });
    expect(calls.value).toBe(1);
  });

  it("contains raw ID factory exceptions", () => {
    const throwingFactory: RuntimeWebActionIdFactory = {
      nextId() {
        throw new Error("SECRET_ID_FACTORY_EXCEPTION");
      },
    };
    const result = createUserActionFromEvent(
      { actionAdapter: actionAdapter(), event: { event: "search.submit" } },
      throwingFactory,
    );
    expect(result).toEqual({
      ok: false,
      issue: { code: "ACTION_ID_FAILED", path: "$.actionId", message: "trusted action ID factory failed" },
    });
    if (!result.ok) expect(result.issue.message).not.toContain("SECRET_ID_FACTORY_EXCEPTION");
  });

  it("never allows event payload to change RuntimeAction source", () => {
    const calls = { value: 0 };
    const result = createUserActionFromEvent(
      { actionAdapter: actionAdapter(), event: { event: "search.submit", payload: { source: "system", id: "evil" } } },
      factory(["action-2"], calls),
    );
    expect(result).toMatchObject({ ok: true, value: { id: "action-2", source: "user", payload: { source: "system", id: "evil" } } });
  });
});
