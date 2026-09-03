import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeProtocolGatewayV2Ingress,
  type ProtocolGatewayV2Protocol,
} from "../../packages/protocol-gateway/src/v2.js";

const cases: ReadonlyArray<readonly [ProtocolGatewayV2Protocol, string, string, boolean]> = [
  ["ag-ui", "transport-state-events", "not-applicable", false],
  ["a2ui", "declarative-ui", "catalog-required", false],
  ["mcp", "tool-data-action-discovery", "not-applicable", false],
  ["mcp-apps", "sandboxed-web-compatibility", "never-auto-convert", true],
  ["vira-native", "native-publication", "native-publication", false],
  ["custom-json", "custom-json", "not-applicable", false],
];

for (const [protocol, semanticRole, nativeStrategy, webCompatibilitySurface] of cases) {
  test(`protocol gateway v2 preserves ${protocol} semantic ownership`, () => {
    const result = normalizeProtocolGatewayV2Ingress({
      version: "2",
      protocol,
      sourceId: `source.${protocol}`,
      payload: { kind: protocol, nested: [1, true, null] },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.semanticRole, semanticRole);
    assert.equal(result.value.nativeStrategy, nativeStrategy);
    assert.equal(result.value.webCompatibilitySurface, webCompatibilitySurface);
    assert.equal(Object.isFrozen(result.value), true);
    assert.equal(Object.isFrozen(result.value.payload), true);
  });
}

test("MCP Apps is explicitly web compatibility and never native auto-conversion", () => {
  const result = normalizeProtocolGatewayV2Ingress({ version: "2", protocol: "mcp-apps", sourceId: "mcp.apps.demo", payload: {} });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.webCompatibilitySurface, true);
  assert.equal(result.value.nativeStrategy, "never-auto-convert");
});

test("gateway v2 rejects accessor-backed root fields without invoking getters", () => {
  let reads = 0;
  const input = Object.create(null);
  Object.defineProperty(input, "version", { enumerable: true, value: "2" });
  Object.defineProperty(input, "protocol", { enumerable: true, get() { reads += 1; return "mcp"; } });
  Object.defineProperty(input, "sourceId", { enumerable: true, value: "mcp.demo" });
  Object.defineProperty(input, "payload", { enumerable: true, value: {} });
  const result = normalizeProtocolGatewayV2Ingress(input);
  assert.equal(result.ok, false);
  assert.equal(reads, 0);
});

test("gateway v2 rejects non-canonical payload before semantic classification output", () => {
  const result = normalizeProtocolGatewayV2Ingress({ version: "2", protocol: "custom-json", sourceId: "custom.demo", payload: { value: Number.NaN } });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, "INVALID_PAYLOAD");
});
