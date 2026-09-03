import { describe, expect, it } from "vitest";
import {
  createExperienceResolver,
  type ExperienceResolver,
} from "../../packages/experience-resolver/src/index.js";
import {
  parseExperienceRegistrySnapshot,
  type ExperienceRegistrySnapshot,
} from "../../packages/experience-registry/src/index.js";
import {
  createViraWebHost,
  prepareAuthoredStudioPublication,
  type ViraWebLifecycleSource,
} from "../../packages/genui/src/index.js";
import { createRuntimeState } from "../../packages/runtime-core/src/index.js";
import {
  defineViraBrand,
  type ViraBrandDefinition,
  type ViraBrandDefinitionInput,
} from "../../packages/studio-brand/src/index.js";

const brandId = "alpha.failure.boundary";
const componentRef = `${brandId}.component.card`;
const webImplementationId = `${brandId}.web.card.v1`;
const iosImplementationId = `${brandId}.ios.card.v1`;
const androidImplementationId = `${brandId}.android.card.v1`;
const recipeId = `${brandId}.recipe.browse`;
const capabilityHostId = "vira.host.web.failure.boundary";
const digest = `sha256:${"e".repeat(64)}`;

function brandInput(): ViraBrandDefinitionInput {
  return {
    identity: {
      version: "1",
      id: brandId,
      displayName: "Failure Boundary Brand",
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
          props: [{ key: "title", type: "string", required: true, bindable: true }],
          slots: [],
          events: [{ name: "select", label: "Selected" }],
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
      sources: [],
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
      description: "Synthetic failure-boundary experience.",
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
        bindings: [],
        interactions: [{
          viewId: "main",
          nodeId: "root",
          event: "select",
          actionEvent: "item.select",
          routes: [],
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
      id: "alpha/failure-boundary",
      version: "1.0.0",
      publisher: { id: "alpha", name: "Synthetic Publisher" },
      metadata: { name: "Failure Boundary Pack", tags: ["synthetic"] },
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

function hostManifest() {
  return {
    version: "1",
    id: capabilityHostId,
    platform: "web",
    implementationIds: [webImplementationId],
    capabilities: [],
  } as const;
}

function resolver(activeBrand: ViraBrandDefinition): ExperienceResolver {
  const activePublication = publication(activeBrand);
  const created = createExperienceResolver({
    registry: registry(),
    hostManifest: hostManifest(),
    resolveExactDeployment: async (deploymentId: string) => ({
      deploymentId,
      packId: "alpha/failure-boundary",
      packVersion: "1.0.0",
      entrypoint: "main",
    }),
    resolvePublicationArtifact: async () => activePublication,
    deriveHostRequirement: async () => ({
      version: "1",
      platform: "web",
      implementationIds: [webImplementationId],
      capabilities: [],
    }),
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("resolver fixture must be canonical");
  return created.value;
}

async function resolveInstance(activeResolver: ExperienceResolver, instanceId: string): Promise<void> {
  const result = await activeResolver.resolve({
    version: "1",
    instanceId,
    deploymentId: "deployment-failure-boundary",
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("resolved fixture must be available");
}

function runtimeState(suffix: string) {
  const result = createRuntimeState(`alpha-failure-${suffix}`, {
    version: "1",
    id: `alpha-failure-plan-${suffix}`,
    intent: { version: "1", namespace: brandId, name: "browse" },
    state: {},
    capabilities: { required: [], available: [], future: [] },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("runtime state fixture must be canonical");
  return result.value;
}

function permissionPolicy() {
  return {
    version: "1",
    rules: [{ subject: "action", id: `${brandId}.action.select`, effect: "allow" }],
  } as const;
}

function lifecycleSource(): ViraWebLifecycleSource {
  return {
    snapshot: () => ({ visibility: "foreground", connectivity: "connected" }),
    subscribe: (listener) => {
      void listener;
      return () => {};
    },
  };
}

function webHost() {
  const created = createViraWebHost({
    manifest: hostManifest(),
    renderers: {
      [webImplementationId]: (context: unknown) => (void context, null),
    },
    lifecycle: lifecycleSource(),
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("web Host fixture must be canonical");
  return created.value;
}

function experienceInput(
  activeResolver: ExperienceResolver,
  instanceId: string,
  activeBrand: ViraBrandDefinition,
  businessHost: unknown,
  suffix: string,
) {
  return {
    resolver: activeResolver,
    instanceId,
    brand: activeBrand,
    runtimeState: runtimeState(suffix),
    permissionPolicy: permissionPolicy(),
    host: businessHost,
  };
}

describe("MASTER-07A Web Host failure boundaries", () => {
  it("normalizes hostile runtime-host inspection exceptions into a typed fail-closed result", async () => {
    const activeBrand = brand();
    const activeResolver = resolver(activeBrand);
    const instanceId = "instance-host-proxy-failure";
    await resolveInstance(activeResolver, instanceId);
    const host = webHost();
    const hostileBusinessHost = new Proxy({}, {
      getPrototypeOf() {
        throw new Error("HOST_INSPECTION_SECRET");
      },
    });

    const result = host.createExperience(experienceInput(
      activeResolver,
      instanceId,
      activeBrand,
      hostileBusinessHost,
      "host-proxy",
    ));

    expect(result).toMatchObject({
      ok: false,
      issue: { code: "RUNTIME_CREATION_FAILED", path: "$" },
    });
    expect(JSON.stringify(result)).not.toContain("HOST_INSPECTION_SECRET");
    expect(host.get(instanceId)).toBeUndefined();
  });

  it("preserves exact Web Host and resolver cleanup when runtime disposal throws", async () => {
    const activeBrand = brand();
    const activeResolver = resolver(activeBrand);
    const instanceId = "instance-dispose-failure";
    await resolveInstance(activeResolver, instanceId);
    const host = webHost();
    const throwingBusinessHost = {
      version: "1",
      id: `${brandId}.runtime.host`,
      snapshot: () => ({ version: "1", revision: 1, state: {}, domain: {} }),
      dispatch: async (action: unknown) => {
        void action;
        return { outcome: "success" as const };
      },
      subscribe: (listener: unknown) => {
        void listener;
        return () => {
          throw new Error("RUNTIME_DISPOSE_SECRET");
        };
      },
    };

    const created = host.createExperience(experienceInput(
      activeResolver,
      instanceId,
      activeBrand,
      throwingBusinessHost,
      "dispose",
    ));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(host.get(instanceId)).toBe(created.value);
    expect(activeResolver.get(instanceId)).toBeDefined();

    expect(() => created.value.dispose()).not.toThrow();

    expect(created.value.isDisposed()).toBe(true);
    expect(host.get(instanceId)).toBeUndefined();
    expect(activeResolver.get(instanceId)).toBeUndefined();
  });
});
