import { describe, expect, it } from "vitest";
import { createRuntimeAction } from "../../packages/runtime-core/src/index.js";

describe("RuntimeAction", () => {
  it("normalizes and freezes a valid semantic action", () => {
    const payload = { origin: "IST", destination: "BER", nested: { flexible: true } };
    const result = createRuntimeAction({
      id: "action-1",
      type: "search.submit",
      source: "user",
      payload,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ id: "action-1", type: "search.submit", source: "user" });
    expect(result.value.payload).toEqual(payload);
    expect(result.value.payload).not.toBe(payload);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.payload)).toBe(true);
    expect(Object.isFrozen(result.value.payload.nested)).toBe(true);
  });

  it("normalizes a missing payload to an empty frozen object", () => {
    const result = createRuntimeAction({ id: "action-2", type: "experience.close", source: "system" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.payload).toEqual({});
    expect(Object.isFrozen(result.value.payload)).toBe(true);
  });

  it("rejects implementation and execution fields", () => {
    for (const field of ["event", "endpoint", "component", "callback", "timestamp"]) {
      expect(createRuntimeAction({
        id: "action-1",
        type: "search.submit",
        source: "user",
        [field]: "not-canonical",
      })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("rejects invalid action ids, semantic types, sources, and payloads", () => {
    expect(createRuntimeAction({ id: "bad id", type: "search.submit", source: "user" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ID", path: "$.id" },
    });
    expect(createRuntimeAction({ id: "action-1", type: "Search Submit", source: "user" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ACTION_TYPE", path: "$.type" },
    });
    expect(createRuntimeAction({ id: "action-1", type: "search.submit", source: "dom" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_SOURCE", path: "$.source" },
    });
    expect(createRuntimeAction({ id: "action-1", type: "search.submit", source: "user", payload: [] })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PAYLOAD", path: "$.payload" },
    });
  });

  it("rejects accessor/non-canonical input without invoking getters", () => {
    let calls = 0;
    const input: Record<string, unknown> = {
      id: "action-1",
      type: "search.submit",
      source: "user",
    };
    Object.defineProperty(input, "payload", {
      enumerable: true,
      get() {
        calls += 1;
        return {};
      },
    });

    expect(createRuntimeAction(input)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE", path: "$.payload" } });
    expect(calls).toBe(0);
  });

  it("is JSON serializable and generates neither id nor timestamp implicitly", () => {
    const result = createRuntimeAction({ id: "action-3", type: "date.select", source: "host", payload: { date: "2026-09-02" } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.hasOwn(result.value, "timestamp")).toBe(false);
    expect(JSON.parse(JSON.stringify(result.value))).toEqual(result.value);
  });
});
