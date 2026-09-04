import { describe, expect, it } from "vitest";
import {
  VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS,
  parseViraCommercialUsageRating,
  serializeViraCommercialUsageRating,
} from "../../packages/commercial-metering/src/index.js";

function rating(overrides: Record<string, unknown> = {}) {
  return {
    meteringRef: { id: "meter.tokens", versionRef: "1" },
    unit: "token",
    window: "utc-day",
    windowStart: "2026-09-05T00:00:00.000Z",
    windowEnd: "2026-09-06T00:00:00.000Z",
    asOf: "2026-09-05T12:30:00.000Z",
    includedRecordCount: 2,
    usedQuantity: 120,
    limitQuantity: 100,
    remainingQuantity: 0,
    excessQuantity: 20,
    status: "over-limit",
    ...overrides,
  };
}

describe("commercial metering rating evidence", () => {
  it("parses and deterministically serializes canonical rating evidence", () => {
    const parsed = parseViraCommercialUsageRating(rating());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(rating());
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.meteringRef)).toBe(true);

    const serialized = serializeViraCommercialUsageRating(rating());
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    expect(JSON.parse(serialized.value)).toEqual(rating());
  });

  it("normalizes second-precision timestamps to canonical milliseconds", () => {
    const parsed = parseViraCommercialUsageRating(rating({
      asOf: "2026-09-05T12:30:00Z",
    }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.asOf).toBe("2026-09-05T12:30:00.000Z");
  });

  it("validates lifetime window and unlimited status semantics", () => {
    const parsed = parseViraCommercialUsageRating(rating({
      window: "lifetime",
      windowStart: null,
      windowEnd: null,
      usedQuantity: 120,
      limitQuantity: null,
      remainingQuantity: null,
      excessQuantity: 0,
      status: "unlimited",
    }));
    expect(parsed.ok).toBe(true);
  });

  it("accepts canonical zero-usage evidence only with zero included records", () => {
    const parsed = parseViraCommercialUsageRating(rating({
      includedRecordCount: 0,
      usedQuantity: 0,
      limitQuantity: 100,
      remainingQuantity: 100,
      excessQuantity: 0,
      status: "within-limit",
    }));
    expect(parsed.ok).toBe(true);
  });

  it("rejects impossible record-count and used-quantity combinations", () => {
    expect(parseViraCommercialUsageRating(rating({
      includedRecordCount: 0,
      usedQuantity: 1,
      limitQuantity: 100,
      remainingQuantity: 99,
      excessQuantity: 0,
      status: "within-limit",
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });

    expect(parseViraCommercialUsageRating(rating({
      includedRecordCount: 1,
      usedQuantity: 0,
      limitQuantity: 100,
      remainingQuantity: 100,
      excessQuantity: 0,
      status: "within-limit",
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });

    expect(parseViraCommercialUsageRating(rating({
      includedRecordCount: VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS + 1,
    }))).toMatchObject({ ok: false, issue: { code: "USAGE_LIMIT_EXCEEDED" } });
  });

  it("rejects inconsistent status, remaining and excess evidence", () => {
    expect(parseViraCommercialUsageRating(rating({ status: "within-limit" }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });
    expect(parseViraCommercialUsageRating(rating({ remainingQuantity: 5 }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });
    expect(parseViraCommercialUsageRating(rating({ excessQuantity: 19 }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });
  });

  it("rejects window bounds inconsistent with window/asOf", () => {
    expect(parseViraCommercialUsageRating(rating({
      windowStart: "2026-09-04T00:00:00.000Z",
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });
  });

  it("rejects floating meter references and invalid quantities", () => {
    expect(parseViraCommercialUsageRating(rating({
      meteringRef: { id: "meter.tokens", versionRef: "latest" },
    }))).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });

    expect(parseViraCommercialUsageRating(rating({ usedQuantity: -1 }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_QUANTITY" },
    });
    expect(parseViraCommercialUsageRating(rating({ usedQuantity: 1.5 }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_QUANTITY" },
    });
  });

  it("fails closed on accessors and custom prototypes without invoking getters", () => {
    let getterCalls = 0;
    const malicious: Record<string, unknown> = { ...rating() };
    Object.defineProperty(malicious, "status", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "over-limit";
      },
    });
    expect(parseViraCommercialUsageRating(malicious).ok).toBe(false);
    expect(getterCalls).toBe(0);

    const custom = Object.assign(Object.create({ inherited: true }), rating());
    expect(parseViraCommercialUsageRating(custom).ok).toBe(false);
  });
});
