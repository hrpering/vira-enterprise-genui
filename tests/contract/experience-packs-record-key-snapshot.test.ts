import { describe, expect, it } from "vitest";
import { parseExperiencePackManifest } from "../../packages/experience-packs/src/index.js";

const digest = `sha256:${"f".repeat(64)}`;

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

describe("Experience Pack record key snapshot", () => {
  it("takes one own-key snapshot for record validation", () => {
    const input = manifest();
    const symbol = Symbol("secret");
    Object.defineProperty(input.publisher, symbol, {
      configurable: true,
      value: "must-not-copy",
    });

    let ownKeyReads = 0;
    input.publisher = new Proxy(input.publisher, {
      ownKeys(target) {
        ownKeyReads += 1;
        return Reflect.ownKeys(target);
      },
    });

    const result = parseExperiencePackManifest(input);
    expect(ownKeyReads).toBe(1);
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PUBLISHER", path: "$.publisher" },
    });
  });
});
