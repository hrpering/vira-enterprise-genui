import { describe, expect, it } from "vitest";
import {
  VIRA_COMMERCIAL_SETTLEMENT_MAX_RULES,
  allocateViraCommercialSettlement,
  parseViraCommercialSettlementAllocation,
  parseViraCommercialSettlementSchedule,
} from "../../packages/commercial-settlement/src/index.js";

function application(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1",
    identity: { id: "vira.flight-assistant" },
    version: "1.2.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [{ id: "travel.flight.search", packId: "vira/flight-booking", packVersion: "2.1.0", entrypoint: "main" }],
    capabilities: [{ id: "travel.flight.search-capability", versionRef: "1" }],
    contextTypes: [{ id: "travel.flight.work-context", versionRef: "1" }],
    actions: [{ actionType: "travel.flight.book" }],
    flows: [{ id: "travel.flight.booking-flow", versionRef: "1" }],
    brandRef: { id: "brand.vira", versionRef: "1" },
    governanceRequirements: [{ id: "governance.booking-approval", versionRef: "1" }],
    hostCompatibility: { minViraVersion: "1.0.0", maxViraVersion: "2.0.0", requiredCapabilities: ["host.date-picker"] },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    distribution: { name: "Flight Assistant", tags: ["travel"], visibility: "organization", discoverable: true },
    commercial: {
      entitlementRefs: [{ id: "entitlement.flight-assistant", versionRef: "1" }],
      meteringRefs: [{ id: "metering.flight-assistant", versionRef: "1" }],
    },
    ...overrides,
  };
}

function quote(overrides: Record<string, unknown> = {}) {
  return {
    planRef: { id: "plan.pro", versionRef: "1" },
    currency: "USD",
    asOf: "2026-09-05T12:30:00.000Z",
    fixedAmountNanos: 3_000_000_000,
    lines: [],
    totalAmountNanos: 3_000_000_000,
    ...overrides,
  };
}

function rule(overrides: Record<string, unknown> = {}) {
  return {
    settlementRef: { id: "settlement.vira-flight", versionRef: "1" },
    applicationId: "vira.flight-assistant",
    applicationVersion: "1.2.0",
    publisherId: "vira",
    planRef: { id: "plan.pro", versionRef: "1" },
    publisherShareBps: 7000,
    ...overrides,
  };
}

function schedule(rules: unknown[] = [rule()]) {
  return { schemaVersion: "1", rules };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    application: application(),
    settlementRef: { id: "settlement.vira-flight", versionRef: "1" },
    quote: quote(),
    ...overrides,
  };
}

