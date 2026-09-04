import { describe, expect, it } from "vitest";
import { createViraEnterpriseContext } from "../../packages/enterprise-context/src/index.js";
import { parseExperienceRegistrySnapshot } from "../../packages/experience-registry/src/index.js";
import { createViraPrivateEnterpriseRegistry } from "../../packages/enterprise-registry/src/index.js";

function fixture() {
  const context = createViraEnterpriseContext({ organizationId: "acme", projectId: "checkout", environments: ["dev", "production"] });
  if (!context.ok) throw new Error("context fixture failed");
  const packs = parseExperienceRegistrySnapshot('{"schemaVersion":"1","manifests":[]}');
  if (!packs.ok) throw new Error("pack registry fixture failed");
  const registry = createViraPrivateEnterpriseRegistry({
    context: context.value,
    environment: "production",
    packRegistry: packs.value,
    approvedNativeCapabilities: ["native.checkout.card"],
  });
  if (!registry.ok) throw new Error("enterprise registry fixture failed");
  return registry.value;
}

describe("MASTER-21 private enterprise registry", () => {
  it("approves exact scoped metadata without executable payload fields", () => {
    const registry = fixture();
    const approved = registry.approve({ version: "1", kind: "component", id: "checkout.card", versionRef: "1.0.0", nativeCapabilityId: "native.checkout.card" });
    expect(approved.ok).toBe(true);
    expect(registry.lookup("component", "checkout.card", "1.0.0")).toEqual({ ok: true, value: approved.ok ? approved.value : null });
  });

  it("rejects arbitrary HTML/JS-shaped fields because executable content is not representable", () => {
    const registry = fixture();
    const result = registry.approve({ version: "1", kind: "component", id: "checkout.card", versionRef: "1", html: "<script>alert(1)</script>" });
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_ENTRY" } });
  });

  it("rejects unknown native capabilities", () => {
    const registry = fixture();
    const result = registry.approve({ version: "1", kind: "component", id: "checkout.card", versionRef: "1", nativeCapabilityId: "native.unknown.card" });
    expect(result).toMatchObject({ ok: false, issue: { code: "UNKNOWN_NATIVE_CAPABILITY" } });
  });

  it("requires Pack identities to already exist in the canonical Experience Registry", () => {
    const registry = fixture();
    const result = registry.approve({ version: "1", kind: "pack", id: "checkout.pack", versionRef: "1.0.0" });
    expect(result).toMatchObject({ ok: false, issue: { code: "PACK_NOT_REGISTERED" } });
  });

  it("fails when the requested environment is not registered by the enterprise context", () => {
    const context = createViraEnterpriseContext({ organizationId: "acme", projectId: "checkout", environments: ["dev"] });
    const packs = parseExperienceRegistrySnapshot('{"schemaVersion":"1","manifests":[]}');
    if (!context.ok || !packs.ok) throw new Error("fixture failed");
    const result = createViraPrivateEnterpriseRegistry({ context: context.value, environment: "production", packRegistry: packs.value });
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_SCOPE" } });
  });
});
