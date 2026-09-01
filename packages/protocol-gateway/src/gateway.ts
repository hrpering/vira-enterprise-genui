import {
  normalizeLangChainToolMessage,
  normalizeMcpCallToolResult,
} from "@vira-enterprise-genui/tool-bridge";
import type {
  ProtocolGatewayProtocol,
  ProtocolGatewayResult,
  ProtocolGatewayValidationCode,
} from "./types.js";
import { PROTOCOL_GATEWAY_PROTOCOLS } from "./types.js";

const INPUT_FIELDS = new Set(["protocol", "toolName", "payload"]);
const PROTOCOL_SET = new Set<ProtocolGatewayProtocol>(PROTOCOL_GATEWAY_PROTOCOLS);

function failure(
  code: ProtocolGatewayValidationCode,
  path: string,
  message: string,
): ProtocolGatewayResult {
  return { ok: false, issue: { code, path, message } };
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownData(object: object, key: PropertyKey): PropertyDescriptor | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && "value" in descriptor ? descriptor : undefined;
}

function protocol(value: unknown): value is ProtocolGatewayProtocol {
  return typeof value === "string" && PROTOCOL_SET.has(value as ProtocolGatewayProtocol);
}

function providerFailure(code: string): ProtocolGatewayResult {
  if (code === "INVALID_TOOL_NAME") {
    return failure("INVALID_TOOL_NAME", "$.toolName", "protocol gateway tool name is invalid");
  }
  if (code === "CANONICAL_RESULT_REJECTED") {
    return failure(
      "CANONICAL_RESULT_REJECTED",
      "$.payload",
      "provider result was rejected by the canonical tool-result contract",
    );
  }
  return failure("INVALID_PAYLOAD", "$.payload", "protocol gateway provider payload is invalid");
}

export function normalizeProtocolGatewayResult(input: unknown): ProtocolGatewayResult {
  try {
    if (!plainObject(input)) {
      return failure("INVALID_INPUT", "$", "protocol gateway input must be a plain object");
    }
    if (Object.getOwnPropertySymbols(input).length > 0) {
      return failure("INVALID_INPUT", "$", "protocol gateway input must not contain symbol properties");
    }

    const names = Object.getOwnPropertyNames(input).sort();
    if (names.some((name) => !INPUT_FIELDS.has(name))) {
      return failure("UNKNOWN_FIELD", "$", "protocol gateway input contains an unsupported field");
    }
    for (const name of names) {
      if (!ownData(input, name)) {
        return failure("INVALID_INPUT", `$.${name}`, "protocol gateway fields must be own data properties");
      }
    }

    const protocolValue = ownData(input, "protocol")?.value;
    if (!protocol(protocolValue)) {
      return failure("INVALID_PROTOCOL", "$.protocol", "protocol gateway protocol is unsupported");
    }

    const toolName = ownData(input, "toolName")?.value;
    const payload = ownData(input, "payload")?.value;
    const result = protocolValue === "mcp"
      ? normalizeMcpCallToolResult(toolName, payload)
      : normalizeLangChainToolMessage(toolName, payload);

    if (!result.ok) return providerFailure(result.issue.code);
    return result;
  } catch {
    return failure("INVALID_INPUT", "$", "protocol gateway input could not be inspected safely");
  }
}
