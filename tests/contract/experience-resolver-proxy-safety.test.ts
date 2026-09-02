import { describe, expect, it } from "vitest";
import { createExperienceResolver } from "../../packages/experience-resolver/src/index.js";
import { parseExperienceRegistrySnapshot } from "../../packages/experience-registry/src/index.js";

const digest = `sha256:${"e".repeat(64)}`;

function registry() {
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

function hostManifest() {
  return {
    version: "1",
    id: "vira.host.web.reference",
    platform: "web",
    implementationIds: ["alpha.catalog.web.card.v1"],
    capabilities: [],
  } as const;
}

function deployment() {
  return {
    deploymentId: "deployment-exact-001",
    packId: "alpha/catalog",
    packVersion: "1.0.0",
    entrypoint: "main",
  };
}

function requirement() {
  return {
    version: "1",
    platform: "web",
    implementationIds: ["alpha.catalog.web.card.v1"],
    capabilities: [],
  } as const;
}

function request() {
  return {
    version: "1",
    instanceId: "instance-exact-001",
    deploymentId: "deployment-exact-001",
  } as const;
}

function revokedProxy(): object {
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();
  return revocable.proxy;
}

function throwingProxy(secret = "reflection-secret"): object {
  return new Proxy({}, {
    getPrototypeOf() {
      throw new Error(secret);
    },
    ownKeys() {
      throw new Error(secret);
    },
    getOwnPropertyDescriptor() {
      throw new Error(secret);
    },
  });
}

function validConfiguration(overrides: Record<string, unknown> = {}) {
  return {
    registry: registry(),
    hostManifest: hostManifest(),
    resolveExactDeployment: async () => deployment(),
    resolvePublicationArtifact: async () => ({ arbitrary: true }),
    deriveHostRequirement: async () => requirement(),
    ...overrides,
  };
}

describe("MASTER-05 resolver reflective boundary safety", () => {
  it("normalizes revoked and throwing configuration proxies without throwing", () => {
    for (const input of [revokedProxy(), throwingProxy()]) {
      let result: ReturnType<typeof createExperienceResolver> | undefined;
      expect(() => {
        result = createExperienceResolver(input);
      }).not.toThrow();
      expect(result).toMatchObject({
        ok: false,
        issue: { code: "INVALID_CONFIGURATION", path: "$" },
      });
      expect(JSON.stringify(result)).not.toContain("reflection-secret");
    }
  });

  it("normalizes hostile Host Manifest reflection traps at the factory boundary", () => {
    for (const hostManifestInput of [revokedProxy(), throwingProxy("host-secret")]) {
      const result = createExperienceResolver(validConfiguration({ hostManifest: hostManifestInput }));
      expect(result).toMatchObject({
        ok: false,
        issue: { code: "INVALID_HOST_MANIFEST", path: "$.hostManifest" },
      });
      expect(JSON.stringify(result)).not.toContain("host-secret");
    }
  });

  it("normalizes hostile request reflection traps to INVALID_REQUEST", async () => {
    const factory = createExperienceResolver(validConfiguration());
    expect(factory.ok).toBe(true);
    if (!factory.ok) return;

    for (const input of [revokedProxy(), throwingProxy("request-secret")]) {
      await expect(factory.value.resolve(input)).resolves.toMatchObject({
        ok: false,
        issue: { code: "INVALID_REQUEST", path: "$" },
      });
      const result = await factory.value.resolve(input);
      expect(JSON.stringify(result)).not.toContain("request-secret");
    }
  });

  it("normalizes hostile exact deployment targets to INVALID_DEPLOYMENT_TARGET", async () => {
    for (const deploymentTarget of [revokedProxy(), throwingProxy("deployment-secret")]) {
      const factory = createExperienceResolver(validConfiguration({
        resolveExactDeployment: async () => deploymentTarget,
      }));
      expect(factory.ok).toBe(true);
      if (!factory.ok) continue;
      const result = await factory.value.resolve(request());
      expect(result).toMatchObject({
        ok: false,
        issue: { code: "INVALID_DEPLOYMENT_TARGET", path: "$.deployment" },
      });
      expect(JSON.stringify(result)).not.toContain("deployment-secret");
    }
  });

  it("normalizes hostile publication payloads to INVALID_PUBLICATION_ARTIFACT", async () => {
    for (const publication of [revokedProxy(), throwingProxy("publication-secret")]) {
      const factory = createExperienceResolver(validConfiguration({
        resolvePublicationArtifact: async () => publication,
      }));
      expect(factory.ok).toBe(true);
      if (!factory.ok) continue;
      const result = await factory.value.resolve(request());
      expect(result).toMatchObject({
        ok: false,
        issue: { code: "INVALID_PUBLICATION_ARTIFACT", path: "$.publication" },
      });
      expect(JSON.stringify(result)).not.toContain("publication-secret");
    }
  });

  it("normalizes hostile Host requirements to INVALID_HOST_REQUIREMENT", async () => {
    for (const hostRequirement of [revokedProxy(), throwingProxy("requirement-secret")]) {
      const factory = createExperienceResolver(validConfiguration({
        deriveHostRequirement: async () => hostRequirement,
      }));
      expect(factory.ok).toBe(true);
      if (!factory.ok) continue;
      const result = await factory.value.resolve(request());
      expect(result).toMatchObject({
        ok: false,
        issue: { code: "INVALID_HOST_REQUIREMENT", path: "$.compatibility" },
      });
      expect(JSON.stringify(result)).not.toContain("requirement-secret");
    }
  });
});
