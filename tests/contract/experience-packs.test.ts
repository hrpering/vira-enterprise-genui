import { describe, expect, it } from "vitest";
import {
  parseExperiencePackManifest,
  serializeExperiencePackManifest,
} from "../../packages/experience-packs/src/index.js";

const digest = `sha256:${"a".repeat(64)}`;

function manifest() {
  return {
    schemaVersion: "1",
    id: "vira/flight-booking",
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    metadata: {
      name: "Flight Booking",
      description: "A packaged flight-booking experience.",
      tags: ["travel", "booking"],
    },
    compatibility: { minViraVersion: "0.0.0", maxViraVersion: "2.0.0" },
    entrypoints: ["main"],
    artifacts: [{
      id: "main",
      role: "experience",
      mediaType: "application/vnd.vira.studio-publication.v1+json",
      digest,
      size: 1234,
    }],
  };
}

describe("Experience Pack v1 contract", () => {
  it("parses into a detached deeply frozen canonical manifest", () => {
    const input = manifest();
    const result = parseExperiencePackManifest(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).not.toBe(input);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.publisher)).toBe(true);
    expect(Object.isFrozen(result.value.metadata.tags)).toBe(true);
    expect(Object.isFrozen(result.value.artifacts[0])).toBe(true);
  });

  it("rejects unknown fields fail-closed, including secret-like additions", () => {
    expect(parseExperiencePackManifest({ ...manifest(), apiKey: "must-not-be-accepted" })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.apiKey" },
    });

    const input = manifest();
    input.artifacts[0] = { ...input.artifacts[0], path: "../../payload" } as typeof input.artifacts[0];
    expect(parseExperiencePackManifest(input)).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.artifacts[0].path" },
    });
  });

  it("requires publisher namespace parity", () => {
    expect(parseExperiencePackManifest({
      ...manifest(),
      publisher: { id: "other", name: "Other" },
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PUBLISHER", path: "$.publisher.id" },
    });
  });

  it("rejects duplicate artifact ids", () => {
    const input = manifest();
    input.artifacts.push({ ...input.artifacts[0] });
    expect(parseExperiencePackManifest(input)).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_ARTIFACT", path: "$.artifacts[1].id" },
    });
  });

  it("rejects active or executable media types", () => {
    const input = manifest();
    input.artifacts[0] = { ...input.artifacts[0], mediaType: "text/html" };
    expect(parseExperiencePackManifest(input)).toMatchObject({
      ok: false,
      issue: { code: "UNSAFE_MEDIA_TYPE", path: "$.artifacts[0].mediaType" },
    });
  });

  it("requires lowercase sha256 digests and bounded integer sizes", () => {
    const invalidDigest = manifest();
    invalidDigest.artifacts[0] = { ...invalidDigest.artifacts[0], digest: "sha256:not-a-digest" };
    expect(parseExperiencePackManifest(invalidDigest)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ARTIFACT", path: "$.artifacts[0].digest" },
    });

    const invalidSize = manifest();
    invalidSize.artifacts[0] = { ...invalidSize.artifacts[0], size: 1.5 };
    expect(parseExperiencePackManifest(invalidSize)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ARTIFACT", path: "$.artifacts[0].size" },
    });
  });

  it("requires entrypoints to reference experience artifacts", () => {
    const input = manifest();
    input.artifacts[0] = {
      ...input.artifacts[0],
      role: "design",
      mediaType: "application/vnd.vira.design-bundle.v1+json",
    };
    expect(parseExperiencePackManifest(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ENTRYPOINT", path: "$.entrypoints[0]" },
    });
  });

  it("rejects inverted compatibility ranges", () => {
    expect(parseExperiencePackManifest({
      ...manifest(),
      compatibility: { minViraVersion: "2.0.0", maxViraVersion: "1.9.9" },
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_COMPATIBILITY", path: "$.compatibility.maxViraVersion" },
    });
  });

  it("serializes deterministically regardless of input object key order", () => {
    const first = serializeExperiencePackManifest(manifest());
    const original = manifest();
    const reordered = {
      artifacts: original.artifacts,
      entrypoints: original.entrypoints,
      compatibility: original.compatibility,
      metadata: {
        tags: original.metadata.tags,
        description: original.metadata.description,
        name: original.metadata.name,
      },
      publisher: { name: original.publisher.name, id: original.publisher.id },
      version: original.version,
      id: original.id,
      schemaVersion: original.schemaVersion,
    };
    const second = serializeExperiencePackManifest(reordered);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value).toBe(second.value);
  });
});
