import { describe, expect, it } from "vitest";
import { parseExperienceRegistrySnapshot } from "../../packages/experience-registry/src/index.js";
import {
  createViraExperienceResolver,
  createViraRuntimeCapabilityRegistry,
  parseViraExperienceMessage,
} from "../../packages/genui-resolver/src/index.js";
import type { ViraExperienceRuntime } from "../../packages/genui/src/index.js";

const digest = `sha256:${"c".repeat(64)}`;

function registry() {
  const parsed = parseExperienceRegistrySnapshot(JSON.stringify({
    schemaVersion: "1",
    manifests: [{
      schemaVersion: "1",
      id: "vira/example",
      version: "1.0.0",
      publisher: { id: "vira", name: "Vira" },
      metadata: { name: "Example", tags: ["utility"] },
      compatibility: { minViraVersion: "0.0.0" },
      entrypoints: ["main"],
      artifacts: [{ id: "main", role: "studio-publication", mediaType: "application/json", digest, size: 1 }],
    }],
  }));
  if (!parsed.ok) throw new Error("registry fixture must parse");
  return parsed.value;
}

const publication = {
  version: "1",
  id: "pub-example",
  recipeId: "example",
  entryView: "main",
  document: {},
  manifest: {
    componentRefs: ["neutral.card"],
    actionEvents: ["activate"],
    bindingSources: ["state.value"],
  },
};

function runtime(): ViraExperienceRuntime {
  return {
    hostId: "test-host",
    controller: {} as ViraExperienceRuntime["controller"],
    revision: () => 0,
    subscribe: () => () => {},
    renderReact: () => ({ ok: true, value: null }),
    dispose: () => {},
  };
}

function presentMessage() {
  const parsed = parseViraExperienceMessage({
    version: "1",
    op: "present",
    instanceId: "exp-a",
    pack: { id: "vira/example", version: "1.0.0", entrypoint: "main" },
    payload: { value: "initial" },
  });
  if (!parsed.ok || parsed.value.op !== "present") throw new Error("present fixture must parse");
  return parsed.value;
}

describe("generic GenUI resolver", () => {
  it("resolves Pack entrypoint, dependency profile, runtime, and trusted command alias", async () => {
    let commands = 0;
    const capabilities = createViraRuntimeCapabilityRegistry([{
      id: "neutral",
      componentRefs: ["neutral.card"],
      actionEvents: ["activate"],
      bindingSources: ["state.value"],
      prepare: () => ({
        componentCatalog: {},
        bindingSourceCatalog: {},
        actionAdapter: {},
        runtimeState: {},
        permissionPolicy: {},
        host: {},
        renderers: { "neutral.card": () => null },
      }),
      commands: {
        "set-value": () => { commands += 1; return { ok: true }; },
      },
    }]);
    if (!capabilities.ok) throw new Error("capability fixture must parse");

    const resolver = createViraExperienceResolver({
      registry: registry(),
      artifactResolver: { resolveStudioPublication: async () => publication },
      capabilities: capabilities.value,
      runtimeFactory: () => ({ ok: true, value: runtime() }),
    });
    const resolved = await resolver.resolvePresent(presentMessage());
    expect(resolved).toMatchObject({ ok: true, value: { instanceId: "exp-a", profileId: "neutral" } });
    if (!resolved.ok) return;
    expect(await resolved.value.command("set-value", { value: "next" })).toEqual({ ok: true });
    expect(commands).toBe(1);
  });

  it("fails closed when publication dependencies have no trusted profile", async () => {
    const capabilities = createViraRuntimeCapabilityRegistry([]);
    if (!capabilities.ok) throw new Error("empty capability registry must parse");
    const resolver = createViraExperienceResolver({
      registry: registry(),
      artifactResolver: { resolveStudioPublication: async () => publication },
      capabilities: capabilities.value,
      runtimeFactory: () => ({ ok: true, value: runtime() }),
    });
    const resolved = await resolver.resolvePresent(presentMessage());
    expect(resolved).toMatchObject({ ok: false, issue: { code: "MISSING_CAPABILITY" } });
  });

  it("fails closed when multiple trusted profiles cover the same publication", async () => {
    const profile = {
      componentRefs: ["neutral.card"], actionEvents: ["activate"], bindingSources: ["state.value"],
      prepare: () => ({ componentCatalog: {}, bindingSourceCatalog: {}, actionAdapter: {}, runtimeState: {}, permissionPolicy: {}, host: {}, renderers: { "neutral.card": () => null } }),
    };
    const capabilities = createViraRuntimeCapabilityRegistry([{ id: "a", ...profile }, { id: "b", ...profile }]);
    if (!capabilities.ok) throw new Error("capability fixture must parse");
    const resolver = createViraExperienceResolver({
      registry: registry(), artifactResolver: { resolveStudioPublication: async () => publication }, capabilities: capabilities.value,
      runtimeFactory: () => ({ ok: true, value: runtime() }),
    });
    expect(await resolver.resolvePresent(presentMessage())).toMatchObject({ ok: false, issue: { code: "AMBIGUOUS_PROFILE" } });
  });
});
