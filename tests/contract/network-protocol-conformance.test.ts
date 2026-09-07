import { describe, expect, it } from "vitest";
import {
  evaluateViraNetworkProtocolConformance,
} from "../../packages/protocol-gateway/src/index.js";

function gatewayInput(protocol: "mcp" | "a2ui" | "ag-ui" | "custom-json", payload: unknown = {}) {
  return { version: "2", protocol, sourceId: "source.network.test", payload };
}

describe("PROD-19D Network protocol conformance", () => {
  it("accepts the canonical MCP/A2UI/AG-UI/custom SDK protocol mapping", () => {
    const cases = [
      ["mcp", "data", "mcp", "tool-data-action-discovery"],
      ["a2ui", "render", "a2ui", "declarative-ui"],
      ["ag-ui", "state-events", "ag-ui", "transport-state-events"],
      ["custom-sdk", "data", "custom-json", "custom-json"],
    ] as const;
    for (const [family, operation, protocol, semanticRole] of cases) {
      expect(evaluateViraNetworkProtocolConformance({ family, operation, gatewayInput: gatewayInput(protocol) }))
        .toMatchObject({
          ok: true,
          value: {
            family,
            protocol,
            semanticRole,
            operation,
            applicationProjectionRequired: true,
            actionAuthority: "none",
          },
        });
    }
  });

  it("turns every protocol action request into non-executing Action Boundary evidence", () => {
    for (const [family, protocol] of [
      ["mcp", "mcp"],
      ["a2ui", "a2ui"],
      ["ag-ui", "ag-ui"],
      ["custom-sdk", "custom-json"],
    ] as const) {
      const result = evaluateViraNetworkProtocolConformance({
        family,
        operation: "action-request",
        gatewayInput: gatewayInput(protocol, {
          action: "payments.capture",
          directExecution: true,
          execute: true,
        }),
      });
      expect(result).toMatchObject({
        ok: true,
        value: {
          actionAuthority: "action-boundary-required",
          applicationProjectionRequired: true,
        },
      });
      if (!result.ok) continue;
      expect(result.value).not.toHaveProperty("execute");
      expect(result.value).not.toHaveProperty("endpoint");
      expect(result.value).not.toHaveProperty("credential");
      expect(result.value).not.toHaveProperty("payload");
    }
  });

  it("rejects protocol-family confusion instead of silently projecting through another protocol", () => {
    expect(evaluateViraNetworkProtocolConformance({
      family: "mcp",
      operation: "data",
      gatewayInput: gatewayInput("a2ui"),
    })).toMatchObject({ ok: false, issue: { code: "PROTOCOL_FAMILY_MISMATCH" } });
  });

  it("rejects operations outside each protocol's declared semantic role", () => {
    expect(evaluateViraNetworkProtocolConformance({
      family: "mcp",
      operation: "render",
      gatewayInput: gatewayInput("mcp"),
    })).toMatchObject({ ok: false, issue: { code: "OPERATION_NOT_SUPPORTED" } });
    expect(evaluateViraNetworkProtocolConformance({
      family: "a2ui",
      operation: "data",
      gatewayInput: gatewayInput("a2ui"),
    })).toMatchObject({ ok: false, issue: { code: "OPERATION_NOT_SUPPORTED" } });
  });

  it("inherits strict gateway normalization and fails closed on malformed ingress", () => {
    expect(evaluateViraNetworkProtocolConformance({
      family: "ag-ui",
      operation: "state-events",
      gatewayInput: { version: "2", protocol: "ag-ui", sourceId: "bad source", payload: {} },
    })).toMatchObject({ ok: false, issue: { code: "GATEWAY_REJECTED" } });
  });
});
