import { describe, expect, it } from "vitest";
import {
  JSON_VALUE_MAX_ARRAY_LENGTH,
  JSON_VALUE_MAX_NODES,
  JSON_VALUE_MAX_OBJECT_KEY_LENGTH,
  JSON_VALUE_MAX_OBJECT_KEYS,
  JSON_VALUE_MAX_STRING_LENGTH,
  JSON_VALUE_MAX_TOTAL_STRING_LENGTH,
  parseJsonValue,
} from "../../packages/protocol/src/index.js";

describe("Protocol canonical JSON resource budgets", () => {
  it("rejects arrays wider than the canonical limit before traversing them", () => {
    const value = new Array(JSON_VALUE_MAX_ARRAY_LENGTH + 1).fill(null);
    expect(parseJsonValue(value)).toMatchObject({
      ok: false,
      issue: {
        path: "$",
        reason: `maximum array length ${JSON_VALUE_MAX_ARRAY_LENGTH} exceeded`,
      },
    });
  });

  it("rejects objects wider than the canonical key limit", () => {
    const value: Record<string, null> = Object.create(null) as Record<string, null>;
    for (let index = 0; index <= JSON_VALUE_MAX_OBJECT_KEYS; index += 1) value[`k${index}`] = null;
    expect(parseJsonValue(value)).toMatchObject({
      ok: false,
      issue: {
        path: "$",
        reason: `maximum object key count ${JSON_VALUE_MAX_OBJECT_KEYS} exceeded`,
      },
    });
  });

  it("rejects an oversized object key before constructing a child path", () => {
    const value = { ["k".repeat(JSON_VALUE_MAX_OBJECT_KEY_LENGTH + 1)]: null };
    expect(parseJsonValue(value)).toMatchObject({
      ok: false,
      issue: {
        path: "$",
        reason: `maximum object key length ${JSON_VALUE_MAX_OBJECT_KEY_LENGTH} exceeded`,
      },
    });
  });

  it("rejects a single oversized string", () => {
    expect(parseJsonValue("x".repeat(JSON_VALUE_MAX_STRING_LENGTH + 1))).toMatchObject({
      ok: false,
      issue: {
        path: "$",
        reason: `maximum string length ${JSON_VALUE_MAX_STRING_LENGTH} exceeded`,
      },
    });
  });

  it("rejects aggregate string content beyond the canonical budget", () => {
    const chunkLength = Math.floor(JSON_VALUE_MAX_TOTAL_STRING_LENGTH / 4);
    const value = Array.from({ length: 5 }, () => "x".repeat(chunkLength));
    expect(parseJsonValue(value)).toMatchObject({
      ok: false,
      issue: {
        reason: `maximum aggregate string length ${JSON_VALUE_MAX_TOTAL_STRING_LENGTH} exceeded`,
      },
    });
  });

  it("rejects shallow values that exceed the total node budget", () => {
    const value = Array.from({ length: JSON_VALUE_MAX_ARRAY_LENGTH }, () => [null]);
    const parsed = parseJsonValue(value);
    expect(parsed).toMatchObject({
      ok: false,
      issue: {
        reason: `maximum JSON node count ${JSON_VALUE_MAX_NODES} exceeded`,
      },
    });
  });
});
