import { describe, expect, it } from "vitest";
import {
  migrateViraApplicationPackageV1ToV2,
  parseViraApplicationPackageV2,
} from "../../packages/application-package/src/index.js";

function v1Fixture(): Record<string, unknown> {
  return {
    schemaVersion: "1",
    identity: { id: "vira.flight-assistant" },
    version: "1.2.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [],
    capabilities: [{ id: "travel.flight.search-capability", versionRef: "1" }],
    contextTypes: [],
    actions: [{ actionType: "travel.flight.book" }],
    flows: [{ id: "travel.flight.booking-flow", versionRef: "1" }],
    brandRef: null,
    governanceRequirements: [],
    hostCompatibility: {
      minViraVersion: "1.0.0",
      requiredCapabilities: [],
    },
    protocolProjections: [],
    distribution: {
      name: "Flight Assistant",
      tags: ["travel"],
      visibility: "private",
      discoverable: false,
    },
    commercial: {
      entitlementRefs: [{ id: "entitlement.flight-assistant", versionRef: "1" }],
      meteringRefs: [{ id: "metering.flight-assistant", versionRef: "1" }],
    },
  };
}

function declaration(): Record<string, unknown> {
  return {
    actionMappings: [{
      actionType: "travel.flight.book",
      actionRef: { id: "travel.flight.book", versionRef: "2026-09-05" },
    }],
    triggers: [{
      type: "api",
      entrypointRef: { id: "travel.flight.booking-flow", versionRef: "1" },
    }],
    pricingRefs: [{ id: "pricing.flight-assistant", versionRef: "1" }],
    settlementRefs: [{ id: "settlement.flight-assistant", versionRef: "1" }],
  };
}

describe("explicit Application v1 -> v2 migration", () => {
  it("migrates only when every versionless Action has an explicit exact mapping", () => {
    const migrated = migrateViraApplicationPackageV1ToV2(v1Fixture(), declaration());
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.value.schemaVersion).toBe("2");
    expect(migrated.value.actions).toEqual([
      { id: "travel.flight.book", versionRef: "2026-09-05" },
    ]);
    expect("actionType" in migrated.value.actions[0]!).toBe(false);
    expect(parseViraApplicationPackageV2(migrated.value).ok).toBe(true);
  });

  it("fails closed when a legacy Action mapping is missing", () => {
    const migration = declaration();
    migration.actionMappings = [];
    expect(migrateViraApplicationPackageV1ToV2(v1Fixture(), migration)).toMatchObject({
      ok: false,
      issue: { code: "MISSING_ACTION_MAPPING", path: "$.actions[0].actionType" },
    });
  });

  it("fails closed when the same legacy Action has ambiguous mappings", () => {
    const migration = declaration();
    migration.actionMappings = [
      {
        actionType: "travel.flight.book",
        actionRef: { id: "travel.flight.book", versionRef: "2026-09-05" },
      },
      {
        actionType: "travel.flight.book",
        actionRef: { id: "travel.flight.book", versionRef: "2026-09-06" },
      },
    ];
    expect(migrateViraApplicationPackageV1ToV2(v1Fixture(), migration)).toMatchObject({
      ok: false,
      issue: { code: "AMBIGUOUS_ACTION_MAPPING" },
    });
  });

  it("rejects unused mappings instead of silently broadening the V1 Application", () => {
    const migration = declaration();
    migration.actionMappings = [
      ...(migration.actionMappings as unknown[]),
      {
        actionType: "travel.hotel.book",
        actionRef: { id: "travel.hotel.book", versionRef: "1" },
      },
    ];
    expect(migrateViraApplicationPackageV1ToV2(v1Fixture(), migration)).toMatchObject({
      ok: false,
      issue: { code: "UNUSED_ACTION_MAPPING" },
    });
  });

  it("rejects floating mappings and identity-changing mappings", () => {
    const floating = declaration();
    floating.actionMappings = [{
      actionType: "travel.flight.book",
      actionRef: { id: "travel.flight.book", versionRef: "latest" },
    }];
    expect(migrateViraApplicationPackageV1ToV2(v1Fixture(), floating)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ACTION_MAPPING", path: "$migration.actionMappings[0].actionRef.versionRef" },
    });

    const renamed = declaration();
    renamed.actionMappings = [{
      actionType: "travel.flight.book",
      actionRef: { id: "travel.flight.purchase", versionRef: "1" },
    }];
    expect(migrateViraApplicationPackageV1ToV2(v1Fixture(), renamed)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ACTION_MAPPING", path: "$migration.actionMappings[0].actionRef.id" },
    });
  });

  it("requires trigger/pricing/settlement migration declarations explicitly, including empty arrays", () => {
    const incomplete = declaration();
    delete incomplete.pricingRefs;
    expect(migrateViraApplicationPackageV1ToV2(v1Fixture(), incomplete)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_MIGRATION_INPUT", path: "$migration.pricingRefs" },
    });
  });

  it("does not let the V2 parser silently accept a V1 artifact", () => {
    expect(parseViraApplicationPackageV2(v1Fixture())).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD" },
    });
  });
});
