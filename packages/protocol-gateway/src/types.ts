import type { ExternalToolResult } from "@vira-enterprise-genui/tool-bridge";

export const PROTOCOL_GATEWAY_PROTOCOLS = Object.freeze([
  "mcp",
  "langchain",
] as const);

export type ProtocolGatewayProtocol = (typeof PROTOCOL_GATEWAY_PROTOCOLS)[number];

export interface ProtocolGatewayInput {
  readonly protocol: ProtocolGatewayProtocol;
  readonly toolName: string;
  readonly payload: unknown;
}

export type ProtocolGatewayValidationCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_PROTOCOL"
  | "INVALID_TOOL_NAME"
  | "INVALID_PAYLOAD"
  | "CANONICAL_RESULT_REJECTED";

export interface ProtocolGatewayValidationIssue {
  readonly code: ProtocolGatewayValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ProtocolGatewayResult =
  | { readonly ok: true; readonly value: ExternalToolResult }
  | { readonly ok: false; readonly issue: ProtocolGatewayValidationIssue };
