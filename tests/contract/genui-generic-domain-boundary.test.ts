import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const genericSources = [
  "packages/genui-resolver/src/message.ts",
  "packages/genui-resolver/src/capabilities.ts",
  "packages/genui-resolver/src/resolver.ts",
  "packages/genui-resolver/src/index.ts",
  "packages/genui-chat/src/bridge.ts",
  "packages/genui-chat/src/react.tsx",
  "packages/genui-chat/src/index.ts",
];

describe("generic GenUI domain boundary", () => {
  it("contains no airline, flight, recipe, or experience discriminator switches", () => {
    const source = genericSources.map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n").toLowerCase();
    expect(source).not.toContain("airline");
    expect(source).not.toContain("flight");
    expect(source).not.toContain("recipe");
    expect(source).not.toContain("travel.flight.search");
  });
});
