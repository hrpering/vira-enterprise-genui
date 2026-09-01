import { describe, expect, it } from "vitest";
import { parseViraExperienceMessage } from "../../packages/genui-resolver/src/index.js";

describe("generic Vira experience message", () => {
  it("parses present and command messages without domain discriminators", () => {
    const present = parseViraExperienceMessage({
      version: "1",
      op: "present",
      instanceId: "exp-a",
      pack: { id: "vira/example", version: "1.0.0", entrypoint: "main" },
      payload: { query: "hello" },
    });
    const command = parseViraExperienceMessage({
      version: "1",
      op: "command",
      instanceId: "exp-a",
      command: "set-value",
      args: { value: "next" },
    });

    expect(present).toMatchObject({ ok: true, value: { op: "present", instanceId: "exp-a" } });
    expect(command).toMatchObject({ ok: true, value: { op: "command", command: "set-value" } });
  });

  it("fails closed on extra fields and non-object payloads", () => {
    expect(parseViraExperienceMessage({
      version: "1",
      op: "present",
      instanceId: "exp-a",
      pack: { id: "vira/example", version: "1.0.0", entrypoint: "main" },
      payload: {},
      domain: "forbidden",
    }).ok).toBe(false);
    expect(parseViraExperienceMessage({
      version: "1",
      op: "command",
      instanceId: "exp-a",
      command: "set-value",
      args: [],
    }).ok).toBe(false);
  });
});
