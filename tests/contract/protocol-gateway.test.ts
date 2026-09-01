import { describe, expect, it } from "vitest";
import {
  normalizeLangChainToolMessage,
  normalizeMcpCallToolResult,
  parseExternalToolResult,
} from "../../packages/tool-bridge/src/index.js";
import {
  normalizeProtocolGatewayResult,
  PROTOCOL_GATEWAY_PROTOCOLS,
} from "../../packages/protocol-gateway/src/index.js";

class FakeToolMessage {
  content: string | unknown[];
  artifact: unknown;
  status: "success" | "error" | undefined;
  tool_call_id = "opaque-call-id-must-not-propagate";

  constructor(fields: {
    content: string | unknown[];
    artifact?: unknown;
    status?: "success" | "error";
  }) {
    this.content = fields.content;
    this.artifact = fields.artifact;
    this.status = fields.status;
  }
}

describe("Protocol Gateway v1", () => {
  it("exposes only provider protocols with existing canonical normalizers", () => {
    expect(PROTOCOL_GATEWAY_PROTOCOLS).toEqual(["mcp", "langchain"]);
    expect(Object.isFrozen(PROTOCOL_GATEWAY_PROTOCOLS)).toBe(true);
  });

  it("dispatches MCP through the existing tool-bridge normalizer with exact canonical parity", () => {
    const payload = {
      content: [{ type: "text", text: "2 flights found" }],
      structuredContent: { flights: [{ id: "F-1", price: 120 }] },
      isError: false,
      _meta: { trace: "must-not-propagate" },
    };
    const canonical = normalizeMcpCallToolResult("travel.flight.search", payload);
    const gateway = normalizeProtocolGatewayResult({
      protocol: "mcp",
      toolName: "travel.flight.search",
      payload,
    });
    expect(gateway).toEqual(canonical);
    expect(gateway.ok).toBe(true);
    if (gateway.ok) expect(parseExternalToolResult(gateway.value).ok).toBe(true);
  });

  it("dispatches LangChain class instances through the existing normalizer with exact canonical parity", () => {
    const payload = new FakeToolMessage({
      content: "2 flights found",
      artifact: { flights: [{ id: "F-1", price: 120 }] },
      status: "success",
    });
    const canonical = normalizeLangChainToolMessage("travel.flight.search", payload);
    const gateway = normalizeProtocolGatewayResult({
      protocol: "langchain",
      toolName: "travel.flight.search",
      payload,
    });
    expect(gateway).toEqual(canonical);
    expect(JSON.stringify(gateway)).not.toContain("opaque-call-id");
  });

  it("preserves canonical sanitized MCP and LangChain error results", () => {
    const mcp = normalizeProtocolGatewayResult({
      protocol: "mcp",
      toolName: "travel.flight.search",
      payload: {
        content: [{ type: "text", text: "secret token https://internal.example" }],
        isError: true,
      },
    });
    expect(mcp).toMatchObject({
      ok: true,
      value: { outcome: "failure", failure: { code: "mcp.tool.error" } },
    });
    expect(JSON.stringify(mcp)).not.toContain("secret token");
    expect(JSON.stringify(mcp)).not.toContain("internal.example");

    const langchain = normalizeProtocolGatewayResult({
      protocol: "langchain",
      toolName: "travel.flight.search",
      payload: new FakeToolMessage({
        content: "secret customer error",
        status: "error",
      }),
    });
    expect(langchain).toMatchObject({
      ok: true,
      value: { outcome: "failure", failure: { code: "langchain.tool.error" } },
    });
    expect(JSON.stringify(langchain)).not.toContain("secret customer error");
  });

  it("normalizes provider-specific validation paths and messages to the Gateway boundary", () => {
    expect(normalizeProtocolGatewayResult({
      protocol: "mcp",
      toolName: "travel.flight.search",
      payload: { content: "not-array" },
    })).toEqual({
      ok: false,
      issue: {
        code: "INVALID_PAYLOAD",
        path: "$.payload",
        message: "protocol gateway provider payload is invalid",
      },
    });

    expect(normalizeProtocolGatewayResult({
      protocol: "langchain",
      toolName: "travel.flight.search",
      payload: { content: "", status: "pending" },
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PAYLOAD", path: "$.payload" },
    });
  });

  it("keeps invalid tool identity separate from invalid provider payload", () => {
    expect(normalizeProtocolGatewayResult({
      protocol: "mcp",
      toolName: "Search Flights",
      payload: { content: [] },
    })).toEqual({
      ok: false,
      issue: {
        code: "INVALID_TOOL_NAME",
        path: "$.toolName",
        message: "protocol gateway tool name is invalid",
      },
    });
  });

  it("fails closed on unsupported protocols and unknown wrapper fields without reflecting arbitrary key names", () => {
    expect(normalizeProtocolGatewayResult({
      protocol: "a2a",
      toolName: "travel.flight.search",
      payload: {},
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PROTOCOL", path: "$.protocol" },
    });

    const sensitiveField = "customer@example.com";
    const result = normalizeProtocolGatewayResult({
      protocol: "mcp",
      toolName: "travel.flight.search",
      payload: { content: [] },
      [sensitiveField]: true,
    });
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$" },
    });
    expect(JSON.stringify(result)).not.toContain(sensitiveField);
  });

  it("rejects accessor and symbol-backed wrapper state without executing getters", () => {
    let reads = 0;
    const accessorInput: Record<string, unknown> = {
      toolName: "travel.flight.search",
      payload: { content: [] },
    };
    Object.defineProperty(accessorInput, "protocol", {
      enumerable: true,
      get() {
        reads += 1;
        return "mcp";
      },
    });
    expect(normalizeProtocolGatewayResult(accessorInput)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$.protocol" },
    });
    expect(reads).toBe(0);

    const symbolInput = {
      protocol: "mcp",
      toolName: "travel.flight.search",
      payload: { content: [] },
    };
    Object.defineProperty(symbolInput, Symbol("secret"), { value: true });
    expect(normalizeProtocolGatewayResult(symbolInput)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$" },
    });
  });

  it("does not pre-read provider payload accessors before the owning adapter handles them", () => {
    let reads = 0;
    const payload: Record<string, unknown> = { content: [] };
    Object.defineProperty(payload, "structuredContent", {
      enumerable: true,
      get() {
        reads += 1;
        return { flights: [] };
      },
    });
    expect(normalizeProtocolGatewayResult({
      protocol: "mcp",
      toolName: "travel.flight.search",
      payload,
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PAYLOAD", path: "$.payload" },
    });
    expect(reads).toBe(0);
  });
});
