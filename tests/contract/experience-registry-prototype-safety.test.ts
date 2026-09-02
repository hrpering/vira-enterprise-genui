import { describe, expect, it } from "vitest";
import { parseExperienceRegistrySnapshot } from "../../packages/experience-registry/src/index.js";

const digest = `sha256:${"d".repeat(64)}`;

function manifestWithoutSchemaVersion() {
  return {
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
      size: 1234,
    }],
  };
}

describe("Experience Registry prototype isolation", () => {
  it("does not let inherited Object.prototype accessors satisfy or observe missing Pack fields", () => {
    const input = JSON.stringify({
      schemaVersion: "1",
      manifests: [manifestWithoutSchemaVersion()],
    });
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, "schemaVersion");
    let reads = 0;

    Object.defineProperty(Object.prototype, "schemaVersion", {
      configurable: true,
      get() {
        reads += 1;
        return "1";
      },
    });

    try {
      expect(parseExperienceRegistrySnapshot(input)).toMatchObject({
        ok: false,
        issue: { code: "INVALID_MANIFEST", path: "$.manifests[0]" },
      });
      expect(reads).toBe(0);
    } finally {
      if (previous) {
        Object.defineProperty(Object.prototype, "schemaVersion", previous);
      } else {
        delete (Object.prototype as Record<string, unknown>)["schemaVersion"];
      }
    }
  });
});
