import { describe, expect, it } from "vitest";
import {
  parseViraCapabilityDefinition,
  parseViraCapabilityExactReference,
  serializeViraCapabilityExactReference,
} from "../../packages/capability-contract/src/index.js";
import { parseViraHostedCapabilityBinding } from "../../packages/hosted-capability-runtime/src/index.js";

function capability(reference: unknown) {
  return {
    schemaVersion: "1",
    id: "acme.search",
    version: "1.0.0",
    publisher: { id: "acme", name: "Acme" },
    metadata: { name: "Search" },
    input: { typeRef: reference },
    output: { typeRef: null },
    contextRequirements: [],
    invocation: { kind: "query" as const },
  };
}

function binding(reference: unknown) {
  return {
    version: "1",
    bindingRef: reference,
    capabilityRef: { id: "acme.search", versionRef: "1.0.0" },
    providerId: "acme.provider",
    locationId: "eu.west",
  };
}

describe("Capability exact-reference canonical owner parity", () => {
  it("exports one canonical parse/serialize surface for exact Capability references", () => {
    const reference = { id: "type.search-query", versionRef: "1" };
    const parsed = parseViraCapabilityExactReference(reference);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(reference);
    expect(Object.isFrozen(parsed.value)).toBe(true);

    const serialized = serializeViraCapabilityExactReference(reference);
    expect(serialized.ok).toBe(true);
    if (serialized.ok) expect(serialized.value).toBe('{"id":"type.search-query","versionRef":"1"}');
  });

  it("keeps CapabilityDefinition nested references aligned with the canonical owner", () => {
    for (const reference of [
      { id: "type.search-query", versionRef: "1" },
      { id: "type.search-query", versionRef: "1.2.3" },
    ]) {
      expect(parseViraCapabilityExactReference(reference).ok).toBe(true);
      expect(parseViraCapabilityDefinition(capability(reference)).ok).toBe(true);
    }

    for (const reference of [
      { id: "type.search-query", versionRef: "latest" },
      { id: "type.search-query", versionRef: "1.x" },
      { id: "type.search-query", versionRef: "1", priority: 1 },
      { id: "bad id", versionRef: "1" },
    ]) {
      expect(parseViraCapabilityExactReference(reference).ok).toBe(false);
      expect(parseViraCapabilityDefinition(capability(reference)).ok).toBe(false);
    }
  });

  it("keeps HostedCapabilityBinding references aligned with the canonical owner", () => {
    for (const reference of [
      { id: "binding.acme.search", versionRef: "1" },
      { id: "binding.acme.search", versionRef: "1.0.0" },
    ]) {
      expect(parseViraCapabilityExactReference(reference).ok).toBe(true);
      expect(parseViraHostedCapabilityBinding(binding(reference)).ok).toBe(true);
    }

    for (const reference of [
      { id: "binding.acme.search", versionRef: "current" },
      { id: "binding.acme.search", versionRef: "2.x" },
      { id: "binding.acme.search", versionRef: "1", endpoint: "https://forbidden.example" },
    ]) {
      expect(parseViraCapabilityExactReference(reference).ok).toBe(false);
      expect(parseViraHostedCapabilityBinding(binding(reference)).ok).toBe(false);
    }
  });

  it("preserves canonical owner error locations under nested consumer paths", () => {
    const definition = parseViraCapabilityDefinition(capability({
      id: "type.search-query",
      versionRef: "latest",
    }));
    expect(definition).toMatchObject({
      ok: false,
      issue: { code: "FLOATING_REFERENCE", path: "$.input.typeRef.versionRef" },
    });

    const hosted = parseViraHostedCapabilityBinding(binding({
      id: "binding.acme.search",
      versionRef: "latest",
    }));
    expect(hosted).toMatchObject({
      ok: false,
      issue: { code: "FLOATING_REFERENCE", path: "$.bindingRef.versionRef" },
    });
  });

  it("fails closed on unsafe accessor and custom-prototype exact references without invoking getters", () => {
    let getterCalls = 0;
    const accessor: Record<string, unknown> = { id: "type.search-query" };
    Object.defineProperty(accessor, "versionRef", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      },
    });
    expect(parseViraCapabilityExactReference(accessor).ok).toBe(false);
    expect(getterCalls).toBe(0);

    const custom = Object.assign(
      Object.create({ inherited: true }) as Record<string, unknown>,
      { id: "type.search-query", versionRef: "1" },
    );
    expect(parseViraCapabilityExactReference(custom).ok).toBe(false);
  });
});
