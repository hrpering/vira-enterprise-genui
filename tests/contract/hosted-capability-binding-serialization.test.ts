import { describe, expect, it } from "vitest";
import {
  serializeViraHostedCapabilityBinding,
} from "../../packages/hosted-capability-runtime/src/index.js";

function binding(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    bindingRef: { id: "binding.search.acme", versionRef: "1" },
    capabilityRef: { id: "search.web", versionRef: "1.0.0" },
    providerId: "provider.acme",
    locationId: "region.eu",
    ...overrides,
  };
}

describe("hosted Capability binding serialization", () => {
  it("serializes canonical parsed bindings deterministically", () => {
    const first = serializeViraHostedCapabilityBinding(binding());
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = serializeViraHostedCapabilityBinding(JSON.parse(first.value));
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.value).toBe(first.value);
    expect(second.binding).toEqual(first.binding);
    expect(Object.isFrozen(first.binding)).toBe(true);
  });

  it("delegates malformed and floating references to the canonical binding parser", () => {
    expect(serializeViraHostedCapabilityBinding(binding({
      bindingRef: { id: "binding.search.acme", versionRef: "latest" },
    }))).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });

    expect(serializeViraHostedCapabilityBinding({ ...binding(), endpoint: "https://provider.invalid" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_BINDING" },
    });
  });

  it("fails closed on accessor input without invoking getters", () => {
    let getterCalls = 0;
    const malicious: Record<string, unknown> = { ...binding() };
    Object.defineProperty(malicious, "providerId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "provider.acme";
      },
    });

    expect(serializeViraHostedCapabilityBinding(malicious).ok).toBe(false);
    expect(getterCalls).toBe(0);
  });
});
