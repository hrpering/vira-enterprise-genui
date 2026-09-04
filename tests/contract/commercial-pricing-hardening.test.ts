import { describe, expect, it } from "vitest";
import {
  VIRA_COMMERCIAL_PRICING_MAX_PLANS,
  VIRA_COMMERCIAL_PRICING_MAX_RATES_PER_PLAN,
  VIRA_COMMERCIAL_PRICING_MAX_RATINGS,
  parseViraCommercialPriceCatalog,
  priceViraCommercialUsage,
} from "../../packages/commercial-pricing/src/index.js";

function rate(overrides: Record<string, unknown> = {}) {
  return {
    meteringRef: { id: "meter.tokens", versionRef: "1" },
    basis: "used",
    amountNanosPerUnit: 10,
    ...overrides,
  };
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    planRef: { id: "plan.pro", versionRef: "1" },
    currency: "USD",
    fixedAmountNanos: 0,
    rates: [rate()],
    ...overrides,
  };
}

function catalog(overrides: Record<string, unknown> = {}) {
  return { schemaVersion: "1", plans: [plan()], ...overrides };
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
    usedQuantity: 10,
    limitQuantity: 8,
    remainingQuantity: 0,
    excessQuantity: 2,
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

describe("commercial pricing hardening", () => {
  it("rejects floating plan and meter references", () => {
    expect(parseViraCommercialPriceCatalog(catalog({ plans: [plan({
      planRef: { id: "plan.pro", versionRef: "latest" },
    })] }))).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });

    expect(parseViraCommercialPriceCatalog(catalog({ plans: [plan({
      rates: [rate({ meteringRef: { id: "meter.tokens", versionRef: "1.x" } })],
    })] }))).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });
  });

  it("rejects duplicate plans, rates and ratings", () => {
    expect(parseViraCommercialPriceCatalog(catalog({ plans: [plan(), plan()] }))).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_PLAN" },
    });
    expect(parseViraCommercialPriceCatalog(catalog({ plans: [plan({ rates: [rate(), rate()] })] }))).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_RATE" },
    });
    expect(priceViraCommercialUsage(catalog(), request({ ratings: [rating(), rating()] }))).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_RATING" },
    });
  });

  it("rejects missing and undeclared rating evidence", () => {
    expect(priceViraCommercialUsage(catalog(), request({ ratings: [] }))).toMatchObject({
      ok: false,
      issue: { code: "MISSING_RATING" },
    });
    expect(priceViraCommercialUsage(catalog(), request({ ratings: [
      rating(),
      rating({ meteringRef: { id: "meter.requests", versionRef: "1" } }),
    ] }))).toMatchObject({ ok: false, issue: { code: "UNPRICED_RATING" } });
  });

  it("rejects rating time mismatch and delegates inconsistent rating rejection to metering", () => {
    expect(priceViraCommercialUsage(catalog(), request({
      asOf: "2026-09-05T13:00:00.000Z",
    }))).toMatchObject({ ok: false, issue: { code: "RATING_TIME_MISMATCH" } });

    expect(priceViraCommercialUsage(catalog(), request({
      ratings: [rating({ status: "within-limit" })],
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_RATING" } });
  });

  it("rejects invalid currency and monetary amounts", () => {
    for (const currency of ["usd", "US", "USDD", "₺TR"]) {
      expect(parseViraCommercialPriceCatalog(catalog({ plans: [plan({ currency })] }))).toMatchObject({
        ok: false,
        issue: { code: "INVALID_CURRENCY" },
      });
    }
    for (const fixedAmountNanos of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(parseViraCommercialPriceCatalog(catalog({ plans: [plan({ fixedAmountNanos })] }))).toMatchObject({
        ok: false,
        issue: { code: "INVALID_AMOUNT" },
      });
    }
    for (const amountNanosPerUnit of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(parseViraCommercialPriceCatalog(catalog({ plans: [plan({ rates: [rate({ amountNanosPerUnit })] })] }))).toMatchObject({
        ok: false,
        issue: { code: "INVALID_AMOUNT" },
      });
    }
  });

  it("fails multiplication and accumulation before safe-integer overflow", () => {
    const multiplyOverflow = catalog({ plans: [plan({ rates: [rate({ amountNanosPerUnit: Number.MAX_SAFE_INTEGER })] })] });
    expect(priceViraCommercialUsage(multiplyOverflow, request())).toMatchObject({
      ok: false,
      issue: { code: "AMOUNT_OVERFLOW" },
    });

    const totalOverflow = catalog({ plans: [plan({
      fixedAmountNanos: Number.MAX_SAFE_INTEGER,
      rates: [rate({ amountNanosPerUnit: 1 })],
    })] });
    expect(priceViraCommercialUsage(totalOverflow, request())).toMatchObject({
      ok: false,
      issue: { code: "AMOUNT_OVERFLOW" },
    });
  });

  it("rejects billing, payment, tax, authority and credential smuggling fields", () => {
    for (const field of ["invoiceId", "paymentIntent", "subscription", "taxRate", "authorized", "endpoint", "token"]) {
      expect(parseViraCommercialPriceCatalog({ ...catalog(), [field]: "smuggled" })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD" },
      });
    }

    expect(priceViraCommercialUsage(catalog(), { ...request(), invoiceId: "inv-1" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_REQUEST" },
    });
  });

  it("fails closed on accessors and custom prototypes without invoking getters", () => {
    let getterCalls = 0;
    const malicious: Record<string, unknown> = {};
    Object.defineProperty(malicious, "schemaVersion", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "1";
      },
    });
    malicious.plans = [plan()];
    expect(parseViraCommercialPriceCatalog(malicious).ok).toBe(false);
    expect(getterCalls).toBe(0);

    const custom = Object.assign(Object.create({ inherited: true }), request());
    expect(priceViraCommercialUsage(catalog(), custom)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_REQUEST" },
    });
  });

  it("enforces plan, rate and rating collection ceilings", () => {
    const plans = Array.from({ length: VIRA_COMMERCIAL_PRICING_MAX_PLANS + 1 }, (_, index) => plan({
      planRef: { id: `plan.p-${index}`, versionRef: "1" },
    }));
    expect(parseViraCommercialPriceCatalog({ schemaVersion: "1", plans })).toMatchObject({
      ok: false,
      issue: { code: "PLAN_LIMIT_EXCEEDED" },
    });

    const rates = Array.from({ length: VIRA_COMMERCIAL_PRICING_MAX_RATES_PER_PLAN + 1 }, (_, index) => rate({
      meteringRef: { id: `meter.m-${index}`, versionRef: "1" },
    }));
    expect(parseViraCommercialPriceCatalog(catalog({ plans: [plan({ rates })] }))).toMatchObject({
      ok: false,
      issue: { code: "RATE_LIMIT_EXCEEDED" },
    });

    const ratings = Array.from({ length: VIRA_COMMERCIAL_PRICING_MAX_RATINGS + 1 }, (_, index) => rating({
      meteringRef: { id: `meter.m-${index}`, versionRef: "1" },
    }));
    expect(priceViraCommercialUsage(catalog(), request({ ratings }))).toMatchObject({
      ok: false,
      issue: { code: "RATING_LIMIT_EXCEEDED" },
    });
  });
});
