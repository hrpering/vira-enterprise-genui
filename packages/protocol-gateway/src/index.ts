export { normalizeProtocolGatewayResult } from "./gateway.js";
export { PROTOCOL_GATEWAY_PROTOCOLS } from "./types.js";
export type {
  ProtocolGatewayInput,
  ProtocolGatewayProtocol,
  ProtocolGatewayResult,
  ProtocolGatewayValidationCode,
  ProtocolGatewayValidationIssue,
} from "./types.js";
export {
  normalizeProtocolGatewayV2Ingress,
  PROTOCOL_GATEWAY_V2_PROTOCOLS,
  PROTOCOL_GATEWAY_V2_VERSION,
} from "./v2.js";
export type {
  ProtocolGatewayV2Ingress,
  ProtocolGatewayV2Input,
  ProtocolGatewayV2Issue,
  ProtocolGatewayV2IssueCode,
  ProtocolGatewayV2NativeStrategy,
  ProtocolGatewayV2Protocol,
  ProtocolGatewayV2Result,
  ProtocolGatewayV2SemanticRole,
} from "./v2.js";

export {
  VIRA_NETWORK_PROTOCOL_CONFORMANCE_VERSION,
  VIRA_NETWORK_PROTOCOL_FAMILIES,
  VIRA_NETWORK_PROTOCOL_OPERATIONS,
  evaluateViraNetworkProtocolConformance,
} from "./network-conformance.js";
export type {
  ViraNetworkProtocolActionAuthority,
  ViraNetworkProtocolConformanceEvidence,
  ViraNetworkProtocolConformanceIssue,
  ViraNetworkProtocolConformanceIssueCode,
  ViraNetworkProtocolConformanceResult,
  ViraNetworkProtocolFamily,
  ViraNetworkProtocolOperation,
} from "./network-conformance.js";
