import { describe, expect, it } from "vitest";
import { parseViraCapabilityExactReference } from "@vira-enterprise-genui/capability-contract";
import {
  lookupViraCapabilitySupply,
  parseViraCapabilitySupplySnapshot,
} from "@vira-enterprise-genui/capability-supply";
import {
  invokeViraHostedCapability,
  type ViraHostedCapabilityAdapterInput,
} from "@vira-enterprise-genui/hosted-capability-runtime";

function capability(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1",
    id: "acme.catalog-search",
    version: "1.0.0",
    publisher: { id: "acme", name: "Acme" },
    metadata: { name: "Catalog search" },
    input: { typeRef: { id: "type.catalog-query", versionRef: "1" } },
    output: { typeRef: { id: "type.catalog-result", versionRef: "1" } },
    contextRequirements: [],
    invocation: { kind: "query" as const },
    ...overrides,
  };
}

function binding(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    bindingRef: { id: "binding.acme.catalog-search", versionRef: "1" },
    capabilityRef: { id: "acme.catalog-search", versionRef: "1.0.0" },
    providerId: "acme.provider",
    locationId: "eu.west",
    ...overrides,
  };
}

function snapshot(capabilityValue: unknown = capability(), bindingValue: unknown = binding()) {
  return {
    schemaVersion: "1",
    sources: [{
      sourceId: "acme.provider.catalog",
      supplies: [{ capability: capabilityValue, binding: bindingValue }],
    }],
  };
}

function query(overrides: Record<string, unknown> = {}) {
  return {
    capabilityId: "acme.catalog-search",
    capabilityVersion: "1.0.0",
    providerId: "acme.provider",
    locationId: "eu.west",
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    invocationId: "acme-invocation-1",
    principal: { version: "1", kind: "user", id: "user-1", organizationId: "contoso" },
    scope: { version: "1", organizationId: "contoso", projectId: "catalog", environment: "production" },
    input: {
      typeRef: { id: "type.catalog-query", versionRef: "1" },
      value: { query: "espresso" },
    },
    contexts: [],
    ...overrides,
  };
}

function success() {
  return {
    outcome: "success" as const,
    output: {
      typeRef: { id: "type.catalog-result", versionRef: "1" },
      value: { items: [{ id: "sku-1", title: "Espresso" }] },
    },
  };
}

describe("MASTER-50 independent external provider proof", () => {
  it("discovers one exact external provider binding and invokes its adapter once through public Vira roots", async () => {
    expect(parseViraCapabilityExactReference({ id: "binding.acme.catalog-search", versionRef: "1" }).ok).toBe(true);

    const parsed = parseViraCapabilitySupplySnapshot(snapshot());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const resolved = lookupViraCapabilitySupply(parsed.value, query());
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.supplies).toHaveLength(1);
    expect(resolved.value.supplies[0]?.sourceIds).toEqual(["acme.provider.catalog"]);

    const selected = resolved.value.supplies[0]!;
    let calls = 0;
    const executed = await invokeViraHostedCapability(
      selected.capability,
      selected.binding,
      request(),
      (input: ViraHostedCapabilityAdapterInput) => {
        calls += 1;
        expect(input.capability.id).toBe("acme.catalog-search");
        expect(input.binding.providerId).toBe("acme.provider");
        expect(input.binding.locationId).toBe("eu.west");
        expect(input.principal.organizationId).toBe("contoso");
        expect(input.scope.projectId).toBe("catalog");
        expect(input.input.value).toEqual({ query: "espresso" });
        expect(Object.isFrozen(input)).toBe(true);
        expect(Object.isFrozen(input.binding)).toBe(true);
        expect(Object.isFrozen(input.input.value)).toBe(true);
        return success();
      },
    );

    expect(calls).toBe(1);
    expect(executed.ok).toBe(true);
    if (!executed.ok) return;
    expect(executed.value).toMatchObject({
      invocationId: "acme-invocation-1",
      capabilityRef: { id: "acme.catalog-search", versionRef: "1.0.0" },
      bindingRef: { id: "binding.acme.catalog-search", versionRef: "1" },
      providerId: "acme.provider",
      locationId: "eu.west",
      outcome: "success",
    });
    for (const forbidden of [
      "authenticated",
      "attested",
      "authorized",
      "entitled",
      "selectedProvider",
      "priority",
      "price",
      "endpoint",
      "credential",
      "retry",
    ]) {
      expect(forbidden in executed.value).toBe(false);
    }
  });

  it("keeps supply discovery exact and returns an empty success instead of provider fallback", () => {
    const wrongVersion = lookupViraCapabilitySupply(snapshot(), query({ capabilityVersion: "1.0.1" }));
    expect(wrongVersion.ok).toBe(true);
    if (wrongVersion.ok) expect(wrongVersion.value.supplies).toEqual([]);

    const wrongProvider = lookupViraCapabilitySupply(snapshot(), query({ providerId: "other.provider" }));
    expect(wrongProvider.ok).toBe(true);
    if (wrongProvider.ok) expect(wrongProvider.value.supplies).toEqual([]);

    const wrongLocation = lookupViraCapabilitySupply(snapshot(), query({ locationId: "us.east" }));
    expect(wrongLocation.ok).toBe(true);
    if (wrongLocation.ok) expect(wrongLocation.value.supplies).toEqual([]);
  });

  it("rejects action Capability supply before any provider adapter can exist", () => {
    const result = parseViraCapabilitySupplySnapshot(snapshot(capability({
      invocation: { kind: "action", actionType: "catalog.purchase" },
    })));
    expect(result).toMatchObject({ ok: false, issue: { code: "ACTION_BOUNDARY_REQUIRED" } });
  });

  it("rejects provider endpoint, credential and trust smuggling inside the hosted binding", () => {
    for (const field of ["endpoint", "credential", "token", "healthy", "trusted", "attested", "priority"]) {
      const result = parseViraCapabilitySupplySnapshot(snapshot(capability(), binding({ [field]: "forbidden" })));
      expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_BINDING" } });
    }
  });

  it("rejects floating provider binding references using the canonical Capability exact-reference owner", () => {
    const result = parseViraCapabilitySupplySnapshot(snapshot(capability(), binding({
      bindingRef: { id: "binding.acme.catalog-search", versionRef: "latest" },
    })));
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_BINDING" } });
  });

  it("fails before provider invocation when binding and Capability identity diverge", async () => {
    let calls = 0;
    const result = await invokeViraHostedCapability(
      capability(),
      binding({ capabilityRef: { id: "acme.catalog-search", versionRef: "2.0.0" } }),
      request(),
      () => {
        calls += 1;
        return success();
      },
    );
    expect(calls).toBe(0);
    expect(result).toMatchObject({ ok: false, issue: { code: "CAPABILITY_MISMATCH" } });
  });

  it("rejects provider result authority smuggling rather than copying it into execution evidence", async () => {
    const result = await invokeViraHostedCapability(
      capability(),
      binding(),
      request(),
      () => ({ ...success(), authorized: true }),
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_ADAPTER_RESULT" } });
  });

  it("turns provider throws into one explicit adapter failure with no retry", async () => {
    let calls = 0;
    const result = await invokeViraHostedCapability(capability(), binding(), request(), () => {
      calls += 1;
      throw new Error("provider offline");
    });
    expect(calls).toBe(1);
    expect(result).toMatchObject({ ok: false, issue: { code: "ADAPTER_FAILED" } });
  });
});
