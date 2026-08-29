import { describe, expect, it } from "vitest";
import {
  EXTERNAL_TOOL_RESULT_OUTCOMES,
  parseExternalToolResult,
} from "../../packages/tool-bridge/src/index.js";

function base(outcome: "success" | "partial" | "empty" | "failure" = "success") {
  return {
    version: "1",
    tool: { kind: "function", name: "travel.flight.search" },
    outcome,
  };
}

describe("tool-bridge provider-neutral external result contract", () => {
  it("normalizes success and partial results as detached frozen canonical JSON", () => {
    const input = {
      ...base("success"),
      data: { flights: [{ id: "F-1", price: 120 }] },
      freshness: { observedAtUnixMs: 1_000, expiresAtUnixMs: 2_000 },
    };
    const success = parseExternalToolResult(input);
    expect(success).toMatchObject({
      ok: true,
      value: {
        tool: { kind: "function", name: "travel.flight.search" },
        outcome: "success",
        data: { flights: [{ id: "F-1", price: 120 }] },
      },
    });
    if (!success.ok) return;
    expect(success.value).not.toBe(input);
    expect(success.value.data).not.toBe(input.data);
    expect(Object.isFrozen(success.value)).toBe(true);
    expect(Object.isFrozen(success.value.data)).toBe(true);
    const data = success.value.data as { readonly flights: readonly unknown[] };
    expect(Object.isFrozen(data.flights)).toBe(true);

    expect(parseExternalToolResult({
      ...base("partial"),
      data: { flights: [] },
      failure: { code: "upstream.partial" },
    })).toMatchObject({ ok: true, value: { outcome: "partial", failure: { code: "upstream.partial" } } });
  });

  it("models empty and failure without inventing data or raw error text", () => {
    expect(parseExternalToolResult(base("empty"))).toEqual({
      ok: true,
      value: {
        version: "1",
        tool: { kind: "function", name: "travel.flight.search" },
        outcome: "empty",
      },
    });
    expect(parseExternalToolResult({
      ...base("failure"),
      failure: { code: "upstream.timeout" },
    })).toMatchObject({ ok: true, value: { outcome: "failure", failure: { code: "upstream.timeout" } } });
  });

  it("enforces outcome/data/failure consistency before interpreting allowed failure metadata", () => {
    expect(parseExternalToolResult(base("success"))).toMatchObject({ ok: false, issue: { code: "OUTCOME_CONFLICT", path: "$.data" } });
    expect(parseExternalToolResult({ ...base("success"), data: {}, failure: { message: "raw" } })).toMatchObject({ ok: false, issue: { code: "OUTCOME_CONFLICT", path: "$.failure" } });
    expect(parseExternalToolResult({ ...base("empty"), data: null })).toMatchObject({ ok: false, issue: { code: "OUTCOME_CONFLICT", path: "$.data" } });
    expect(parseExternalToolResult(base("failure"))).toMatchObject({ ok: false, issue: { code: "OUTCOME_CONFLICT", path: "$.failure" } });
    expect(EXTERNAL_TOOL_RESULT_OUTCOMES).toEqual(["success", "partial", "empty", "failure"]);
  });

  it("rejects provider implementation, credential, opaque call-id, and raw exception fields", () => {
    for (const field of ["provider", "endpoint", "url", "token", "apiKey", "callId", "message", "stack", "response"]) {
      expect(parseExternalToolResult({ ...base("success"), data: {}, [field]: "forbidden" })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
    expect(parseExternalToolResult({
      ...base("failure"),
      failure: { code: "upstream.timeout", message: "SECRET raw upstream message" },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_FAILURE", path: "$.failure.message" } });
  });

  it("rejects accessors without executing them and attributes JSON failures to the owning surface", () => {
    let getterCalls = 0;
    const input = { ...base("success") } as Record<string, unknown>;
    Object.defineProperty(input, "data", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return { flights: [] };
      },
    });
    expect(parseExternalToolResult(input)).toMatchObject({ ok: false, issue: { code: "INVALID_DATA", path: "$.data" } });
    expect(getterCalls).toBe(0);

    expect(parseExternalToolResult({ ...base("success"), data: { callback() {} } })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_DATA", path: "$.data.callback" },
    });
  });

  it("validates semantic identity and freshness with exact nested paths", () => {
    expect(parseExternalToolResult({ ...base("success"), tool: { kind: "HTTP", name: "travel.flight.search" }, data: {} })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_TOOL", path: "$.tool.kind" },
    });
    expect(parseExternalToolResult({ ...base("success"), data: {}, freshness: { observedAtUnixMs: 20, expiresAtUnixMs: 10 } })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_FRESHNESS", path: "$.freshness.expiresAtUnixMs" },
    });
    expect(parseExternalToolResult({ ...base("failure"), failure: { code: "Raw Error!" } })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_FAILURE", path: "$.failure.code" },
    });
  });
});
