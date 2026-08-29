import { describe, expect, it } from "vitest";
import {
  normalizeLangChainToolMessage,
  parseExternalToolResult,
} from "../../packages/tool-bridge/src/index.js";

class FakeToolMessage {
  content: string | unknown[];
  artifact: unknown;
  status: "success" | "error" | undefined;
  tool_call_id = "opaque-call-id-must-not-propagate";
  metadata = { trace: "must-not-propagate" };

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

describe("tool-bridge LangChainJS ToolMessage adapter", () => {
  it("prefers canonical artifact as structured success and drops ToolMessage transport metadata", () => {
    const message = new FakeToolMessage({
      content: "2 flights found",
      artifact: { flights: [{ id: "F-1", price: 120 }] },
      status: "success",
    });
    const result = normalizeLangChainToolMessage("travel.flight.search", message);
    expect(result).toEqual({
      ok: true,
      value: {
        version: "1",
        tool: { kind: "langchain", name: "travel.flight.search" },
        outcome: "success",
        data: { flights: [{ id: "F-1", price: 120 }] },
      },
    });
    if (!result.ok) return;
    expect(parseExternalToolResult(result.value).ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("opaque-call-id");
    expect(JSON.stringify(result)).not.toContain("must-not-propagate");
  });

  it("maps error status without reading or leaking artifact/content details", () => {
    let artifactReads = 0;
    const message = new FakeToolMessage({
      content: "secret upstream token abc failed at https://internal.example",
      status: "error",
    });
    Object.defineProperty(message, "artifact", {
      enumerable: true,
      get() {
        artifactReads += 1;
        return { secret: "do-not-read" };
      },
    });

    const result = normalizeLangChainToolMessage("travel.flight.search", message);
    expect(result).toEqual({
      ok: true,
      value: {
        version: "1",
        tool: { kind: "langchain", name: "travel.flight.search" },
        outcome: "failure",
        failure: { code: "langchain.tool.error" },
      },
    });
    expect(artifactReads).toBe(0);
    expect(JSON.stringify(result)).not.toContain("secret upstream token");
    expect(JSON.stringify(result)).not.toContain("internal.example");
  });

  it("treats omitted status as success and maps empty content without artifact to empty", () => {
    expect(normalizeLangChainToolMessage("travel.flight.search", new FakeToolMessage({ content: "" }))).toEqual({
      ok: true,
      value: {
        version: "1",
        tool: { kind: "langchain", name: "travel.flight.search" },
        outcome: "empty",
      },
    });
    expect(normalizeLangChainToolMessage("travel.flight.search", new FakeToolMessage({ content: [] }))).toMatchObject({
      ok: true,
      value: { outcome: "empty" },
    });
  });

  it("refuses non-empty model-facing content when no structured artifact exists", () => {
    const result = normalizeLangChainToolMessage("travel.flight.search", new FakeToolMessage({
      content: "{not trusted structured json}",
    }));
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "UNSTRUCTURED_RESULT", path: "$.message.artifact" },
    });
    expect(JSON.stringify(result)).not.toContain("not trusted structured json");
  });

  it("fails closed on invalid structured artifact and accessor-backed success artifact", () => {
    expect(normalizeLangChainToolMessage("travel.flight.search", new FakeToolMessage({
      content: "ok",
      artifact: { value: undefined },
      status: "success",
    }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ARTIFACT", path: "$.message.artifact.value" },
    });

    let reads = 0;
    const message = new FakeToolMessage({ content: "ok", status: "success" });
    Object.defineProperty(message, "artifact", {
      enumerable: true,
      get() {
        reads += 1;
        return { flights: [] };
      },
    });
    expect(normalizeLangChainToolMessage("travel.flight.search", message)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ARTIFACT", path: "$.message.artifact" },
    });
    expect(reads).toBe(0);
  });

  it("rejects invalid tool names, content, and status without using call IDs as identity", () => {
    expect(normalizeLangChainToolMessage("Search Flights", new FakeToolMessage({ content: "" }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_TOOL_NAME", path: "$.toolName" },
    });
    expect(normalizeLangChainToolMessage("travel.flight.search", { content: 42 })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CONTENT", path: "$.message.content" },
    });
    expect(normalizeLangChainToolMessage("travel.flight.search", {
      content: "",
      status: "pending",
      tool_call_id: "call-123",
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_STATUS", path: "$.message.status" },
    });
  });
});
