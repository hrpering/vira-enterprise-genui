import {
  normalizeProtocolGatewayV2Ingress,
  type ProtocolGatewayV2Input,
  type ProtocolGatewayV2Protocol,
  type ProtocolGatewayV2SemanticRole,
} from "./v2.js";

export const VIRA_NETWORK_PROTOCOL_CONFORMANCE_VERSION = "1" as const;
export const VIRA_NETWORK_PROTOCOL_FAMILIES = Object.freeze([
  "mcp",
  "a2ui",
  "ag-ui",
  "custom-sdk",
] as const);
export const VIRA_NETWORK_PROTOCOL_OPERATIONS = Object.freeze([
  "state-events",
  "render",
  "data",
  "action-discovery",
  "action-request",
] as const);

export type ViraNetworkProtocolFamily = (typeof VIRA_NETWORK_PROTOCOL_FAMILIES)[number];
export type ViraNetworkProtocolOperation = (typeof VIRA_NETWORK_PROTOCOL_OPERATIONS)[number];
export type ViraNetworkProtocolActionAuthority = "none" | "action-boundary-required";

export interface ViraNetworkProtocolConformanceEvidence {
  readonly version: typeof VIRA_NETWORK_PROTOCOL_CONFORMANCE_VERSION;
  readonly family: ViraNetworkProtocolFamily;
  readonly protocol: ProtocolGatewayV2Protocol;
  readonly sourceId: string;
  readonly semanticRole: ProtocolGatewayV2SemanticRole;
  readonly operation: ViraNetworkProtocolOperation;
  readonly applicationProjectionRequired: true;
  readonly actionAuthority: ViraNetworkProtocolActionAuthority;
}

export type ViraNetworkProtocolConformanceIssueCode =
  | "INVALID_INPUT"
  | "INVALID_FAMILY"
  | "INVALID_OPERATION"
  | "GATEWAY_REJECTED"
  | "PROTOCOL_FAMILY_MISMATCH"
  | "OPERATION_NOT_SUPPORTED";

export interface ViraNetworkProtocolConformanceIssue {
  readonly code: ViraNetworkProtocolConformanceIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraNetworkProtocolConformanceResult =
  | { readonly ok: true; readonly value: ViraNetworkProtocolConformanceEvidence }
  | { readonly ok: false; readonly issue: ViraNetworkProtocolConformanceIssue };

type Plain = Record<string, unknown>;

function fail(
  code: ViraNetworkProtocolConformanceIssueCode,
  path: string,
  message: string,
): ViraNetworkProtocolConformanceResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function plain(value: unknown): value is Plain {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Plain, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function family(value: unknown): value is ViraNetworkProtocolFamily {
  return typeof value === "string" && (VIRA_NETWORK_PROTOCOL_FAMILIES as readonly string[]).includes(value);
}

function operation(value: unknown): value is ViraNetworkProtocolOperation {
  return typeof value === "string" && (VIRA_NETWORK_PROTOCOL_OPERATIONS as readonly string[]).includes(value);
}

function expectedProtocol(value: ViraNetworkProtocolFamily): ProtocolGatewayV2Protocol {
  switch (value) {
    case "mcp": return "mcp";
    case "a2ui": return "a2ui";
    case "ag-ui": return "ag-ui";
    case "custom-sdk": return "custom-json";
  }
}

function supports(value: ViraNetworkProtocolFamily, requested: ViraNetworkProtocolOperation): boolean {
  switch (value) {
    case "mcp":
      return requested === "data" || requested === "action-discovery" || requested === "action-request";
    case "a2ui":
      return requested === "render" || requested === "action-request";
    case "ag-ui":
      return requested === "state-events" || requested === "action-request";
    case "custom-sdk":
      return true;
  }
}

export function evaluateViraNetworkProtocolConformance(input: unknown): ViraNetworkProtocolConformanceResult {
  if (!plain(input) || !exactKeys(input, ["family", "operation", "gatewayInput"])) {
    return fail("INVALID_INPUT", "$", "network protocol conformance input must be an exact object");
  }
  if (!family(input.family)) return fail("INVALID_FAMILY", "$.family", "protocol family is unsupported");
  if (!operation(input.operation)) return fail("INVALID_OPERATION", "$.operation", "protocol operation is unsupported");

  const normalized = normalizeProtocolGatewayV2Ingress(input.gatewayInput as ProtocolGatewayV2Input);
  if (!normalized.ok) {
    return fail("GATEWAY_REJECTED", "$.gatewayInput", `${normalized.issue.code}: ${normalized.issue.message}`);
  }

  const protocol = expectedProtocol(input.family);
  if (normalized.value.protocol !== protocol) {
    return fail("PROTOCOL_FAMILY_MISMATCH", "$.gatewayInput.protocol", "normalized protocol does not match the declared Network protocol family");
  }
  if (!supports(input.family, input.operation)) {
    return fail("OPERATION_NOT_SUPPORTED", "$.operation", "operation is not supported by the declared protocol family");
  }

  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_NETWORK_PROTOCOL_CONFORMANCE_VERSION,
      family: input.family,
      protocol: normalized.value.protocol,
      sourceId: normalized.value.sourceId,
      semanticRole: normalized.value.semanticRole,
      operation: input.operation,
      applicationProjectionRequired: true as const,
      actionAuthority: input.operation === "action-request"
        ? "action-boundary-required" as const
        : "none" as const,
    }),
  };
}
