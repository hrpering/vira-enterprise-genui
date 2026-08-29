import type { ExternalToolResult } from "../../types.js";

export type McpCallToolResultNormalizationCode =
  | "INVALID_TOOL_NAME"
  | "INVALID_RESULT"
  | "INVALID_CONTENT"
  | "INVALID_IS_ERROR"
  | "INVALID_STRUCTURED_CONTENT"
  | "UNSTRUCTURED_RESULT"
  | "CANONICAL_RESULT_REJECTED";

export interface McpCallToolResultNormalizationIssue {
  readonly code: McpCallToolResultNormalizationCode;
  readonly path: string;
  readonly message: string;
}

export type McpCallToolResultNormalizationResult =
  | { readonly ok: true; readonly value: ExternalToolResult }
  | { readonly ok: false; readonly issue: McpCallToolResultNormalizationIssue };