describe("commercial settlement hardening", () => {
  it("fails closed on duplicate rules and floating references", () => {
    expect(parseViraCommercialSettlementSchedule(schedule([rule(), rule()]))).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_RULE" },
    });
    expect(parseViraCommercialSettlementSchedule(schedule([rule({
      settlementRef: { id: "settlement.vira-flight", versionRef: "latest" },
    })]))).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });
    expect(parseViraCommercialSettlementSchedule(schedule([rule({
      planRef: { id: "plan.pro", versionRef: "1.x" },
    })]))).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });
  });

  it("rejects invalid publisher shares", () => {
    for (const publisherShareBps of [-1, 10_001, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(parseViraCommercialSettlementSchedule(schedule([rule({ publisherShareBps })]))).toMatchObject({
        ok: false,
        issue: { code: "INVALID_SHARE" },
      });
    }
  });

  it("requires canonical publisher namespace parity plus exact Application and plan linkage", () => {
    expect(parseViraCommercialSettlementSchedule(
      schedule([rule({ publisherId: "other" })]),
    )).toMatchObject({ ok: false, issue: { code: "INVALID_PUBLISHER" } });

    expect(allocateViraCommercialSettlement(
      schedule([rule({ applicationVersion: "2.0.0" })]),
      request(),
    )).toMatchObject({ ok: false, issue: { code: "APPLICATION_MISMATCH" } });

    expect(allocateViraCommercialSettlement(
      schedule([rule({ planRef: { id: "plan.other", versionRef: "1" } })]),
      request(),
    )).toMatchObject({ ok: false, issue: { code: "PLAN_MISMATCH" } });
  });

  it("never falls back to another settlement rule", () => {
    expect(allocateViraCommercialSettlement(
      schedule([rule({ settlementRef: { id: "settlement.other", versionRef: "1" } })]),
      request(),
    )).toMatchObject({ ok: false, issue: { code: "RULE_NOT_FOUND" } });
  });

  it("delegates malformed Application and quote evidence to canonical owners", () => {
    expect(allocateViraCommercialSettlement(schedule(), request({
      application: { ...application(), apiKey: "secret" },
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_APPLICATION" } });

    expect(allocateViraCommercialSettlement(schedule(), request({
      quote: { ...quote(), totalAmountNanos: 1 },
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_QUOTE" } });
  });

  it("rejects invoice, payment, payout, tax, credential and authority smuggling", () => {
    for (const field of [
      "invoiceId",
      "paymentIntent",
      "charged",
      "payoutId",
      "bankAccount",
      "taxAmount",
      "fxRate",
      "authorized",
      "credential",
    ]) {
      expect(parseViraCommercialSettlementSchedule({ ...schedule(), [field]: "smuggled" })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD" },
      });
      expect(allocateViraCommercialSettlement(schedule(), { ...request(), [field]: "smuggled" })).toMatchObject({
        ok: false,
        issue: { code: "INVALID_REQUEST" },
      });
    }
  });

  it("rejects forged allocation identity, arithmetic and embedded quote", () => {
    const allocation = allocateViraCommercialSettlement(schedule(), request());
    expect(allocation.ok).toBe(true);
    if (!allocation.ok) return;

    expect(parseViraCommercialSettlementAllocation({
      ...allocation.value,
      publisherId: "other",
    })).toMatchObject({ ok: false, issue: { code: "INVALID_PUBLISHER" } });

    expect(parseViraCommercialSettlementAllocation({
      ...allocation.value,
      publisherAmountNanos: allocation.value.publisherAmountNanos + 1,
      platformAmountNanos: allocation.value.platformAmountNanos - 1,
    })).toMatchObject({ ok: false, issue: { code: "ALLOCATION_MISMATCH" } });

    expect(parseViraCommercialSettlementAllocation({
      ...allocation.value,
      quote: { ...allocation.value.quote, totalAmountNanos: 1 },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_QUOTE" } });
  });

  it("keeps MAX_SAFE_INTEGER gross arithmetic safe without direct gross-times-bps multiplication", () => {
    const gross = Number.MAX_SAFE_INTEGER;
    const result = allocateViraCommercialSettlement(
      schedule([rule({ publisherShareBps: 9999 })]),
      request({ quote: quote({ fixedAmountNanos: gross, totalAmountNanos: gross }) }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Number.isSafeInteger(result.value.publisherAmountNanos)).toBe(true);
    expect(Number.isSafeInteger(result.value.platformAmountNanos)).toBe(true);
    expect(result.value.publisherAmountNanos + result.value.platformAmountNanos).toBe(gross);
    const expectedPublisher = Number((BigInt(gross) * 9999n) / 10_000n);
    expect(result.value.publisherAmountNanos).toBe(expectedPublisher);
  });

  it("enforces the settlement rule collection ceiling", () => {
    const rules = Array.from({ length: VIRA_COMMERCIAL_SETTLEMENT_MAX_RULES + 1 }, (_, index) =>
      rule({ settlementRef: { id: `settlement.rule-${index}`, versionRef: "1" } }));
    expect(parseViraCommercialSettlementSchedule(schedule(rules))).toMatchObject({
      ok: false,
      issue: { code: "RULE_LIMIT_EXCEEDED" },
    });
  });

  it("fails closed on accessors and custom prototypes without invoking getters", () => {
    let getterCalls = 0;
    const malicious: Record<string, unknown> = { rules: [rule()] };
    Object.defineProperty(malicious, "schemaVersion", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "1";
      },
    });
    expect(parseViraCommercialSettlementSchedule(malicious).ok).toBe(false);
    expect(getterCalls).toBe(0);

    const custom = Object.assign(Object.create({ inherited: true }), request());
    expect(allocateViraCommercialSettlement(schedule(), custom)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_REQUEST" },
    });
  });
});
