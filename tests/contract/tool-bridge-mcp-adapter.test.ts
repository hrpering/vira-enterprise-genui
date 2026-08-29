import { describe, expect, it } from "vitest";
import {
  normalizeMcpCallToolResult,
  parseExternalToolResult,
} from "../../packages/tool-bridge/src/index.js";

describe("tool-bridge MCP CallToolResult adapter", () => {
  it("normalizes MCP structuredContent into canonical structured success", () => {
    const result = normalizeMcpCallToolResult("travel.flight.search", {
      content: [{ type: "text", text: "2 flights found" }],
      structuredContent: { flights: [{ id: "F-1", price: 120 }] },
      isError: false,
      _meta: { trace: "must-not-propagate" },
      vendorExtension: { internal: true },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        version: "1",
        tool: { kind: "mcp", name: "travel.flight.search" },
        outcome: "success",
        data: { flights: [{ id: "F-1", price: 120 }] },
      },
    });
    if (!result.ok) return;
    expect(parseExternalToolResult(result.value).ok).toBe(true);
    expect("_meta" in result.value).toBe(false);
    expect("vendorExtension" in result.value).toBe(false);
  });

  it("maps tool-level MCP errors to semantic failure without leaking raw error content", () => {
    const result = normalizeMcpCallToolResult("travel.flight.search", {
      content: [{ type: "text", text: "secret upstream token abc failed at https://internal.example" }],
      structuredContent: { internalError: "do-not-copy" },
      isError: true,
      _meta: { stack: "do-not-copy" },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        version: "1",
        tool: { kind: "mcp", name: "travel.flight.search" },
        outcome: "failure",
        failure: { code: "mcp.tool.error" },
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret upstream token");
    expect(JSON.stringify(result)).not.toContain("internal.example");
    expect(JSON.stringify(result)).not.toContain("do-not-copy");
  });

  it("maps a successful structurally empty MCP result to canonical empty", () => {
    expect(normalizeMcpCallToolResult("travel.flight.search", {
      content: [],
      isError: false,
    })).toEqual({
      ok: true,
      value: {
        version: "1",
        tool: { kind: "mcp", name: "travel.flight.search" },
        outcome: "empty",
      },
    });
  });

  it("refuses non-empty unstructured-only success instead of inventing GenUI data", () => {
    const result = normalizeMcpCallToolResult("travel.flight.search", {
      content: [{ type: "text", text: "{not actually trusted json}" }],
      isError: false,
    });
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "UNSTRUCTURED_RESULT", path: "$.result.structuredContent" },
    });
    expect(JSON.stringify(result)).not.toContain("not actually trusted json");
  });

  it("fails closed on invalid tool identity and malformed MCP structural fields", () => {
    expect(normalizeMcpCallToolResult("Search Flights", { content: [] })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_TOOL_NAME", path: "$.toolName" },
    });
    expect(normalizeMcpCallToolResult("travel.flight.search", { content: "text" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CONTENT", path: "$.result.content" },
    });
    expect(normalizeMcpCallToolResult("travel.flight.search", { content: [], isError: "false" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_IS_ERROR", path: "$.result.isError" },
    });
    expect(normalizeMcpCallToolResult("travel.flight.search", { content: [], structuredContent: [] })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_STRUCTURED_CONTENT", path: "$.result.structuredContent" },
    });
  });

  it("rejects accessor-backed provider data without invoking the getter", () => {
    let reads = 0;
    const input: Record<string, unknown> = { content: [] };
    Object.defineProperty(input, "structuredContent", {
      enumerable: true,
      get() {
        reads += 1;
        return { flights: [] };
      },
    });

    const result = normalizeMcpCallToolResult("travel.flight.search", input);
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_RESULT" } });
    expect(reads).toBe(0);
  });
});
