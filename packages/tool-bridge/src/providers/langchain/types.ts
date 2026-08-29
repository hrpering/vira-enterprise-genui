import type { ExternalToolResult } from "../../types.js";

export type LangChainToolMessageNormalizationCode =
  | "INVALID_TOOL_NAME"
  | "INVALID_MESSAGE"
  | "INVALID_CONTENT"
  | "INVALID_STATUS"
  | "INVALID_ARTIFACT"
  | "UNSTRUCTURED_RESULT"
  | "CANONICAL_RESULT_REJECTED";

export interface LangChainToolMessageNormalizationIssue {
  readonly code: LangChainToolMessageNormalizationCode;
  readonly path: string;
  readonly message: string;
}

export type LangChainToolMessageNormalizationResult =
  | { readonly ok: true; readonly value: ExternalToolResult }
  | { readonly ok: false; readonly issue: LangChainToolMessageNormalizationIssue };
