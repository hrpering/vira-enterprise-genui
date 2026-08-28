import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { JSON_VALUE_MAX_DEPTH, intentKey, isIntent, parseIntent, parseJsonValue } from "../../packages/protocol/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

describe("Intent Protocol v1", () => {
  it("parses and normalizes the golden intent fixture", async () => {
    const fixtureUrl = new URL("../fixtures/protocol/intent.v1.json", import.meta.url);
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as unknown;
    const result = parseIntent(fixture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(intentKey(result.value)).toBe("travel.flight.search");
    expect(isIntent(result.value)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("rejects unsupported protocol versions", () => {
    const result = parseIntent({ version: "2", namespace: "travel.flight", name: "search" });
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_VERSION", path: "$.version" } });
  });

  it("rejects invalid semantic identifiers", () => {
    expect(parseIntent({ version: "1", namespace: "Travel.Flight", name: "search" })).toMatchObject({ ok: false, issue: { code: "INVALID_NAMESPACE" } });
    expect(parseIntent({ version: "1", namespace: "travel.", name: "search" })).toMatchObject({ ok: false, issue: { code: "INVALID_NAMESPACE" } });
    expect(parseIntent({ version: "1", namespace: "travel.flight", name: "Search Results" })).toMatchObject({ ok: false, issue: { code: "INVALID_NAME" } });
    expect(parseIntent({ version: "1", namespace: "travel.flight", name: "search-" })).toMatchObject({ ok: false, issue: { code: "INVALID_NAME" } });
  });

  it("rejects confidence outside the canonical range", () => {
    expect(parseIntent({ version: "1", namespace: "travel.flight", name: "search", confidence: 1.01 })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CONFIDENCE" },
    });
  });

  it("rejects renderer or implementation fields that do not belong in intent", () => {
    expect(parseIntent({ version: "1", namespace: "travel.flight", name: "search", component: "FlightSearchCard" })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.component" },
    });
  });

  it("does not execute top-level accessors during validation", () => {
    let calls = 0;
    const input = { version: "1", namespace: "travel.flight", name: "search" } as Record<string, unknown>;
    Object.defineProperty(input, "confidence", {
      enumerable: true,
      get() {
        calls += 1;
        return 0.5;
      },
    });

    expect(parseIntent(input)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE" } });
    expect(calls).toBe(0);
  });

  it("does not execute parameter accessors during canonical JSON parsing", () => {
    let calls = 0;
    const parameters: Record<string, unknown> = {};
    Object.defineProperty(parameters, "origin", {
      enumerable: true,
      get() {
        calls += 1;
        return "IST";
      },
    });

    expect(parseIntent({ version: "1", namespace: "travel.flight", name: "search", parameters })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PARAMETERS", path: "$.parameters.origin" },
    });
    expect(calls).toBe(0);
  });

  it("rejects non-canonical parameter values", () => {
    expect(parseIntent({ version: "1", namespace: "travel.flight", name: "search", parameters: { when: new Date(0) } })).toMatchObject({ ok: false, issue: { code: "INVALID_PARAMETERS" } });
    expect(parseIntent({ version: "1", namespace: "travel.flight", name: "search", parameters: { score: Number.NaN } })).toMatchObject({ ok: false, issue: { code: "INVALID_PARAMETERS" } });
    expect(parseIntent({ version: "1", namespace: "travel.flight", name: "search", parameters: { missing: undefined } })).toMatchObject({ ok: false, issue: { code: "INVALID_PARAMETERS" } });
  });

  it("fails cleanly when canonical JSON exceeds the nesting limit", () => {
    let nested: Record<string, unknown> = {};
    const root = nested;
    for (let index = 0; index <= JSON_VALUE_MAX_DEPTH; index += 1) {
      const child: Record<string, unknown> = {};
      nested.next = child;
      nested = child;
    }
    const result = parseIntent({ version: "1", namespace: "travel.flight", name: "search", parameters: root });
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_PARAMETERS" } });
  });

  it("returns a canonical clone rather than retaining parameter object identity", () => {
    const parameters = { origin: "IST", nested: { flexible: true } };
    const result = parseIntent({ version: "1", namespace: "travel.flight", name: "search", parameters });
    expect(result.ok).toBe(true);
    if (!result.ok || !result.value.parameters) return;
    expect(result.value.parameters).not.toBe(parameters);
    parameters.origin = "SAW";
    expect(result.value.parameters.origin).toBe("IST");
  });

  it("validates canonical JSON independently for future protocol fields", () => {
    expect(parseJsonValue({ ok: [1, true, null, "x"] }).ok).toBe(true);
    expect(parseJsonValue({ bad: BigInt(1) }).ok).toBe(false);
  });
});
