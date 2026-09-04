import { describe, expect, it } from "vitest";
import {
  allocateViraCommercialSettlement,
  parseViraCommercialSettlementAllocation,
  parseViraCommercialSettlementSchedule,
  serializeViraCommercialSettlementAllocation,
  serializeViraCommercialSettlementSchedule,
} from "../../packages/commercial-settlement/src/index.js";

function application(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1",
    identity: { id: "vira.flight-assistant" },
    version: "1.2.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [{
      id: "travel.flight.search",
      packId: "vira/flight-booking",
      packVersion: "2.1.0",
      entrypoint: "main",
    }],
    capabilities: [{ id: "travel.flight.search-capability", versionRef: "1" }],
    contextTypes: [{ id: "travel.flight.work-context", versionRef: "1" }],
    actions: [{ actionType: "travel.flight.book" }],
    flows: [{ id: "travel.flight.booking-flow", versionRef: "1" }],
    brandRef: { id: "brand.vira", versionRef: "1" },
    governanceRequirements: [{ id: "governance.booking-approval", versionRef: "1" }],
    hostCompatibility: {
      minViraVersion: "1.0.0",
      maxViraVersion: "2.0.0",
      requiredCapabilities: ["host.date-picker"],
    },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    distribution: {
      name: "Flight Assistant",
      description: "A governed flight application.",
      tags: ["travel", "booking"],
      visibility: "organization",
      discoverable: true,
    },
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
    fixedAmountNanos: 2_000_000_000,
    lines: [{
      meteringRef: { id: "meter.tokens", versionRef: "1" },
      unit: "token",
      window: "utc-day",
      basis: "used",
      quantity: 100,
      amountNanosPerUnit: 10_000_000,
      amountNanos: 1_000_000_000,
    }],
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

describe("commercial settlement", () => {
  it("parses and deterministically serializes settlement schedules", () => {
    const unsorted = schedule([
      rule({ settlementRef: { id: "settlement.zeta", versionRef: "1" } }),
      rule({ settlementRef: { id: "settlement.alpha", versionRef: "2" } }),
    ]);
    const parsed = parseViraCommercialSettlementSchedule(unsorted);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.rules.map((entry) => entry.settlementRef.id)).toEqual([
      "settlement.alpha",
      "settlement.zeta",
    ]);
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.rules)).toBe(true);
    expect(Object.isFrozen(parsed.value.rules[0])).toBe(true);

    const first = serializeViraCommercialSettlementSchedule(unsorted);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = serializeViraCommercialSettlementSchedule(JSON.parse(first.value));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value).toBe(first.value);
  });

  it("allocates canonical quote gross deterministically", () => {
    const result = allocateViraCommercialSettlement(schedule(), request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      schemaVersion: "1",
      settlementRef: { id: "settlement.vira-flight", versionRef: "1" },
      applicationId: "vira.flight-assistant",
      applicationVersion: "1.2.0",
      publisherId: "vira",
      publisherShareBps: 7000,
      publisherAmountNanos: 2_100_000_000,
      platformAmountNanos: 900_000_000,
    });
    expect(result.value.quote).toEqual(quote());
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.quote)).toBe(true);
    expect("paid" in result.value).toBe(false);
    expect("payoutId" in result.value).toBe(false);
    expect("invoiceId" in result.value).toBe(false);
  });

  it("parses and serializes allocation evidence with canonical embedded quote", () => {
    const allocation = allocateViraCommercialSettlement(schedule(), request());
    expect(allocation.ok).toBe(true);
    if (!allocation.ok) return;

    const parsed = parseViraCommercialSettlementAllocation(allocation.value);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(allocation.value);

    const serialized = serializeViraCommercialSettlementAllocation(allocation.value);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const roundTrip = parseViraCommercialSettlementAllocation(JSON.parse(serialized.value));
    expect(roundTrip.ok).toBe(true);
    if (!roundTrip.ok) return;
    expect(roundTrip.value).toEqual(allocation.value);
  });

  it("uses explicit floor rounding and leaves fractional nano remainder with platform", () => {
    const smallQuote = quote({
      fixedAmountNanos: 10_001,
      lines: [],
      totalAmountNanos: 10_001,
    });
    const result = allocateViraCommercialSettlement(
      schedule([rule({ publisherShareBps: 3333 })]),
      request({ quote: smallQuote }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.publisherAmountNanos).toBe(3333);
    expect(result.value.platformAmountNanos).toBe(6668);
  });

  it("supports zero and full publisher share without floating-point money", () => {
    const zero = allocateViraCommercialSettlement(
      schedule([rule({ publisherShareBps: 0 })]),
      request(),
    );
    expect(zero.ok).toBe(true);
    if (zero.ok) {
      expect(zero.value.publisherAmountNanos).toBe(0);
      expect(zero.value.platformAmountNanos).toBe(3_000_000_000);
    }

    const full = allocateViraCommercialSettlement(
      schedule([rule({ publisherShareBps: 10_000 })]),
      request(),
    );
    expect(full.ok).toBe(true);
    if (full.ok) {
      expect(full.value.publisherAmountNanos).toBe(3_000_000_000);
      expect(full.value.platformAmountNanos).toBe(0);
    }
  });
});
