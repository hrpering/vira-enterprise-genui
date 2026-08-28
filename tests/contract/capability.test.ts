import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { isCapability, parseCapability } from "../../packages/protocol/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

describe("Capability Protocol v1", () => {
  it("parses the golden capability fixture", async () => {
    const fixtureUrl = new URL("../fixtures/protocol/capability.v1.json", import.meta.url);
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as unknown;
    const result = parseCapability(fixture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("select-date");
    expect(isCapability(result.value)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("allows namespaced semantic capabilities", () => {
    expect(parseCapability({ version: "1", id: "display.results-list" }).ok).toBe(true);
    expect(parseCapability({ version: "1", id: "confirmation.review-transfer" }).ok).toBe(true);
  });

  it("rejects implementation and presentation details", () => {
    expect(parseCapability({ version: "1", id: "select-date", component: "DatePicker" })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.component" },
    });
    expect(parseCapability({ version: "1", id: "select-date", props: { color: "blue" } })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.props" },
    });
  });

  it("rejects invalid capability identifiers", () => {
    expect(parseCapability({ version: "1", id: "SelectDate" })).toMatchObject({ ok: false, issue: { code: "INVALID_ID" } });
    expect(parseCapability({ version: "1", id: "select-date-" })).toMatchObject({ ok: false, issue: { code: "INVALID_ID" } });
    expect(parseCapability({ version: "1", id: "" })).toMatchObject({ ok: false, issue: { code: "INVALID_ID" } });
  });

  it("rejects unsupported versions", () => {
    expect(parseCapability({ version: "2", id: "select-date" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VERSION", path: "$.version" },
    });
  });

  it("does not invoke accessor fields", () => {
    let calls = 0;
    const input: Record<string, unknown> = { version: "1" };
    Object.defineProperty(input, "id", {
      enumerable: true,
      get() {
        calls += 1;
        return "select-date";
      },
    });

    expect(parseCapability(input)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE", path: "$.id" } });
    expect(calls).toBe(0);
  });
});
