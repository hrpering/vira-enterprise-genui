import { describe, expect, it } from "vitest";
import { parseExperienceRegistrySnapshot } from "../../packages/experience-registry/src/index.js";
import {
  createViraExperienceResolver,
  createViraRuntimeCapabilityRegistry,
  parseViraExperienceMessage,
} from "../../packages/genui-resolver/src/index.js";
import type { ViraExperienceRuntime } from "../../packages/genui/src/index.js";

const digest = `sha256:${"d".repeat(64)}`;
const publication = {
  version: "1", id: "pub", recipeId: "proof", entryView: "main", document: {},
  manifest: { componentRefs: ["neutral.card"], actionEvents: [], bindingSources: [] },
};

function registry() {
  const parsed = parseExperienceRegistrySnapshot(JSON.stringify({ schemaVersion: "1", manifests: [{
    schemaVersion: "1", id: "vira/example", version: "1.0.0",
    publisher: { id: "vira", name: "Vira" }, metadata: { name: "Example", tags: ["utility"] },
    compatibility: { minViraVersion: "0.0.0" }, entrypoints: ["main"],
    artifacts: [{ id: "main", role: "studio-publication", mediaType: "application/json", digest, size: 1 }],
  }] }));
  if (!parsed.ok) throw new Error("registry fixture");
  return parsed.value;
}

function runtime(disposals: { count: number }): ViraExperienceRuntime {
  return {
    hostId: "test", controller: {} as ViraExperienceRuntime["controller"], revision: () => 0,
    subscribe: () => () => {}, renderReact: () => ({ ok: true, value: null }),
    dispose: () => { disposals.count += 1; },
  };
}

function present(instanceId: string) {
  const parsed = parseViraExperienceMessage({
    version: "1", op: "present", instanceId,
    pack: { id: "vira/example", version: "1.0.0", entrypoint: "main" }, payload: {},
  });
  if (!parsed.ok || parsed.value.op !== "present") throw new Error("message fixture");
  return parsed.value;
}

describe("instance-bound runtime profile commands", () => {
  it("keeps prepared command state isolated per resolved instance and cleans it up", async () => {
    const calls = new Map<string, number>();
    const profileDisposals = new Map<string, number>();
    const capabilities = createViraRuntimeCapabilityRegistry([{
      id: "neutral", componentRefs: ["neutral.card"], actionEvents: [], bindingSources: [],
      prepare: ({ instanceId }) => ({
        componentCatalog: {}, bindingSourceCatalog: {}, actionAdapter: {}, runtimeState: {}, permissionPolicy: {}, host: {},
        renderers: { "neutral.card": () => null },
        commands: { bump: () => { calls.set(instanceId, (calls.get(instanceId) ?? 0) + 1); return { ok: true }; } },
        dispose: () => { profileDisposals.set(instanceId, (profileDisposals.get(instanceId) ?? 0) + 1); },
      }),
    }]);
    if (!capabilities.ok) throw new Error("profile fixture");
    const runtimeDisposals = { count: 0 };
    const resolver = createViraExperienceResolver({
      registry: registry(), artifactResolver: { resolveStudioPublication: async () => publication }, capabilities: capabilities.value,
      runtimeFactory: () => ({ ok: true, value: runtime(runtimeDisposals) }),
    });

    const a = await resolver.resolvePresent(present("a"));
    const b = await resolver.resolvePresent(present("b"));
    if (!a.ok || !b.ok) throw new Error("resolution fixture");
    expect(await a.value.command("bump", {})).toEqual({ ok: true });
    expect(calls.get("a")).toBe(1);
    expect(calls.get("b") ?? 0).toBe(0);
    a.value.dispose();
    expect(runtimeDisposals.count).toBe(1);
    expect(profileDisposals.get("a")).toBe(1);
    expect(profileDisposals.get("b") ?? 0).toBe(0);
    b.value.dispose();
    expect(profileDisposals.get("b")).toBe(1);
  });
});
