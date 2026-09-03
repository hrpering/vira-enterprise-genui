import { describe, expect, it } from "vitest";
import {
  createExperienceResolver,
  type ExperienceResolver,
  type ResolvedExperienceDescriptor,
} from "../../packages/experience-resolver/src/index.js";
import {
  parseExperienceRegistrySnapshot,
  type ExperienceRegistrySnapshot,
} from "../../packages/experience-registry/src/index.js";
import {
  createViraIOSMountEnvelope,
  prepareAuthoredStudioPublication,
} from "../../packages/genui/src/index.js";
import {
  defineViraBrand,
  type ViraBrandDefinition,
  type ViraBrandDefinitionInput,
} from "../../packages/studio-brand/src/index.js";

const brandId = "alpha.ios";
const componentRef = `${brandId}.component.card`;
const webImplementationId = `${brandId}.web.card.v1`;
const iosImplementationId = `${brandId}.ios.card.v1`;
const androidImplementationId = `${brandId}.android.card.v1`;
const recipeId = `${brandId}.recipe.browse`;
const capabilityHostId = "vira.host.ios.reference";
const digest = `sha256:${"a".repeat(64)}`;

function brandInput(): ViraBrandDefinitionInput {
  return {
    identity: {
      version: "1",
      id: brandId,
      displayName: "Alpha iOS",
      tokenRefs: {},
    },
    design: {
      palette: {
        $type: "color",
        primary: {
          $value: {
            colorSpace: "srgb",
            components: [17 / 255, 34 / 255, 51 / 255],
            hex: "#112233",
          },
        },
      },
      typography: {
        body: { $type: "fontFamily", $value: ["Inter", "Arial"] },
      },
    },
    components: {
      catalog: {
        version: "1",
        id: `${brandId}.components`,
        brandId,
        components: [{
          ref: componentRef,
          label: "Card",
          category: "content.card",
          kind: "content",
          props: [
            { key: "title", type: "string", required: true, bindable: true },
            { key: "count", type: "number", required: false, bindable: true },
          ],
          slots: [{ name: "content", label: "Content" }],
          events: [{
            name: "select",
            label: "Selected",
            payload: [{ key: "source", type: "string", required: false }],
          }],
        }],
      },
      implementations: [{
        component: componentRef,
        web: webImplementationId,
        ios: iosImplementationId,
        android: androidImplementationId,
      }],
    },
    actions: {
      version: "1",
      id: `${brandId}.actions`,
      mappings: [{ event: "item.select", actionType: `${brandId}.action.select` }],
    },
    dataSources: {
      version: "1",
      id: `${brandId}.data`,
      sources: [{ id: "catalog", kinds: ["state", "domain"] }],
    },
    policies: {
      version: "1",
      id: `${brandId}.policies`,
      mappings: [{
        recipe: recipeId,
        layoutPolicy: `${brandId}.policy.layout.default`,
        disclosurePolicy: `${brandId}.policy.disclosure.default`,
      }],
    },
    experiences: [{
      id: "browse",
      label: "Browse",
      description: "Synthetic native iOS experience.",
      document: {
        version: "1",
        id: `${brandId}.experience.browse`,
        recipeId,
        entryView: "main",
        views: [{
          id: "main",
          nodes: [{
            id: "root",
            component: componentRef,
            order: 0,
            props: { title: "Browse items" },
          }],
        }],
        bindings: [{
          viewId: "main",
          nodeId: "root",
          prop: "count",
          source: { kind: "state", path: "catalog.count" },
        }],
        interactions: [{
          viewId: "main",
          nodeId: "root",
          event: "select",
          actionEvent: "item.select",
          routes: [],
          payloadBindings: [{
            key: "source",
            source: { kind: "literal", value: "canonical" },
          }],
        }],
      },
    }],
  };
}

function brand(): ViraBrandDefinition {
  const result = defineViraBrand(brandInput());
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("brand fixture must be canonical");
  return result.value;
}

