import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PATCH_MAX_OPERATIONS, isPatch, parsePatch } from "../../packages/protocol/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

describe("Patch Protocol v1", () => {
  it("parses and preserves the ordered golden patch fixture", async () => {
    const fixtureUrl = new URL("../fixtures/protocol/patch.v1.json", import.meta.url);
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as unknown;
    const result = parsePatch(fixture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.operations.map((operation) => operation.op)).toEqual(["set", "merge", "append", "replace", "remove"]);
    expect(isPatch(result.value)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("rejects unknown operations and operation-specific fields", () => {
    expect(parsePatch({ version: "1", operations: [{ op: "execute", path: "/state/x", value: 1 }] })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_OPERATION", path: "$.operations[0].op" },
    });
    expect(parsePatch({ version: "1", operations: [{ op: "remove", path: "/state/x", value: 1 }] })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_OPERATION", path: "$.operations[0].value" },
    });
  });

  it("rejects unsafe and malformed paths", () => {
    for (const path of [
      "/state/__proto__/polluted",
      "/state/constructor/x",
      "/state/prototype/x",
      "/state//x",
      "/state/~2bad",
    ]) {
      expect(parsePatch({ version: "1", operations: [{ op: "set", path, value: true }] })).toMatchObject({
        ok: false,
        issue: { code: "INVALID_PATH", path: "$.operations[0].path" },
      });
    }
  });

  it("rejects prototype-sensitive keys inside patch values", () => {
    const protoValue = JSON.parse('{"safe":{"__proto__":{"polluted":true}}}') as unknown;
    expect(parsePatch({ version: "1", operations: [{ op: "merge", path: "/state/x", value: protoValue }] })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VALUE", path: "$.operations[0].value.safe.__proto__" },
    });
    expect(parsePatch({
      version: "1",
      operations: [{ op: "set", path: "/state/x", value: { nested: { constructor: "blocked" } } }],
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VALUE", path: "$.operations[0].value.nested.constructor" },
    });
  });

  it("requires merge values to be canonical JSON objects", () => {
    expect(parsePatch({ version: "1", operations: [{ op: "merge", path: "/state/x", value: [] }] })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VALUE", path: "$.operations[0].value" },
    });
    expect(parsePatch({ version: "1", operations: [{ op: "merge", path: "/state/x", value: new Date() }] })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_OPERATIONS", path: "$.operations[0].value" },
    });
  });

  it("clones value-carrying operations", () => {
    const value = { nested: { selected: true } };
    const result = parsePatch({ version: "1", operations: [{ op: "set", path: "/state/x", value }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const operation = result.value.operations[0];
    expect(operation?.op).toBe("set");
    if (!operation || operation.op !== "set") return;
    expect(operation.value).not.toBe(value);
  });

  it("rejects oversized operation arrays before nested parsing", () => {
    const operations = Array.from({ length: PATCH_MAX_OPERATIONS + 1 }, () => null);
    expect(parsePatch({ version: "1", operations })).toMatchObject({
      ok: false,
      issue: { code: "OPERATION_LIMIT_EXCEEDED", path: "$.operations" },
    });
  });

  it("rejects unsupported versions and unknown top-level fields", () => {
    expect(parsePatch({ version: "2", operations: [] })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VERSION", path: "$.version" },
    });
    expect(parsePatch({ version: "1", operations: [], callback: "run" })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.callback" },
    });
  });
});
