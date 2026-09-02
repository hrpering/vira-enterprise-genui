import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createExperienceResolver,
  type ExperienceResolverConfiguration,
} from "../../packages/experience-resolver/src/index.js";
import {
  parseExperienceRegistrySnapshot,
  type ExperienceRegistrySnapshot,
} from "../../packages/experience-registry/src/index.js";
import type { StudioHostPlatform } from "../../packages/studio-host/src/index.js";

const digest = `sha256:${"c".repeat(64)}`;

function packManifest(id = "alpha/catalog", version = "1.2.3", entrypoint = "main") {
  return {
    schemaVersion: "1",
    id,
    version,
    publisher: { id: id.split("/")[0], name: "Synthetic Publisher" },
    metadata: { name: "Synthetic Catalog", tags: ["synthetic"] },
    compatibility: { minViraVersion: "0.0.0" },
    entrypoints: [entrypoint],
    artifacts: [{
      id: entrypoint,
      role: "studio-publication",
      mediaType: "application/json",
      digest,
      size: 256,
    }],
  };
}

function registry(manifests: readonly unknown[] = [packManifest()]): ExperienceRegistrySnapshot {
  const result = parseExperienceRegistrySnapshot(JSON.stringify({ schemaVersion: "1", manifests }));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("fixture Registry must be canonical");
  return result.value;
}

function hostManifest(platform: StudioHostPlatform = "web") {
  return {
    version: "1",
    id: `vira.host.${platform}.reference`,
    platform,
    implementationIds: [`alpha.catalog.${platform}.card.v1`],
    capabilities: [{ version: "1", id: "vira.capability.forms" }],
  } as const;
}

function deploymentTarget(overrides: Partial<{
  deploymentId: string;
  packId: string;
  packVersion: string;
  entrypoint: string;
}> = {}) {
  return {
    deploymentId: "deployment-exact-001",
    packId: "alpha/catalog",
    packVersion: "1.2.3",
    entrypoint: "main",
    ...overrides,
  };
}

function requirement(platform: StudioHostPlatform = "web") {
  return {
    version: "1",
    platform,
    implementationIds: [`alpha.catalog.${platform}.card.v1`],
    capabilities: [{ version: "1", id: "vira.capability.forms" }],
  } as const;
}

function request(instanceId = "instance-exact-001", deploymentId = "deployment-exact-001") {
  return { version: "1", instanceId, deploymentId } as const;
}

function publication() {
  return {
    version: "not-a-studio-publication-version",
    arbitrary: { nested: [1, 2, 3] },
  };
}