function publication(activeBrand: ViraBrandDefinition) {
  const result = prepareAuthoredStudioPublication({
    document: activeBrand.package.templates[0]!.document,
    componentCatalog: activeBrand.package.components,
    bindingSourceCatalog: activeBrand.package.dataSources,
    actionAdapter: activeBrand.package.actions,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("publication fixture must be canonical");
  return result.value;
}

function registry(): ExperienceRegistrySnapshot {
  const result = parseExperienceRegistrySnapshot(JSON.stringify({
    schemaVersion: "1",
    manifests: [{
      schemaVersion: "1",
      id: "alpha/ios-native",
      version: "1.0.0",
      publisher: { id: "alpha", name: "Synthetic Publisher" },
      metadata: { name: "Native iOS Pack", tags: ["synthetic", "ios"] },
      compatibility: { minViraVersion: "0.0.0" },
      entrypoints: ["main"],
      artifacts: [{
        id: "main",
        role: "studio-publication",
        mediaType: "application/json",
        digest,
        size: 512,
      }],
    }],
  }));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("registry fixture must be canonical");
  return result.value;
}

function hostManifest(implementationIds: readonly string[] = [iosImplementationId]) {
  return {
    version: "1",
    id: capabilityHostId,
    platform: "ios",
    implementationIds,
    capabilities: [{ version: "1", id: `${brandId}.capability.native` }],
  } as const;
}

function resolver(activeBrand: ViraBrandDefinition): ExperienceResolver {
  const activePublication = publication(activeBrand);
  const created = createExperienceResolver({
    registry: registry(),
    hostManifest: hostManifest(),
    resolveExactDeployment: async (deploymentId: string) => ({
      deploymentId,
      packId: "alpha/ios-native",
      packVersion: "1.0.0",
      entrypoint: "main",
    }),
    resolvePublicationArtifact: async () => activePublication,
    deriveHostRequirement: async () => ({
      version: "1",
      platform: "ios",
      implementationIds: [iosImplementationId],
      capabilities: [{ version: "1", id: `${brandId}.capability.native` }],
    }),
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("resolver fixture must be canonical");
  return created.value;
}

async function resolvedDescriptor(
  activeResolver: ExperienceResolver,
  instanceId = "instance-ios-001",
): Promise<ResolvedExperienceDescriptor> {
  const result = await activeResolver.resolve({
    version: "1",
    instanceId,
    deploymentId: "deployment-ios-exact",
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("resolved fixture must be available");
  return result.value;
}

function withForgedPublication(descriptor: ResolvedExperienceDescriptor): ResolvedExperienceDescriptor {
  return {
    ...descriptor,
    publication: {
      ...descriptor.publication,
      id: `${brandId}.publication.forged`,
    },
  };
}

describe("MASTER-07B canonical iOS mount envelope", () => {
  it("projects an exact resolved canonical publication into a declarative native-only envelope", async () => {
    const activeBrand = brand();
    const activeResolver = resolver(activeBrand);
    const descriptor = await resolvedDescriptor(activeResolver);

    const result = createViraIOSMountEnvelope({
      instanceId: descriptor.instanceId,
      descriptor,
      brand: activeBrand,
      hostManifest: hostManifest(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      version: "1",
      instanceId: "instance-ios-001",
      deploymentId: "deployment-ios-exact",
      pack: { id: "alpha/ios-native", version: "1.0.0", entrypoint: "main" },
      artifact: { id: "main", role: "studio-publication", mediaType: "application/json", digest },
      compatibility: { hostId: capabilityHostId, platform: "ios" },
      host: {
        version: "1",
        id: capabilityHostId,
        platform: "ios",
        implementationIds: [iosImplementationId],
      },
      brand: {
        version: "1",
        id: brandId,
        actions: [{ event: "item.select", actionType: `${brandId}.action.select` }],
        components: [{
          ref: componentRef,
          implementationId: iosImplementationId,
          slots: ["content"],
          events: [{ name: "select", payload: [{ key: "source", type: "string", required: false }] }],
        }],
      },
      document: {
        version: "1",
        id: `${brandId}.experience.browse`,
        recipeId,
        entryView: "main",
      },
    });
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.brand.components)).toBe(true);
    expect(JSON.stringify(result.value)).not.toContain("https://");
    expect(JSON.stringify(result.value)).not.toContain("apiKey");
    expect(JSON.stringify(result.value)).not.toContain("renderer");
  });

  it("rejects forged publication snapshots before they can cross the native boundary", async () => {
    const activeBrand = brand();
    const activeResolver = resolver(activeBrand);
    const descriptor = await resolvedDescriptor(activeResolver);

    expect(createViraIOSMountEnvelope({
      instanceId: descriptor.instanceId,
      descriptor: withForgedPublication(descriptor),
      brand: activeBrand,
      hostManifest: hostManifest(),
    })).toMatchObject({
      ok: false,
      issue: {
        stage: "publication",
        code: "FORGED_PUBLICATION",
        path: "$.descriptor.publication",
      },
    });
  });

  it("requires exact instance and exact iOS Host Capability identity", async () => {
    const activeBrand = brand();
    const activeResolver = resolver(activeBrand);
    const descriptor = await resolvedDescriptor(activeResolver);

    expect(createViraIOSMountEnvelope({
      instanceId: "instance-ios-other",
      descriptor,
      brand: activeBrand,
      hostManifest: hostManifest(),
    })).toMatchObject({
      ok: false,
      issue: { stage: "descriptor", code: "INSTANCE_MISMATCH", path: "$.descriptor.instanceId" },
    });

    expect(createViraIOSMountEnvelope({
      instanceId: descriptor.instanceId,
      descriptor,
      brand: activeBrand,
      hostManifest: { ...hostManifest(), id: "vira.host.ios.other" },
    })).toMatchObject({
      ok: false,
      issue: { stage: "descriptor", code: "HOST_MISMATCH", path: "$.descriptor.compatibility" },
    });

    expect(createViraIOSMountEnvelope({
      instanceId: descriptor.instanceId,
      descriptor,
      brand: activeBrand,
      hostManifest: { ...hostManifest(), platform: "web" },
    })).toMatchObject({
      ok: false,
      issue: { stage: "host", code: "NON_IOS_HOST", path: "$.hostManifest.platform" },
    });
  });

  it("fails closed when the Brand requires an iOS implementation the Host does not actually support", async () => {
    const activeBrand = brand();
    const activeResolver = resolver(activeBrand);
    const descriptor = await resolvedDescriptor(activeResolver);

    expect(createViraIOSMountEnvelope({
      instanceId: descriptor.instanceId,
      descriptor,
      brand: activeBrand,
      hostManifest: hostManifest([`${brandId}.ios.other.v1`]),
    })).toMatchObject({
      ok: false,
      issue: {
        stage: "brand",
        code: "UNSUPPORTED_IMPLEMENTATION",
        path: "$.brand.implementations",
      },
    });
  });

  it("rejects hostile nested Brand data before native projection", async () => {
    const activeBrand = brand();
    const activeResolver = resolver(activeBrand);
    const descriptor = await resolvedDescriptor(activeResolver);
    const hostileDesign = {} as Record<string, unknown>;
    Object.defineProperty(hostileDesign, "remoteCode", {
      enumerable: true,
      get() {
        throw new Error("NESTED_BRAND_SECRET");
      },
    });

    const result = createViraIOSMountEnvelope({
      instanceId: descriptor.instanceId,
      descriptor,
      brand: { ...activeBrand, design: hostileDesign } as never,
      hostManifest: hostManifest(),
    });
    expect(result).toMatchObject({
      ok: false,
      issue: { stage: "brand", code: "INVALID_BRAND", path: "$.brand" },
    });
    expect(JSON.stringify(result)).not.toContain("NESTED_BRAND_SECRET");
  });

  it("normalizes hostile envelope inputs without reflecting thrown content", () => {
    const hostile = new Proxy({}, {
      getPrototypeOf() {
        throw new Error("NATIVE_ENVELOPE_SECRET");
      },
    });

    const result = createViraIOSMountEnvelope(hostile as never);
    expect(result).toMatchObject({
      ok: false,
      issue: { stage: "input", code: "INVALID_INPUT", path: "$" },
    });
    expect(JSON.stringify(result)).not.toContain("NATIVE_ENVELOPE_SECRET");
  });
});
