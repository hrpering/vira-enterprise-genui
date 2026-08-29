import { describe, expect, it } from "vitest";
import {
  createToolDomainMapping,
  normalizeToolResultToDomainData,
} from "../../packages/tool-bridge/src/index.js";
import { freezeToolBridgeData } from "../../packages/tool-bridge/src/internal/freeze.js";

function mapping() {
  return {
    version: "1",
    tool: { kind: "function", name: "travel.flight.search" },
    domain: "travel.flight",
    type: "results",
  };
}

function result(outcome: "success" | "partial" | "empty" | "failure" = "success") {
  const base = {
    version: "1",
    tool: { kind: "function", name: "travel.flight.search" },
    outcome,
    freshness: { observedAtUnixMs: 1_000, expiresAtUnixMs: 2_000 },
  };
  if (outcome === "success") return { ...base, data: { flights: [{ id: "F-1", price: 120 }] } };
  if (outcome === "partial") return { ...base, data: { flights: [{ id: "F-1" }] }, failure: { code: "upstream.partial" } };
  if (outcome === "failure") return { ...base, failure: { code: "upstream.timeout" } };
  return base;
}

describe("tool-bridge DomainData normalization", () => {
  it("maps success payload unchanged into Protocol-validated frozen DomainData", () => {
    const normalized = normalizeToolResultToDomainData(result("success"), mapping());
    expect(normalized).toMatchObject({
      ok: true,
      value: {
        outcome: "success",
        domainData: {
          version: "1",
          domain: "travel.flight",
          type: "results",
          data: { flights: [{ id: "F-1", price: 120 }] },
          source: { kind: "function", name: "travel.flight.search" },
          freshness: { observedAtUnixMs: 1_000, expiresAtUnixMs: 2_000 },
        },
      },
    });
    if (!normalized.ok || normalized.value.outcome !== "success") return;
    expect(Object.isFrozen(normalized.value)).toBe(true);
    expect(Object.isFrozen(normalized.value.domainData)).toBe(true);
    expect(Object.isFrozen(normalized.value.domainData.data)).toBe(true);
  });

  it("preserves partial semantic failure outside DomainData without reshaping payload", () => {
    expect(normalizeToolResultToDomainData(result("partial"), mapping())).toMatchObject({
      ok: true,
      value: {
        outcome: "partial",
        domainData: { data: { flights: [{ id: "F-1" }] } },
        failure: { code: "upstream.partial" },
      },
    });
  });

  it("returns typed empty/failure outcomes without manufacturing DomainData", () => {
    const empty = normalizeToolResultToDomainData(result("empty"), mapping());
    expect(empty).toMatchObject({
      ok: true,
      value: {
        outcome: "empty",
        tool: { kind: "function", name: "travel.flight.search" },
        target: { domain: "travel.flight", type: "results" },
      },
    });
    if (empty.ok) expect("domainData" in empty.value).toBe(false);

    const failed = normalizeToolResultToDomainData(result("failure"), mapping());
    expect(failed).toMatchObject({
      ok: true,
      value: {
        outcome: "failure",
        failure: { code: "upstream.timeout" },
        target: { domain: "travel.flight", type: "results" },
      },
    });
    if (failed.ok) expect("domainData" in failed.value).toBe(false);
  });

  it("requires exact tool identity and has no fallback mapping", () => {
    expect(normalizeToolResultToDomainData(result("success"), {
      ...mapping(),
      tool: { kind: "mcp", name: "travel.flight.search" },
    })).toMatchObject({ ok: false, issue: { code: "TOOL_MISMATCH", path: "$.mapping.tool" } });
    expect(normalizeToolResultToDomainData(result("success"), {
      ...mapping(),
      tool: { kind: "function", name: "travel.flight.other" },
    })).toMatchObject({ ok: false, issue: { code: "TOOL_MISMATCH" } });
  });

  it("rejects transform/selector/default/provider/component fields and attributes mapping tool errors exactly", () => {
    for (const field of ["transform", "selector", "path", "default", "provider", "component", "callback"]) {
      expect(createToolDomainMapping({ ...mapping(), [field]: "forbidden" })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
    expect(createToolDomainMapping({ ...mapping(), tool: { kind: "HTTP", name: "travel.flight.search" } })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_TOOL", path: "$.tool.kind" },
    });
  });

  it("attributes invalid result/mapping failures to their input boundary", () => {
    expect(normalizeToolResultToDomainData({ ...result("success"), data: { callback() {} } }, mapping())).toMatchObject({
      ok: false,
      issue: { code: "INVALID_TOOL_RESULT", path: "$.result.data.callback" },
    });
    expect(normalizeToolResultToDomainData(result("success"), { ...mapping(), domain: "Bad Domain" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_MAPPING", path: "$.mapping.domain" },
    });
  });

  it("deep-freezes nested values even when a caller supplies a shallow-frozen outer object to the internal helper", () => {
    const nested = { value: { child: 1 } };
    Object.freeze(nested);
    freezeToolBridgeData(nested);
    expect(Object.isFrozen(nested.value)).toBe(true);
  });
});
