import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseViraApplicationPackageV2,
  serializeViraApplicationPackageV2,
} from "../../packages/application-package/src/index.js";
import {
  parseViraApplicationGraphV2,
} from "../../packages/application-graph/src/index.js";
import {
  parseViraCapabilityDefinitionV2,
} from "../../packages/capability-contract/src/index.js";

function applicationFixture(): Record<string, unknown> {
  return {
    schemaVersion: "2",
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
    actions: [{ id: "travel.flight.book", versionRef: "2026-09-05" }],
    flows: [{ id: "travel.flight.booking-flow", versionRef: "1" }],
    brandRef: { id: "brand.vira", versionRef: "1" },
    governanceRequirements: [{ id: "governance.booking-approval", versionRef: "1" }],
    hostCompatibility: {
      minViraVersion: "1.0.0",
      maxViraVersion: "2.0.0",
      requiredCapabilities: ["host.date-picker"],
    },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    triggers: [{
      type: "api",
      entrypointRef: { id: "travel.flight.booking-flow", versionRef: "1" },
    }],
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
      pricingRefs: [{ id: "pricing.flight-assistant", versionRef: "1" }],
      settlementRefs: [{ id: "settlement.flight-assistant", versionRef: "1" }],
    },
  };
}

function graphFixture(): Record<string, unknown> {
  return {
    schemaVersion: "2",
    id: "vira.flight-application-graph",
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    metadata: { name: "Flight Application Graph" },
    nodes: [
      {
        id: "surface",
        target: {
          kind: "experience",
          ref: {
            id: "travel.flight.search",
            packId: "vira/flight-booking",
            packVersion: "2.1.0",
            entrypoint: "main",
          },
        },
      },
      {
        id: "book",
        target: {
          kind: "action",
          ref: { id: "travel.flight.book", versionRef: "2026-09-05" },
        },
      },
    ],
    edges: [
      { id: "offer", kind: "experience-offers-action", from: "surface", to: "book" },
    ],
  };
}

function capabilityFixture(): Record<string, unknown> {
  return {
    schemaVersion: "2",
    id: "vira.flight-booking",
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    metadata: { name: "Flight Booking" },
    input: { typeRef: { id: "travel.flight-search-input", versionRef: "1" } },
    output: { typeRef: { id: "travel.flight-booking-result", versionRef: "1" } },
    contextRequirements: [{ id: "travel.trip-context", versionRef: "1" }],
    invocation: {
      kind: "action",
      actionRef: { id: "travel.flight.book", versionRef: "2026-09-05" },
    },
  };
}

