import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { domainDataKey, isDomainData, parseDomainData } from "../../packages/protocol/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

describe("DomainData Protocol v1", () => {
  it("parses and normalizes the golden domain data fixture", async () => {
    const fixtureUrl = new URL("../fixtures/protocol/domain-data.v1.json", import.meta.url);
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as unknown;
    const result = parseDomainData(fixture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(domainDataKey(result.value)).toBe("travel.flight.search-results");
    expect(isDomainData(result.value)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("rejects raw implementation fields outside the contract", () => {
    expect(parseDomainData({
      version: "1",
      domain: "travel.flight",
      type: "search-results",
      data: {},
      endpoint: "/internal/flights",
    })).toMatchObject({ ok: false, issue: { code: "UNKNOWN_FIELD", path: "$.endpoint" } });
  });

  it("rejects invalid domain and data type identifiers", () => {
    expect(parseDomainData({ version: "1", domain: "Travel.Flight", type: "results", data: {} })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_DOMAIN" },
    });
    expect(parseDomainData({ version: "1", domain: "travel.flight", type: "results-", data: {} })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_DATA_TYPE" },
    });
  });

  it("rejects non-canonical domain data payloads without invoking accessors", () => {
    let calls = 0;
    const data: Record<string, unknown> = {};
    Object.defineProperty(data, "secret", {
      enumerable: true,
      get() {
        calls += 1;
        return "value";
      },
    });

    expect(parseDomainData({ version: "1", domain: "travel.flight", type: "results", data })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_DATA", path: "$.data.secret" },
    });
    expect(calls).toBe(0);
  });

  it("keeps source metadata semantic rather than accepting opaque execution references", () => {
    expect(parseDomainData({
      version: "1",
      domain: "travel.flight",
      type: "results",
      data: [],
      source: { kind: "tool", name: "https://internal.example/search" },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_SOURCE", path: "$.source.name" } });

    expect(parseDomainData({
      version: "1",
      domain: "travel.flight",
      type: "results",
      data: [],
      source: { kind: "tool", token: "must-not-be-here" },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_SOURCE", path: "$.source.token" } });
  });

  it("validates freshness ordering and integer timestamps", () => {
    expect(parseDomainData({
      version: "1",
      domain: "travel.flight",
      type: "results",
      data: [],
      freshness: { observedAtUnixMs: 200, expiresAtUnixMs: 100 },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_FRESHNESS", path: "$.freshness.expiresAtUnixMs" } });

    expect(parseDomainData({
      version: "1",
      domain: "travel.flight",
      type: "results",
      data: [],
      freshness: { observedAtUnixMs: 1.5 },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_FRESHNESS", path: "$.freshness.observedAtUnixMs" } });
  });

  it("returns canonical cloned data rather than retaining input identity", () => {
    const data = { options: [{ id: "one" }] };
    const result = parseDomainData({ version: "1", domain: "travel.flight", type: "results", data });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.data).not.toBe(data);
    data.options[0]!.id = "changed";
    expect(result.value.data).toEqual({ options: [{ id: "one" }] });
  });
});