function createResolver({
  platform = "web",
  registrySnapshot = registry(),
  resolveExactDeployment = vi.fn(async () => deploymentTarget()),
  resolvePublicationArtifact = vi.fn(async () => publication()),
  deriveHostRequirement = vi.fn(async () => requirement(platform)),
}: {
  platform?: StudioHostPlatform;
  registrySnapshot?: ExperienceRegistrySnapshot;
  resolveExactDeployment?: ExperienceResolverConfiguration["resolveExactDeployment"];
  resolvePublicationArtifact?: ExperienceResolverConfiguration["resolvePublicationArtifact"];
  deriveHostRequirement?: ExperienceResolverConfiguration["deriveHostRequirement"];
} = {}) {
  const result = createExperienceResolver({
    registry: registrySnapshot,
    hostManifest: hostManifest(platform),
    resolveExactDeployment,
    resolvePublicationArtifact,
    deriveHostRequirement,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("resolver fixture must be valid");
  return result.value;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("MASTER-05 exact Experience resolver", () => {
  it("resolves exact deployment, Pack, artifact digest, host compatibility, and immutable instance metadata", async () => {
    const resolvePublicationArtifact = vi.fn(async () => publication());
    const deriveHostRequirement = vi.fn(async () => requirement("web"));
    const resolver = createResolver({ resolvePublicationArtifact, deriveHostRequirement });

    const result = await resolver.resolve(request());
    expect(result).toMatchObject({
      ok: true,
      value: {
        instanceId: "instance-exact-001",
        deploymentId: "deployment-exact-001",
        pack: { id: "alpha/catalog", version: "1.2.3", entrypoint: "main" },
        artifact: {
          id: "main",
          role: "studio-publication",
          mediaType: "application/json",
          digest,
        },
        compatibility: { hostId: "vira.host.web.reference", platform: "web" },
      },
    });
    if (!result.ok) return;

    expect(resolvePublicationArtifact).toHaveBeenCalledWith({
      deploymentId: "deployment-exact-001",
      packId: "alpha/catalog",
      packVersion: "1.2.3",
      artifactId: "main",
      role: "studio-publication",
      mediaType: "application/json",
      digest,
    });
    expect(deriveHostRequirement).toHaveBeenCalledWith(expect.objectContaining({
      deploymentId: "deployment-exact-001",
      host: { hostId: "vira.host.web.reference", platform: "web" },
    }));
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.pack)).toBe(true);
    expect(Object.isFrozen(result.value.artifact)).toBe(true);
    expect(Object.isFrozen(result.value.publication)).toBe(true);
    expect(Object.isFrozen(result.value.publication.arbitrary)).toBe(true);
    expect(resolver.get("instance-exact-001")).toBe(result.value);
  });

  it("uses the same resolver contract for web, iOS, and Android", async () => {
    for (const platform of ["web", "ios", "android"] as const) {
      const resolver = createResolver({ platform });
      const result = await resolver.resolve(request(`instance-${platform}`));
      expect(result, platform).toMatchObject({
        ok: true,
        value: { compatibility: { platform, hostId: `vira.host.${platform}.reference` } },
      });
    }
  });

  it("snapshots publication as canonical JSON without duplicating Studio semantic compilation", async () => {
    const resolver = createResolver({
      resolvePublicationArtifact: vi.fn(async () => ({
        version: "definitely-not-canonical-studio-version",
        nonsense: { value: true },
      })),
    });
    await expect(resolver.resolve(request())).resolves.toMatchObject({
      ok: true,
      value: {
        publication: {
          version: "definitely-not-canonical-studio-version",
          nonsense: { value: true },
        },
      },
    });
  });

  it("fails closed when the deployment port returns a different or malformed exact target", async () => {
    const mismatch = createResolver({
      resolveExactDeployment: vi.fn(async () => deploymentTarget({ deploymentId: "deployment-other" })),
    });
    await expect(mismatch.resolve(request())).resolves.toMatchObject({
      ok: false,
      issue: { code: "DEPLOYMENT_ID_MISMATCH", path: "$.deployment.deploymentId" },
    });

    const malformed = createResolver({
      resolveExactDeployment: vi.fn(async () => ({ ...deploymentTarget(), latest: true })),
    });
    await expect(malformed.resolve(request())).resolves.toMatchObject({
      ok: false,
      issue: { code: "INVALID_DEPLOYMENT_TARGET", path: "$.deployment.latest" },
    });
  });

  it("requires exact Pack version and entrypoint with no nearest/latest selection", async () => {
    const wrongVersion = createResolver({
      registrySnapshot: registry([
        packManifest("alpha/catalog", "1.2.3"),
        packManifest("alpha/catalog", "2.0.0"),
      ]),
      resolveExactDeployment: vi.fn(async () => deploymentTarget({ packVersion: "1.2.2" })),
    });
    await expect(wrongVersion.resolve(request())).resolves.toMatchObject({
      ok: false,
      issue: { code: "PACK_NOT_FOUND" },
    });

    const unknownEntrypoint = createResolver({
      resolveExactDeployment: vi.fn(async () => deploymentTarget({ entrypoint: "unknown" })),
    });
    await expect(unknownEntrypoint.resolve(request())).resolves.toMatchObject({
      ok: false,
      issue: { code: "ENTRYPOINT_NOT_FOUND", path: "$.deployment.entrypoint" },
    });
  });

  it("requires a canonical Registry instead of re-validating Pack artifact semantics", () => {
    const invalidRegistry = {
      schemaVersion: "1",
      manifests: [{
        ...packManifest(),
        entrypoints: ["asset"],
        artifacts: [{
          id: "asset",
          role: "asset",
          mediaType: "image/png",
          digest,
          size: 20,
        }],
      }],
    };
    expect(createExperienceResolver({
      registry: invalidRegistry,
      hostManifest: hostManifest(),
      resolveExactDeployment: async () => deploymentTarget(),
      resolvePublicationArtifact: async () => publication(),
      deriveHostRequirement: async () => requirement(),
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_REGISTRY", path: "$.registry" },
    });
  });

  it("types trusted port failures and rejects executable/non-object publication artifacts", async () => {
    const deploymentFailure = createResolver({
      resolveExactDeployment: vi.fn(async () => { throw new Error("secret deployment failure"); }),
    });
    await expect(deploymentFailure.resolve(request())).resolves.toMatchObject({
      ok: false,
      issue: { code: "DEPLOYMENT_RESOLUTION_FAILED" },
    });

    const artifactFailure = createResolver({
      resolvePublicationArtifact: vi.fn(async () => { throw new Error("secret artifact failure"); }),
    });
    await expect(artifactFailure.resolve(request())).resolves.toMatchObject({
      ok: false,
      issue: { code: "ARTIFACT_RESOLUTION_FAILED" },
    });

    const executableArtifact = createResolver({
      resolvePublicationArtifact: vi.fn(async () => ({ render: () => undefined })),
    });
    await expect(executableArtifact.resolve(request())).resolves.toMatchObject({
      ok: false,
      issue: { code: "INVALID_PUBLICATION_ARTIFACT" },
    });
  });

  it("distinguishes malformed host requirements from valid incompatibility and never invents fallback", async () => {
    const malformed = createResolver({
      deriveHostRequirement: vi.fn(async () => ({ ...requirement(), fallback: "invented" })),
    });
    await expect(malformed.resolve(request())).resolves.toMatchObject({
      ok: false,
      issue: { code: "INVALID_HOST_REQUIREMENT" },
    });

    const unsupported = createResolver({
      deriveHostRequirement: vi.fn(async () => ({
        ...requirement(),
        implementationIds: ["alpha.catalog.web.missing.v1"],
      })),
    });
    const result = await unsupported.resolve(request());
    expect(result).toMatchObject({
      ok: false,
      issue: {
        code: "HOST_INCOMPATIBLE",
        mismatches: [{ code: "MISSING_IMPLEMENTATION" }],
      },
    });
    expect(JSON.stringify(result)).not.toContain("fallback");
  });

  it("rejects duplicate mounted instance IDs until exact release", async () => {
    const resolver = createResolver();
    expect((await resolver.resolve(request())).ok).toBe(true);
    await expect(resolver.resolve(request())).resolves.toMatchObject({
      ok: false,
      issue: { code: "INSTANCE_ALREADY_RESERVED" },
    });
    expect(resolver.release("instance-other")).toBe(false);
    expect(resolver.get("instance-exact-001")).toBeDefined();
    expect(resolver.release("instance-exact-001")).toBe(true);
    expect(resolver.get("instance-exact-001")).toBeUndefined();
    expect((await resolver.resolve(request())).ok).toBe(true);
  });

  it("reserves pending instance IDs before awaiting trusted resolution", async () => {
    const gate = deferred<ReturnType<typeof deploymentTarget>>();
    const resolveExactDeployment = vi.fn(async () => gate.promise);
    const resolver = createResolver({ resolveExactDeployment });

    const first = resolver.resolve(request("instance-pending"));
    await Promise.resolve();
    await expect(resolver.resolve(request("instance-pending"))).resolves.toMatchObject({
      ok: false,
      issue: { code: "INSTANCE_ALREADY_RESERVED" },
    });
    expect(resolveExactDeployment).toHaveBeenCalledTimes(1);

    gate.resolve(deploymentTarget());
    await expect(first).resolves.toMatchObject({ ok: true });
  });

  it("releases pending reservation after failure so the exact instance can retry", async () => {
    let attempts = 0;
    const resolver = createResolver({
      resolveExactDeployment: vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("first failure");
        return deploymentTarget();
      }),
    });
    await expect(resolver.resolve(request("instance-retry"))).resolves.toMatchObject({
      ok: false,
      issue: { code: "DEPLOYMENT_RESOLUTION_FAILED" },
    });
    await expect(resolver.resolve(request("instance-retry"))).resolves.toMatchObject({ ok: true });
  });

  it("uses Map isolation for prototype-looking instance identities", async () => {
    const resolver = createResolver();
    for (const instanceId of ["__proto__", "constructor", "toString"]) {
      const result = await resolver.resolve(request(instanceId));
      expect(result, instanceId).toMatchObject({ ok: true, value: { instanceId } });
      expect(resolver.get(instanceId)).toMatchObject({ instanceId });
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("dispose clears local metadata, blocks future work, and prevents pending results from mounting", async () => {
    const gate = deferred<ReturnType<typeof deploymentTarget>>();
    const resolver = createResolver({ resolveExactDeployment: vi.fn(async () => gate.promise) });
    const pending = resolver.resolve(request("instance-dispose-pending"));
    await Promise.resolve();
    resolver.dispose();
    gate.resolve(deploymentTarget());

    await expect(pending).resolves.toMatchObject({
      ok: false,
      issue: { code: "RESOLVER_DISPOSED" },
    });
    expect(resolver.get("instance-dispose-pending")).toBeUndefined();
    await expect(resolver.resolve(request("after-dispose"))).resolves.toMatchObject({
      ok: false,
      issue: { code: "RESOLVER_DISPOSED" },
    });
  });

  it("fails closed on unknown request backend, credential, fallback, and executable fields", async () => {
    const resolver = createResolver();
    for (const extra of [
      { latest: true },
      { active: true },
      { endpoint: "https://customer.example" },
      { apiKey: "secret" },
      { fallback: "deployment-old" },
      { execute: "some.command" },
    ]) {
      await expect(resolver.resolve({ ...request(), ...extra })).resolves.toMatchObject({
        ok: false,
        issue: { code: "INVALID_REQUEST" },
      });
    }
  });

  it("rejects invalid host/Registry configuration and accessors without evaluating getters", () => {
    expect(createExperienceResolver({})).toMatchObject({
      ok: false,
      issue: { code: "INVALID_REGISTRY" },
    });
    expect(createExperienceResolver({
      registry: registry(),
      hostManifest: { ...hostManifest(), endpoint: "https://customer.example" },
      resolveExactDeployment: async () => deploymentTarget(),
      resolvePublicationArtifact: async () => publication(),
      deriveHostRequirement: async () => requirement(),
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_HOST_MANIFEST" },
    });
    expect(createExperienceResolver({
      registry: registry(),
      hostManifest: hostManifest(),
      resolveExactDeployment: async () => deploymentTarget(),
      resolvePublicationArtifact: async () => publication(),
      deriveHostRequirement: async () => requirement(),
      endpoint: "https://customer.example",
    })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_CONFIGURATION_FIELD", path: "$.endpoint" },
    });

    let calls = 0;
    const configuration: Record<string, unknown> = {
      registry: registry(),
      hostManifest: hostManifest(),
      resolvePublicationArtifact: async () => publication(),
      deriveHostRequirement: async () => requirement(),
    };
    Object.defineProperty(configuration, "resolveExactDeployment", {
      enumerable: true,
      get() {
        calls += 1;
        return async () => deploymentTarget();
      },
    });
    expect(createExperienceResolver(configuration)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CONFIGURATION", path: "$.resolveExactDeployment" },
    });
    expect(calls).toBe(0);
  });

  it("keeps resolver source domain-neutral and free of runtime/web execution imports", () => {
    const source = readFileSync(
      new URL("../../packages/experience-resolver/src/resolver.ts", import.meta.url),
      "utf8",
    );
    for (const forbidden of [
      "Pegasus",
      "Flight",
      "Airline",
      "Recipe",
      "@vira-enterprise-genui/genui",
      "@vira-enterprise-genui/runtime-web",
      "@vira-enterprise-genui/studio-runtime",
      "react",
      "renderers",
      "prepare()",
      "commandAdapter",
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });
});
