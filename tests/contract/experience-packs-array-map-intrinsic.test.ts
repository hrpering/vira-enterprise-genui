import { describe, expect, it } from "vitest";
import {
  parseExperiencePackManifest,
  serializeExperiencePackManifest,
} from "../../packages/experience-packs/src/index.js";

const digest = `sha256:${"c".repeat(64)}`;

function manifest() {
  return {
    schemaVersion: "1",
    id: "vira/flight-booking",
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    metadata: { name: "Flight Booking", tags: ["travel"] },
    compatibility: { minViraVersion: "0.0.0" },
    entrypoints: ["main"],
    artifacts: [{
      id: "main",
      role: "studio-publication",
      mediaType: "application/json",
      digest,
      size: 1,
    }],
  };
}

describe("Experience Pack canonicalization intrinsic hardening", () => {
  it("does not dispatch through a post-initialization Array.prototype.map replacement", () => {
    const parsed = parseExperiencePackManifest(manifest());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("fixture must parse");

    const previous = Object.getOwnPropertyDescriptor(Array.prototype, "map");
    let calls = 0;
    let result: ReturnType<typeof serializeExperiencePackManifest>;

    try {
      Object.defineProperty(Array.prototype, "map", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient Array.prototype.map must not execute");
        },
      });
      result = serializeExperiencePackManifest(parsed.value);
    } finally {
      if (previous) Object.defineProperty(Array.prototype, "map", previous);
      else Reflect.deleteProperty(Array.prototype, "map");
    }

    expect(calls).toBe(0);
    expect(result).toMatchObject({ ok: true });
  });
});
