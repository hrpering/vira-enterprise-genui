import { describe, expect, it } from "vitest";
import { createViraCommercialUsageLedger } from "../../packages/commercial-metering/src/index.js";

function record(overrides: Record<string, unknown> = {}) {
  return {
    usageId: "usage-1",
    sourceId: "host.reference",
    occurredAt: "2026-09-05T10:00:00Z",
    applicationId: "demo.refund-app",
    applicationVersion: "1.0.0",
    entitlementRef: { id: "entitlement.refund-enterprise", versionRef: "1" },
    meteringRef: { id: "metering.refund-invocations", versionRef: "1" },
    principal: { version: "1", kind: "user", id: "user-1", organizationId: "contoso" },
    scope: { version: "1", organizationId: "contoso", projectId: "refunds", environment: "production" },
    capabilityRef: { id: "refund.analysis", versionRef: "1" },
    locationId: "eu",
    quantity: 1,
    ...overrides,
  };
}

describe("Vira Commercial Usage Ledger v1", () => {
  it("appends validated usage and returns deterministic frozen snapshots", () => {
    const created = createViraCommercialUsageLedger();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(Object.isFrozen(created.value)).toBe(true);

    expect(created.value.append(record({ usageId: "later", occurredAt: "2026-09-05T11:00:00Z" })).ok).toBe(true);
    expect(created.value.append(record({ usageId: "earlier", occurredAt: "2026-09-05T09:00:00Z" })).ok).toBe(true);

    const snapshot = created.value.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.records)).toBe(true);
    expect(snapshot.records.map((entry) => entry.usageId)).toEqual(["earlier", "later"]);
  });

  it("preserves initial canonical usage and rejects duplicate ids across later appends", () => {
    const created = createViraCommercialUsageLedger({ schemaVersion: "1", records: [record()] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.value.append(record({ quantity: 99 }))).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_USAGE_ID" },
    });
    expect(created.value.snapshot().records).toHaveLength(1);
    expect(created.value.snapshot().records[0]?.quantity).toBe(1);
  });

  it("rejects malformed append input without mutating ledger state", () => {
    const created = createViraCommercialUsageLedger();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const failed = created.value.append(record({ price: 10 }));
    expect(failed).toMatchObject({ ok: false, issue: { code: "INVALID_USAGE_RECORD" } });
    expect(created.value.snapshot().records).toEqual([]);
  });
});
