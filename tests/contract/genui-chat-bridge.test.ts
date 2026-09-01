import { describe, expect, it } from "vitest";
import { createViraChatBridge } from "../../packages/genui-chat/src/index.js";
import type {
  ViraExperienceResolver,
  ViraResolvedExperience,
} from "../../packages/genui-resolver/src/index.js";
import type { ViraExperienceRuntime } from "../../packages/genui/src/index.js";

function runtime(): ViraExperienceRuntime {
  return {
    hostId: "test",
    controller: {} as ViraExperienceRuntime["controller"],
    revision: () => 0,
    subscribe: () => () => {},
    renderReact: () => ({ ok: true, value: null }),
    dispose: () => {},
  };
}

function fakeResolver(counters: Map<string, number>): ViraExperienceResolver {
  return {
    async resolvePresent(message) {
      const resolved: ViraResolvedExperience = {
        instanceId: message.instanceId,
        pack: message.pack,
        publication: {},
        profileId: "test",
        runtime: runtime(),
        renderers: {},
        async command() {
          counters.set(message.instanceId, (counters.get(message.instanceId) ?? 0) + 1);
          return { ok: true };
        },
        dispose() {},
      };
      return { ok: true, value: resolved };
    },
  };
}

function present(instanceId: string) {
  return {
    version: "1",
    op: "present",
    instanceId,
    pack: { id: "vira/example", version: "1.0.0", entrypoint: "main" },
    payload: {},
  };
}

function command(instanceId: string) {
  return { version: "1", op: "command", instanceId, command: "set-value", args: {} };
}

describe("generic GenUI Chat bridge instance correlation", () => {
  it("routes commands only to the exact mounted instance", async () => {
    const counters = new Map<string, number>();
    const bridge = createViraChatBridge(fakeResolver(counters));
    expect((await bridge.present(present("a"))).ok).toBe(true);
    expect((await bridge.present(present("b"))).ok).toBe(true);

    expect(await bridge.command(command("a"))).toEqual({ ok: true });
    expect(counters.get("a")).toBe(1);
    expect(counters.get("b") ?? 0).toBe(0);

    expect(await bridge.command(command("missing"))).toMatchObject({ ok: false, issue: { code: "INSTANCE_NOT_FOUND" } });
  });

  it("rejects duplicate instance mounts rather than targeting a global latest experience", async () => {
    const bridge = createViraChatBridge(fakeResolver(new Map()));
    expect((await bridge.present(present("a"))).ok).toBe(true);
    expect(await bridge.present(present("a"))).toMatchObject({ ok: false, issue: { code: "INSTANCE_ALREADY_MOUNTED" } });
  });
});