describe("Canonical Application / Graph / Capability V2", () => {
  it("binds protected Actions by exact id + versionRef across all three canonical owners", () => {
    const application = parseViraApplicationPackageV2(applicationFixture());
    const graph = parseViraApplicationGraphV2(graphFixture());
    const capability = parseViraCapabilityDefinitionV2(capabilityFixture());

    expect(application.ok).toBe(true);
    expect(graph.ok).toBe(true);
    expect(capability.ok).toBe(true);
    if (!application.ok || !graph.ok || !capability.ok) return;

    expect(application.value.actions[0]).toEqual({ id: "travel.flight.book", versionRef: "2026-09-05" });
    expect(graph.value.nodes[1]?.target).toEqual({
      kind: "action",
      ref: { id: "travel.flight.book", versionRef: "2026-09-05" },
    });
    expect(capability.value.invocation).toEqual({
      kind: "action",
      actionRef: { id: "travel.flight.book", versionRef: "2026-09-05" },
    });
  });

  it("rejects legacy actionType on every protected V2 surface", () => {
    const application = applicationFixture();
    application.actions = [{ actionType: "travel.flight.book" }];
    expect(parseViraApplicationPackageV2(application)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ACTION" },
    });

    const graph = graphFixture();
    const nodes = graph.nodes as Array<Record<string, unknown>>;
    nodes[1] = { id: "book", target: { kind: "action", actionType: "travel.flight.book" } };
    expect(parseViraApplicationGraphV2(graph)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_NODE_TARGET", path: "$.nodes[1].target.actionType" },
    });

    const capability = capabilityFixture();
    capability.invocation = { kind: "action", actionType: "travel.flight.book" };
    expect(parseViraCapabilityDefinitionV2(capability)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INVOCATION", path: "$.invocation.actionType" },
    });
  });

  it("rejects floating Action refs with owner-parser parity", () => {
    const application = applicationFixture();
    application.actions = [{ id: "travel.flight.book", versionRef: "latest" }];
    expect(parseViraApplicationPackageV2(application)).toMatchObject({
      ok: false,
      issue: { code: "FLOATING_REFERENCE", path: "$.actions[0].versionRef" },
    });

    const graph = graphFixture();
    const nodes = graph.nodes as Array<Record<string, unknown>>;
    nodes[1] = {
      id: "book",
      target: { kind: "action", ref: { id: "travel.flight.book", versionRef: "latest" } },
    };
    expect(parseViraApplicationGraphV2(graph)).toMatchObject({
      ok: false,
      issue: { code: "FLOATING_REFERENCE", path: "$.nodes[1].target.ref.versionRef" },
    });

    const capability = capabilityFixture();
    capability.invocation = {
      kind: "action",
      actionRef: { id: "travel.flight.book", versionRef: "latest" },
    };
    expect(parseViraCapabilityDefinitionV2(capability)).toMatchObject({
      ok: false,
      issue: { code: "FLOATING_REFERENCE", path: "$.invocation.actionRef.versionRef" },
    });
  });

  it("keeps triggers portable and bound to exact declared flow entrypoints", () => {
    const application = applicationFixture();
    application.triggers = [
      { type: "webhook", entrypointRef: { id: "travel.flight.booking-flow", versionRef: "1" } },
      { type: "schedule", entrypointRef: { id: "travel.flight.booking-flow", versionRef: "1" } },
      { type: "application-call", entrypointRef: { id: "travel.flight.booking-flow", versionRef: "1" } },
    ];
    expect(parseViraApplicationPackageV2(application).ok).toBe(true);

    const missing = applicationFixture();
    missing.triggers = [{
      type: "api",
      entrypointRef: { id: "travel.flight.missing-flow", versionRef: "1" },
    }];
    expect(parseViraApplicationPackageV2(missing)).toMatchObject({
      ok: false,
      issue: { code: "TRIGGER_ENTRYPOINT_NOT_FOUND", path: "$.triggers[0].entrypointRef" },
    });

    const floating = applicationFixture();
    floating.triggers = [{
      type: "api",
      entrypointRef: { id: "travel.flight.booking-flow", versionRef: "latest" },
    }];
    expect(parseViraApplicationPackageV2(floating)).toMatchObject({
      ok: false,
      issue: { code: "FLOATING_REFERENCE", path: "$.triggers[0].entrypointRef.versionRef" },
    });
  });

  it("carries all commercial authorities only as exact references", () => {
    const application = applicationFixture();
    const parsed = parseViraApplicationPackageV2(application);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.commercial.pricingRefs).toEqual([
      { id: "pricing.flight-assistant", versionRef: "1" },
    ]);
    expect(parsed.value.commercial.settlementRefs).toEqual([
      { id: "settlement.flight-assistant", versionRef: "1" },
    ]);

    const floating = applicationFixture();
    const commercial = floating.commercial as Record<string, unknown>;
    commercial.pricingRefs = [{ id: "pricing.flight-assistant", versionRef: "1.x" }];
    expect(parseViraApplicationPackageV2(floating)).toMatchObject({
      ok: false,
      issue: { code: "FLOATING_REFERENCE", path: "$.commercial.pricingRefs[0].versionRef" },
    });
  });

  it("rejects two versions for the same protected Action id", () => {
    const application = applicationFixture();
    application.actions = [
      { id: "travel.flight.book", versionRef: "2026-09-05" },
      { id: "travel.flight.book", versionRef: "2026-09-06" },
    ];
    expect(parseViraApplicationPackageV2(application)).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_ACTION", path: "$.actions[1].id" },
    });
  });

  it("has a deterministic canonical serialization digest that changes with Action versionRef", () => {
    const first = serializeViraApplicationPackageV2(applicationFixture());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(createHash("sha256").update(first.value).digest("hex"))
      .toBe("60f13da561652fab8dc2cbcc40c8b0c4d8aab107338e4f8399a852314f6e5e18");

    const changed = applicationFixture();
    changed.actions = [{ id: "travel.flight.book", versionRef: "2026-09-06" }];
    const second = serializeViraApplicationPackageV2(changed);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(createHash("sha256").update(second.value).digest("hex"))
      .not.toBe("60f13da561652fab8dc2cbcc40c8b0c4d8aab107338e4f8399a852314f6e5e18");
  });

  it("rejects unsafe accessor and inherited-prototype input at the V2 boundary", () => {
    const accessor = applicationFixture();
    Object.defineProperty(accessor, "actions", {
      enumerable: true,
      get: () => [{ id: "travel.flight.book", versionRef: "2026-09-05" }],
    });
    expect(parseViraApplicationPackageV2(accessor)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_TYPE" },
    });

    const polluted = Object.create({ admin: true }) as Record<string, unknown>;
    Object.assign(polluted, applicationFixture());
    expect(parseViraApplicationPackageV2(polluted)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_TYPE" },
    });
  });
});
