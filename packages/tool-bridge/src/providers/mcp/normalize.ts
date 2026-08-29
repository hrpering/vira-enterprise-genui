import {
  isSemanticNamespace,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { parseExternalToolResult } from "../../validate.js";
import type {
  McpCallToolResultNormalizationCode,
  McpCallToolResultNormalizationResult,
} from "./types.js";

function failure(
  code: McpCallToolResultNormalizationCode,
  path: string,
  message: string,
): McpCallToolResultNormalizationResult {
  return { ok: false, issue: { code, path, message } };
}

function jsonObject(value: JsonValue): JsonObject | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value;
}

function canonical(
  candidate: unknown,
): McpCallToolResultNormalizationResult {
  const parsed = parseExternalToolResult(candidate);
  if (!parsed.ok) {
    return failure(
      "CANONICAL_RESULT_REJECTED",
      parsed.issue.path,
      "normalized MCP result was rejected by the canonical tool-result contract",
    );
  }
  return parsed;
}

export function normalizeMcpCallToolResult(
  toolNameInput: unknown,
  resultInput: unknown,
): McpCallToolResultNormalizationResult {
  if (typeof toolNameInput !== "string" || !isSemanticNamespace(toolNameInput)) {
    return failure(
      "INVALID_TOOL_NAME",
      "$.toolName",
      "MCP tool name must be supplied as a canonical semantic namespace",
    );
  }

  const parsed = parseJsonValue(resultInput, "$.result");
  if (!parsed.ok) return failure("INVALID_RESULT", parsed.issue.path, "MCP tool result must be canonical JSON data");
  const fields = jsonObject(parsed.value);
  if (!fields) return failure("INVALID_RESULT", "$.result", "MCP tool result must be an object");

  if (!Array.isArray(fields.content)) {
    return failure("INVALID_CONTENT", "$.result.content", "MCP CallToolResult content must be an array");
  }

  let isError = false;
  if (Object.hasOwn(fields, "isError")) {
    if (typeof fields.isError !== "boolean") {
      return failure("INVALID_IS_ERROR", "$.result.isError", "MCP CallToolResult isError must be a boolean when present");
    }
    isError = fields.isError;
  }

  let structuredContent: JsonObject | undefined;
  if (Object.hasOwn(fields, "structuredContent")) {
    structuredContent = fields.structuredContent === undefined
      ? undefined
      : jsonObject(fields.structuredContent);
    if (!structuredContent) {
      return failure(
        "INVALID_STRUCTURED_CONTENT",
        "$.result.structuredContent",
        "MCP structuredContent must be a canonical JSON object when present",
      );
    }
  }

  if (isError) {
    return canonical({
      version: "1",
      tool: { kind: "mcp", name: toolNameInput },
      outcome: "failure",
      failure: { code: "mcp.tool.error" },
    });
  }

  if (structuredContent) {
    return canonical({
      version: "1",
      tool: { kind: "mcp", name: toolNameInput },
      outcome: "success",
      data: structuredContent,
    });
  }

  if (fields.content.length === 0) {
    return canonical({
      version: "1",
      tool: { kind: "mcp", name: toolNameInput },
      outcome: "empty",
    });
  }

  return failure(
    "UNSTRUCTURED_RESULT",
    "$.result.structuredContent",
    "non-empty MCP tool results require structuredContent for GenUI normalization",
  );
}
