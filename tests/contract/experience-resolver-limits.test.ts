import { describe, expect, it } from "vitest";
import {
  createExperienceResolver,
  EXPERIENCE_RESOLVER_MAX_INSTANCES,
} from "../../packages/experience-resolver/src/index.js";
import { parseExperienceRegistrySnapshot } from "../../packages/experience-registry/src/index.js";

const digest = `sha256:${"d".repeat(64)}`;

function canonicalRegistry() {
  const result = parseExperienceRegistrySnapshot(JSON.stringify({
    schemaVersion: "1",
    manifests: [{
      schemaVersion: "1",
      id: "alpha/catalog",
      version: "1.0.0",
      publisher: { id: "alpha", name: "Alpha" },
      metadata: { name: "Catalog", tags: [] },
      compatibility: { minViraVersion: "0.0.0" },
      entrypoints: ["main"],
      artifacts: [{
        id: "main",
        role: "studio-publication",
        mediaType: "application/json",
        digest,
        size: 64,
      }],
    }],
  }));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Registry fixture must be canonical");
  return result.value;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("MASTER-05 resolver resource bounds", () => {
  it("bounds mounted plus pending instances and restores capacity after exact release", async () => {
    const gate = deferred<{
      deploymentId: string;
      packId: string;
      packVersion: string;
      entrypoint: string;
    }>();
    const factory = createExperienceResolver({
      registry: canonicalRegistry(),
      hostManifest: {
        version: "1",
        id: "vira.host.web.reference",
        platform: "web",
        implementationIds: ["alpha.catalog.web.card.v1"],
        capabilities: [],
      },
      resolveExactDeployment: async () => gate.promise,
      resolvePublicationArtifact: async () => ({ arbitrary: true }),
      deriveHostRequirement: async () => ({
        version: "1",
        platform: "web",
        implementationIds: ["alpha.catalog.web.card.v1"],
        capabilities: [],
      }),
    });
    expect(factory.ok).toBe(true);
    if (!factory.ok) return;

    const pending = Array.from(
      { length: EXPERIENCE_RESOLVER_MAX_INSTANCES },
      (_, index) => factory.value.resolve({
        version: "1",
        instanceId: `instance-${index}`,
        deploymentId: "deployment-exact-001",
      }),
    );

    await expect(factory.value.resolve({
      version: "1",
      instanceId: "instance-overflow",
      deploymentId: "deployment-exact-001",
    })).resolves.toMatchObject({
      ok: false,
      issue: { code: "INSTANCE_LIMIT_EXCEEDED", path: "$.instanceId" },
    });

    gate.resolve({
      deploymentId: "deployment-exact-001",
      packId: "alpha/catalog",
      packVersion: "1.0.0",
      entrypoint: "main",
    });
    const resolved = await Promise.all(pending);
    expect(resolved.every((entry) => entry.ok)).toBe(true);

    expect(factory.value.release("instance-0")).toBe(true);
    await expect(factory.value.resolve({
      version: "1",
      instanceId: "instance-after-release",
      deploymentId: "deployment-exact-001",
    })).resolves.toMatchObject({ ok: true });
  });
});
