import { describe, expect, it } from "vitest";
import {
  parseViraCommercialPriceCatalog,
  parseViraCommercialPriceQuote,
  priceViraCommercialUsage,
  serializeViraCommercialPriceCatalog,
  serializeViraCommercialPriceQuote,
} from "../../packages/commercial-pricing/src/index.js";

function catalog(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1",
    plans: [
      {
        planRef: { id: "plan.pro", versionRef: "1" },
        currency: "USD",
        fixedAmountNanos: 2_000_000_000,
        rates: [
          {
            meteringRef: { id: "meter.tokens", versionRef: "1" },
            basis: "used",
            amountNanosPerUnit: 10_000_000,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function rating(overrides: Record<string, unknown> = {}) {
  return {
    meteringRef: { id: "meter.tokens", versionRef: "1" },
    unit: "token",
    window: "utc-day",
    windowStart: "2026-09-05T00:00:00.000Z",
    windowEnd: "2026-09-06T00:00:00.000Z",
    asOf: "2026-09-05T12:30:00.000Z",
    includedRecordCount: 1,
    usedQuantity: 100,
    limitQuantity: 80,
    remainingQuantity: 0,
    excessQuantity: 20,
    status: "over-limit",
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    planRef: { id: "plan.pro", versionRef: "1" },
    asOf: "2026-09-05T12:30:00.000Z",
    ratings: [rating()],
    ...overrides,
  };
}

function expectedQuote() {
  return {
    planRef: { id: "plan.pro", versionRef: "1" },
    currency: "USD",
    asOf: "2026-09-05T12:30:00.000Z",
    fixedAmountNanos: 2_000_000_000,
    lines: [
      {
        meteringRef: { id: "meter.tokens", versionRef: "1" },
        unit: "token",
        window: "utc-day",
        basis: "used",
        quantity: 100,
        amountNanosPerUnit: 10_000_000,
        amountNanos: 1_000_000_000,
      },
    ],
    totalAmountNanos: 3_000_000_000,
  };
}

describe("commercial pricing", () => {
  it("parses deterministic immutable price catalogs", () => {
    const parsed = parseViraCommercialPriceCatalog(catalog());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(catalog());
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.plans)).toBe(true);
    expect(Object.isFrozen(parsed.value.plans[0]!.rates)).toBe(true);

    const serialized = serializeViraCommercialPriceCatalog(catalog());
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    expect(JSON.parse(serialized.value)).toEqual(catalog());
  });

  it("prices fixed plus used-quantity rates deterministically", () => {
    const result = priceViraCommercialUsage(catalog(), request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(expectedQuote());
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.lines)).toBe(true);
    expect("invoiceId" in result.value).toBe(false);
    expect("paymentIntent" in result.value).toBe(false);
    expect("charged" in result.value).toBe(false);
    expect("authorized" in result.value).toBe(false);
  });

  it("parses and serializes quote evidence for downstream commercial consumers", () => {
    const parsed = parseViraCommercialPriceQuote(expectedQuote());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(expectedQuote());
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.lines)).toBe(true);

    const serialized = serializeViraCommercialPriceQuote(expectedQuote());
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    expect(JSON.parse(serialized.value)).toEqual(expectedQuote());
  });

  it("can price only excess quantity without changing metering truth", () => {
    const excessCatalog = catalog({
      plans: [
        {
          planRef: { id: "plan.pro", versionRef: "1" },
          currency: "USD",
          fixedAmountNanos: 0,
          rates: [
            {
              meteringRef: { id: "meter.tokens", versionRef: "1" },
              basis: "excess",
              amountNanosPerUnit: 50_000_000,
            },
          ],
        },
      ],
    });
    const sourceRating = rating();
    const result = priceViraCommercialUsage(excessCatalog, request({ ratings: [sourceRating] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines[0]).toMatchObject({
      basis: "excess",
      quantity: 20,
      amountNanos: 1_000_000_000,
    });
    expect(sourceRating).toEqual(rating());
  });

  it("sorts plans and rates by exact reference for deterministic serialization", () => {
    const unsorted = catalog({
      plans: [
        {
          planRef: { id: "plan.zeta", versionRef: "1" },
          currency: "USD",
          fixedAmountNanos: 0,
          rates: [],
        },
        {
          planRef: { id: "plan.alpha", versionRef: "1" },
          currency: "USD",
          fixedAmountNanos: 0,
          rates: [
            { meteringRef: { id: "meter.zeta", versionRef: "1" }, basis: "used", amountNanosPerUnit: 1 },
            { meteringRef: { id: "meter.alpha", versionRef: "1" }, basis: "used", amountNanosPerUnit: 1 },
          ],
        },
      ],
    });
    const parsed = parseViraCommercialPriceCatalog(unsorted);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.plans.map((plan) => plan.planRef.id)).toEqual(["plan.alpha", "plan.zeta"]);
    expect(parsed.value.plans[0]!.rates.map((rate) => rate.meteringRef.id)).toEqual(["meter.alpha", "meter.zeta"]);
  });

  it("supports a fixed-only plan with no rating side effects", () => {
    const fixedOnly = catalog({
      plans: [{
        planRef: { id: "plan.fixed", versionRef: "1" },
        currency: "TRY",
        fixedAmountNanos: 5_000_000_000,
        rates: [],
      }],
    });
    const result = priceViraCommercialUsage(fixedOnly, {
      planRef: { id: "plan.fixed", versionRef: "1" },
      asOf: "2026-09-05T12:30:00Z",
      ratings: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      currency: "TRY",
      asOf: "2026-09-05T12:30:00.000Z",
      fixedAmountNanos: 5_000_000_000,
      totalAmountNanos: 5_000_000_000,
      lines: [],
    });
  });
});
