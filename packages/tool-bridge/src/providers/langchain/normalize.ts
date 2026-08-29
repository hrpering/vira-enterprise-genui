import {
  isSemanticNamespace,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import { parseExternalToolResult } from "../../validate.js";
import type {
  LangChainToolMessageNormalizationCode,
  LangChainToolMessageNormalizationResult,
} from "./types.js";

interface DataPropertyResult {
  readonly present: boolean;
  readonly value?: unknown;
  readonly accessor: boolean;
}

function failure(
  code: LangChainToolMessageNormalizationCode,
  path: string,
  message: string,
): LangChainToolMessageNormalizationResult {
  return { ok: false, issue: { code, path, message } };
}

function dataProperty(object: object, key: PropertyKey): DataPropertyResult {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) return { present: false, accessor: false };
  if (!("value" in descriptor)) return { present: true, accessor: true };
  return { present: true, value: descriptor.value, accessor: false };
}

function canonical(candidate: unknown): LangChainToolMessageNormalizationResult {
  const parsed = parseExternalToolResult(candidate);
  if (!parsed.ok) {
    return failure(
      "CANONICAL_RESULT_REJECTED",
      parsed.issue.path,
      "normalized LangChain tool message was rejected by the canonical tool-result contract",
    );
  }
  return parsed;
}

export function normalizeLangChainToolMessage(
  toolNameInput: unknown,
  messageInput: unknown,
): LangChainToolMessageNormalizationResult {
  if (typeof toolNameInput !== "string" || !isSemanticNamespace(toolNameInput)) {
    return failure(
      "INVALID_TOOL_NAME",
      "$.toolName",
      "LangChain tool name must be supplied as a canonical semantic namespace",
    );
  }

  if (messageInput === null || typeof messageInput !== "object" || Array.isArray(messageInput)) {
    return failure("INVALID_MESSAGE", "$.message", "LangChain ToolMessage must be an object or class instance");
  }

  const content = dataProperty(messageInput, "content");
  if (!content.present || content.accessor) {
    return failure("INVALID_CONTENT", "$.message.content", "ToolMessage content must be an own data property");
  }
  if (typeof content.value !== "string" && !Array.isArray(content.value)) {
    return failure("INVALID_CONTENT", "$.message.content", "ToolMessage content must be a string or content array");
  }

  const status = dataProperty(messageInput, "status");
  if (status.accessor) {
    return failure("INVALID_STATUS", "$.message.status", "ToolMessage status must not be an accessor property");
  }
  if (
    status.present
    && status.value !== undefined
    && status.value !== "success"
    && status.value !== "error"
  ) {
    return failure("INVALID_STATUS", "$.message.status", "ToolMessage status must be success or error when present");
  }

  if (status.value === "error") {
    return canonical({
      version: "1",
      tool: { kind: "langchain", name: toolNameInput },
      outcome: "failure",
      failure: { code: "langchain.tool.error" },
    });
  }

  const artifact = dataProperty(messageInput, "artifact");
  if (artifact.accessor) {
    return failure("INVALID_ARTIFACT", "$.message.artifact", "ToolMessage artifact must not be an accessor property");
  }
  if (artifact.present && artifact.value !== undefined) {
    const parsedArtifact = parseJsonValue(artifact.value, "$.message.artifact");
    if (!parsedArtifact.ok) {
      return failure("INVALID_ARTIFACT", parsedArtifact.issue.path, "ToolMessage artifact must be canonical JSON data");
    }
    return canonical({
      version: "1",
      tool: { kind: "langchain", name: toolNameInput },
      outcome: "success",
      data: parsedArtifact.value,
    });
  }

  const emptyContent = content.value === ""
    || (Array.isArray(content.value) && content.value.length === 0);
  if (emptyContent) {
    return canonical({
      version: "1",
      tool: { kind: "langchain", name: toolNameInput },
      outcome: "empty",
    });
  }

  return failure(
    "UNSTRUCTURED_RESULT",
    "$.message.artifact",
    "non-empty LangChain ToolMessage content requires a structured artifact for GenUI normalization",
  );
}
