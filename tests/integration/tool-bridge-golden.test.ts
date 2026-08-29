import { describe, expect, it } from "vitest";
import {
  evaluateToolResultFreshness,
  normalizeLangChainToolMessage,
  normalizeMcpCallToolResult,
  normalizeToolResultToDomainData,
  parseExternalToolResult,
} from "../../packages/tool-bridge/src/index.js";

const flightData = {
  flights: [
    { id: "F-1", from: "IST", to: "BER", price: 120 },
    { id: "F-2", from: "SAW", to: "BER", price: 135 },
  ],
};

function mapping(kind: string) {
  return {
    version: "1",
    tool: { kind, name: "travel.flight.search" },
    domain: "travel.flight",
    type: "results",
  };
}

class ToolMessageFixture {
  content = "2 flights found";
  artifact = flightData;
  status: "success" | "error" | undefined = "success";
  tool_call_id = "opaque-langchain-call-id";
  metadata = { trace: "provider-only" };
}

describe("tool-bridge golden integration", () => {
  it("converges custom, MCP, and LangChain structured success on the same DomainData semantics", () => {
    const custom = parseExternalToolResult({
      version: "1",
      tool: { kind: "function", name: "travel.flight.search" },
      outcome: "success",
      data: flightData,
      freshness: { observedAtUnixMs: 1_000, expiresAtUnixMs: 2_000 },
    });
    const mcp = normalizeMcpCallToolResult("travel.flight.search", {
      content: [{ type: "text", text: "2 flights found" }],
      structuredContent: flightData,
      _meta: { trace: "provider-only" },
    });
    const langchain = normalizeLangChainToolMessage("travel.flight.search", new ToolMessageFixture());

    expect(custom.ok).toBe(true);
    expect(mcp.ok).toBe(true);
    expect(langchain.ok).toBe(true);
    if (!custom.ok || !mcp.ok || !langchain.ok) return;

    const customDomain = normalizeToolResultToDomainData(custom.value, mapping("function"));
    const mcpDomain = normalizeToolResultToDomainData(mcp.value, mapping("mcp"));
    const langchainDomain = normalizeToolResultToDomainData(langchain.value, mapping("langchain"));

    for (const normalized of [customDomain, mcpDomain, langchainDomain]) {
      expect(normalized).toMatchObject({
        ok: true,
        value: {
          outcome: "success",
          domainData: {
            version: "1",
            domain: "travel.flight",
            type: "results",
            data: flightData,
          },
        },
      });
    }

    if (!customDomain.ok || !mcpDomain.ok || !langchainDomain.ok) return;
    if (
      customDomain.value.outcome !== "success"
      || mcpDomain.value.outcome !== "success"
      || langchainDomain.value.outcome !== "success"
    ) return;

    expect(customDomain.value.domainData.source).toEqual({ kind: "function", name: "travel.flight.search" });
    expect(mcpDomain.value.domainData.source).toEqual({ kind: "mcp", name: "travel.flight.search" });
    expect(langchainDomain.value.domainData.source).toEqual({ kind: "langchain", name: "travel.flight.search" });
    expect(JSON.stringify(mcpDomain)).not.toContain("provider-only");
    expect(JSON.stringify(langchainDomain)).not.toContain("opaque-langchain-call-id");
  });

  it("keeps freshness explicit and does not invent provider timestamps", () => {
    const custom = parseExternalToolResult({
      version: "1",
      tool: { kind: "function", name: "travel.flight.search" },
      outcome: "success",
      data: flightData,
      freshness: { observedAtUnixMs: 1_000, expiresAtUnixMs: 2_000 },
    });
    const mcp = normalizeMcpCallToolResult("travel.flight.search", {
      content: [],
      structuredContent: flightData,
    });
    expect(custom.ok).toBe(true);
    expect(mcp.ok).toBe(true);
    if (!custom.ok || !mcp.ok) return;

    expect(evaluateToolResultFreshness(custom.value, 1_500)).toEqual({
      ok: true,
      value: { status: "fresh", nowUnixMs: 1_500, observedAtUnixMs: 1_000, expiresAtUnixMs: 2_000 },
    });
    expect(evaluateToolResultFreshness(mcp.value, 1_500)).toEqual({
      ok: true,
      value: { status: "unknown", nowUnixMs: 1_500 },
    });
  });

  it("redacts provider error details and refuses JSON-looking unstructured content", () => {
    const mcpError = normalizeMcpCallToolResult("travel.flight.search", {
      content: [{ type: "text", text: "token=secret internal error" }],
      isError: true,
      _meta: { stack: "sensitive" },
    });

    const langchainErrorMessage = new ToolMessageFixture();
    langchainErrorMessage.status = "error";
    langchainErrorMessage.content = "token=secret internal error";
    langchainErrorMessage.artifact = { stack: "sensitive" };
    const langchainError = normalizeLangChainToolMessage("travel.flight.search", langchainErrorMessage);

    expect(mcpError).toMatchObject({
      ok: true,
      value: { outcome: "failure", failure: { code: "mcp.tool.error" } },
    });
    expect(langchainError).toMatchObject({
      ok: true,
      value: { outcome: "failure", failure: { code: "langchain.tool.error" } },
    });
    expect(JSON.stringify(mcpError)).not.toContain("secret");
    expect(JSON.stringify(mcpError)).not.toContain("sensitive");
    expect(JSON.stringify(langchainError)).not.toContain("secret");
    expect(JSON.stringify(langchainError)).not.toContain("sensitive");

    const mcpUnstructured = normalizeMcpCallToolResult("travel.flight.search", {
      content: [{ type: "text", text: JSON.stringify(flightData) }],
    });
    const langchainUnstructured = normalizeLangChainToolMessage("travel.flight.search", {
      content: JSON.stringify(flightData),
      artifact: undefined,
      status: "success",
    });
    expect(mcpUnstructured).toMatchObject({ ok: false, issue: { code: "UNSTRUCTURED_RESULT" } });
    expect(langchainUnstructured).toMatchObject({ ok: false, issue: { code: "UNSTRUCTURED_RESULT" } });
  });
});
