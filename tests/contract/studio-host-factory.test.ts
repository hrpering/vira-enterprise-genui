import { describe, expect, it } from "vitest";
import {
  defineStudioHost,
  defineStudioHostSnapshot,
} from "../../packages/studio-host/src/index.js";
import type { StudioHostDefinition } from "../../packages/studio-host/src/index.js";

function definition(): StudioHostDefinition {
  const snapshot = defineStudioHostSnapshot({ revision: 1, state: {}, domain: {} });
  if (!snapshot.ok) throw new Error(snapshot.issue.message);
  return {
    id: "customer.experience.host",
    snapshot: () => snapshot.value,
    dispatch: async () => ({ outcome: "success" }),
    subscribe: () => () => undefined,
  };
}

describe("Studio host SDK factories", () => {
  it("adds protocol versions while delegating to canonical host validators", () => {
    expect(defineStudioHostSnapshot({ revision: 7, state: { step: "search" }, domain: {} })).toMatchObject({
      ok: true,
      value: { version: "1", revision: 7 },
    });
    expect(defineStudioHost(definition())).toMatchObject({
      ok: true,
      value: { version: "1", id: "customer.experience.host" },
    });
  });

  it("preserves unknown fields so canonical validation remains fail-closed", () => {
    const input = { ...definition(), backendUrl: "https://forbidden.example" } as StudioHostDefinition;
    expect(defineStudioHost(input)).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.backendUrl" },
    });
  });
});
