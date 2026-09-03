import { describe, expect, it, vi } from "vitest";
import {
  createExperienceResolver,
  type ExperienceResolver,
} from "../../packages/experience-resolver/src/index.js";
import {
  parseExperienceRegistrySnapshot,
  type ExperienceRegistrySnapshot,
} from "../../packages/experience-registry/src/index.js";
import {
  createViraWebBrowserLifecycleSource,
  createViraWebHost,
  prepareAuthoredStudioPublication,
  type ViraWebBrowserPlatform,
  type ViraWebLifecycleSource,
} from "../../packages/genui/src/index.js";
import { createRuntimeState } from "../../packages/runtime-core/src/index.js";
import {
  defineViraBrand,
  type ViraBrandDefinition,
  type ViraBrandDefinitionInput,
} from "../../packages/studio-brand/src/index.js";

const brandId = "alpha.catalog";
const componentRef = `${brandId}.component.card`;
const webImplementationId = `${brandId}.web.card.v1`;
const iosImplementationId = `${brandId}.ios.card.v1`;
const androidImplementationId = `${brandId}.android.card.v1`;
const recipeId = `${brandId}.recipe.browse`;
const digest = `sha256:${"d".repeat(64)}`;
const capabilityHostId = "vira.host.web.reference";

function brandInput(): ViraBrandDefinitionInput {
  return {
    identity: {
      version: "1",
      id: brandId,
      displayName: "Alpha Catalog",
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
      description: "Synthetic web Host experience.",
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
      id: "alpha/catalog",
      version: "1.0.0",
      publisher: { id: "alpha", name: "Synthetic Publisher" },
      metadata: { name: "Synthetic Catalog", tags: ["synthetic"] },
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

function hostManifest(id = capabilityHostId) {
  return {
    version: "1",
    id,
    platform: "web",
    implementationIds: [webImplementationId],
    capabilities: [],
  } as const;
}

function hostRequirement() {
  return {
    version: "1",
    platform: "web",
    implementationIds: [webImplementationId],
    capabilities: [],
  } as const;
}

function resolver(activeBrand: ViraBrandDefinition, manifest = hostManifest()) {
  const activePublication = publication(activeBrand);
  const created = createExperienceResolver({
    registry: registry(),
    hostManifest: manifest,
    resolveExactDeployment: async (deploymentId) => ({
      deploymentId,
      packId: "alpha/catalog",
      packVersion: "1.0.0",
      entrypoint: "main",
    }),
    resolvePublicationArtifact: async () => activePublication,
    deriveHostRequirement: async () => hostRequirement(),
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error("resolver fixture must be canonical");
  return created.value;
}

async function resolveInstance(activeResolver: ExperienceResolver, instanceId: string) {
  const result = await activeResolver.resolve({
    version: "1",
    instanceId,
    deploymentId: "deployment-exact-web",
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("resolved fixture must be available");
  return result.value;
}

function runtimeState(suffix = "one") {
  const result = createRuntimeState(`alpha-web-${suffix}`, {
    version: "1",
    id: `alpha-web-plan-${suffix}`,
    intent: { version: "1", namespace: "alpha.catalog", name: "browse" },
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

function businessHost(dispatch = vi.fn(async () => ({ outcome: "success" as const }))) {
  return {
    value: {
      version: "1",
      id: "alpha.catalog.runtime.host",
      snapshot: () => ({ version: "1", revision: 1, state: {}, domain: {} }),
      dispatch,
      subscribe: () => () => {},
    },
    dispatch,
  };
}

function lifecycleFixture(
  visibility: "foreground" | "background" = "foreground",
  connectivity: "connected" | "disconnected" = "connected",
) {
  const listeners = new Set<(event: { readonly version: "1"; readonly type: "foreground" | "background" | "resume" | "disconnect" | "reconnect" }) => void>();
  let unsubscribes = 0;
  const source: ViraWebLifecycleSource = {
    snapshot: () => ({ visibility, connectivity }),
    subscribe: (listener) => {
      listeners.add(listener);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        unsubscribes += 1;
        listeners.delete(listener);
      };
    },
  };
  return {
    source,
    emit(type: "foreground" | "background" | "resume" | "disconnect" | "reconnect") {
      for (const listener of [...listeners]) listener({ version: "1", type });
    },
    listenerCount: () => listeners.size,
    unsubscribeCount: () => unsubscribes,
  };
}

function createHost(activeLifecycle: ViraWebLifecycleSource, renderer = vi.fn((context: unknown) => (void context, null))) {
  const result = createViraWebHost({
    manifest: hostManifest(),
    renderers: { [webImplementationId]: renderer },
    lifecycle: activeLifecycle,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("web Host fixture must be canonical");
  return { host: result.value, renderer };
}

function experienceInput(
  activeResolver: ExperienceResolver,
  instanceId: string,
  activeBrand: ViraBrandDefinition,
  host: unknown,
  suffix = "one",
) {
  return {
    resolver: activeResolver,
    instanceId,
    brand: activeBrand,
    runtimeState: runtimeState(suffix),
    permissionPolicy: permissionPolicy(),
    host,
  };
}

describe("MASTER-07A canonical Web Host", () => {
  it("binds an exact resolved instance through Brand web implementation identity to a trusted local renderer", async () => {
    const activeBrand = brand();
    const activeResolver = resolver(activeBrand);
    await resolveInstance(activeResolver, "instance-web-001");
    const lifecycle = lifecycleFixture();
    const { host, renderer } = createHost(lifecycle.source);
    const runtimeHost = businessHost();

    const created = host.createExperience(experienceInput(
      activeResolver,
      "instance-web-001",
      activeBrand,
      runtimeHost.value,
    ));
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.value).toMatchObject({
      instanceId: "instance-web-001",
      capabilityHostId,
      runtimeHostId: "alpha.catalog.runtime.host",
    });
    expect(created.value.sessionState()).toEqual({
      version: "1",
      instanceId: "instance-web-001",
      revision: 0,
      visibility: "foreground",
      connectivity: "connected",
      continuity: "live",
      cacheStatus: "inactive",
    });
    expect(host.get("instance-web-001")).toBe(created.value);

    const rendered = created.value.renderReact();
    expect(rendered.ok).toBe(true);
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer.mock.calls[0]![0]).toMatchObject({
      component: componentRef,
      nodeId: "root",
      props: { title: "Browse items" },
    });
    expect(runtimeHost.dispatch).not.toHaveBeenCalled();

    expect(host.createExperience(experienceInput(
      activeResolver,
      "instance-web-001",
      activeBrand,
      runtimeHost.value,
      "duplicate",
    ))).toMatchObject({
      ok: false,
      issue: { code: "INSTANCE_ALREADY_MOUNTED", path: "$.instanceId" },
    });

    created.value.dispose();
    expect(created.value.isDisposed()).toBe(true);
    expect(host.get("instance-web-001")).toBeUndefined();
    expect(activeResolver.get("instance-web-001")).toBeUndefined();
    expect(lifecycle.listenerCount()).toBe(0);
    expect(lifecycle.unsubscribeCount()).toBe(1);
  });

  it("keeps multiple exact instance identities isolated and releases only the selected instance", async () => {
    const activeBrand = brand();
    const activeResolver = resolver(activeBrand);
    await resolveInstance(activeResolver, "instance-web-a");
    await resolveInstance(activeResolver, "instance-web-b");
    const lifecycle = lifecycleFixture("background", "connected");
    const { host } = createHost(lifecycle.source);

    const firstHost = businessHost();
    const secondHost = businessHost();
    const first = host.createExperience(experienceInput(activeResolver, "instance-web-a", activeBrand, firstHost.value, "a"));
    const second = host.createExperience(experienceInput(activeResolver, "instance-web-b", activeBrand, secondHost.value, "b"));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.value).not.toBe(second.value);
    expect(first.value.sessionState().instanceId).toBe("instance-web-a");
    expect(second.value.sessionState().instanceId).toBe("instance-web-b");
    expect(host.get("instance-web-a")).toBe(first.value);
    expect(host.get("instance-web-b")).toBe(second.value);
    expect(lifecycle.listenerCount()).toBe(2);

    expect(host.release("instance-web-a")).toBe(true);
    expect(host.get("instance-web-a")).toBeUndefined();
    expect(activeResolver.get("instance-web-a")).toBeUndefined();
    expect(host.get("instance-web-b")).toBe(second.value);
    expect(activeResolver.get("instance-web-b")).toBeDefined();
    expect(second.value.isDisposed()).toBe(false);
    expect(lifecycle.listenerCount()).toBe(1);

    host.dispose();
    expect(activeResolver.get("instance-web-b")).toBeUndefined();
    expect(lifecycle.listenerCount()).toBe(0);
  });

  it("translates shared lifecycle events through the MASTER-06 session kernel without replaying host actions", async () => {
    const activeBrand = brand();
    const activeResolver = resolver(activeBrand);
    await resolveInstance(activeResolver, "instance-lifecycle");
    const lifecycle = lifecycleFixture();
    const { host } = createHost(lifecycle.source);
    const runtimeHost = businessHost();
    const created = host.createExperience(experienceInput(
      activeResolver,
      "instance-lifecycle",
      activeBrand,
      runtimeHost.value,
      "lifecycle",
    ));
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const revisions: number[] = [];
    const unsubscribe = created.value.subscribeSession((state) => revisions.push(state.revision));

    lifecycle.emit("background");
    lifecycle.emit("background");
    lifecycle.emit("disconnect");
    lifecycle.emit("resume");
    lifecycle.emit("reconnect");

    expect(revisions).toEqual([1, 2, 3, 4]);
    expect(created.value.sessionState()).toMatchObject({
      instanceId: "instance-lifecycle",
      revision: 4,
      visibility: "foreground",
      connectivity: "connected",
      continuity: "live",
      cacheStatus: "inactive",
    });
    expect(runtimeHost.dispatch).not.toHaveBeenCalled();

    unsubscribe();
    lifecycle.emit("background");
    expect(revisions).toEqual([1, 2, 3, 4]);
    expect(created.value.sessionState()).toMatchObject({ revision: 5, visibility: "background" });
  });

  it("fails closed when the resolver descriptor belongs to another instance or Host Capability identity", async () => {
    const activeBrand = brand();
    const activeResolver = resolver(activeBrand);
    const descriptor = await resolveInstance(activeResolver, "instance-original");
    const lifecycle = lifecycleFixture();
    const { host } = createHost(lifecycle.source);
    const runtimeHost = businessHost();

    const wrongInstanceResolver: ExperienceResolver = {
      resolve: activeResolver.resolve,
      get: () => descriptor,
      release: () => false,
      dispose: () => {},
    };
    const mismatch = host.createExperience(experienceInput(
      wrongInstanceResolver,
      "instance-requested",
      activeBrand,
      runtimeHost.value,
      "mismatch",
    ));
    expect(mismatch).toMatchObject({
      ok: false,
      issue: { code: "RESOLUTION_INSTANCE_MISMATCH", path: "$.resolution.instanceId" },
    });
    expect(JSON.stringify(mismatch)).not.toContain("instance-original");
    expect(JSON.stringify(mismatch)).not.toContain("instance-requested");

    const otherManifest = hostManifest("vira.host.web.other");
    const otherResolver = resolver(activeBrand, otherManifest);
    await resolveInstance(otherResolver, "instance-other-host");
    expect(host.createExperience(experienceInput(
      otherResolver,
      "instance-other-host",
      activeBrand,
      runtimeHost.value,
      "other-host",
    ))).toMatchObject({
      ok: false,
      issue: { code: "RESOLUTION_HOST_MISMATCH", path: "$.resolution.compatibility" },
    });
  });

  it("requires Host Manifest renderer truth and exact cross-platform Brand implementation mappings", async () => {
    const lifecycle = lifecycleFixture();
    expect(createViraWebHost({
      manifest: hostManifest(),
      renderers: {},
      lifecycle: lifecycle.source,
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_RENDERER_REGISTRY", path: "$.renderers" },
    });

    expect(createViraWebHost({
      manifest: { ...hostManifest(), platform: "ios" },
      renderers: { [webImplementationId]: () => null },
      lifecycle: lifecycle.source,
    })).toMatchObject({
      ok: false,
      issue: { code: "NON_WEB_HOST", path: "$.manifest.platform" },
    });

    const activeBrand = brand();
    const activeResolver = resolver(activeBrand);
    await resolveInstance(activeResolver, "instance-brand-guard");
    const { host } = createHost(lifecycle.source);
    const runtimeHost = businessHost();

    const unsupportedBrand: ViraBrandDefinition = Object.freeze({
      ...activeBrand,
      implementations: Object.freeze(activeBrand.implementations.map((mapping) => Object.freeze({
        ...mapping,
        web: `${brandId}.web.uninstalled.v1`,
      }))),
    });
    expect(host.createExperience(experienceInput(
      activeResolver,
      "instance-brand-guard",
      unsupportedBrand,
      runtimeHost.value,
      "unsupported",
    ))).toMatchObject({
      ok: false,
      issue: { code: "UNSUPPORTED_IMPLEMENTATION", path: "$.brand.implementations" },
    });

    const malformedBrand = {
      ...activeBrand,
      implementations: activeBrand.implementations.map((mapping) => ({
        ...mapping,
        ios: "javascript:alert",
      })),
    } as unknown as ViraBrandDefinition;
    expect(host.createExperience(experienceInput(
      activeResolver,
      "instance-brand-guard",
      malformedBrand,
      runtimeHost.value,
      "malformed",
    ))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_BRAND_IMPLEMENTATIONS", path: "$.brand.implementations" },
    });
  });

  it("fails closed on hostile resolver/lifecycle inputs without reflecting thrown secrets", async () => {
    const activeBrand = brand();
    const activeResolver = resolver(activeBrand);
    const descriptor = await resolveInstance(activeResolver, "instance-hostile");
    const lifecycle = lifecycleFixture();
    const { host } = createHost(lifecycle.source);
    const runtimeHost = businessHost();

    const hostileResolver: ExperienceResolver = {
      resolve: activeResolver.resolve,
      get: () => { throw new Error("RESOLVER_SECRET"); },
      release: () => false,
      dispose: () => {},
    };
    const result = host.createExperience(experienceInput(
      hostileResolver,
      descriptor.instanceId,
      activeBrand,
      runtimeHost.value,
      "hostile",
    ));
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_RESOLVER", path: "$.resolver" } });
    expect(JSON.stringify(result)).not.toContain("RESOLVER_SECRET");

    const badLifecycle = createViraWebHost({
      manifest: hostManifest(),
      renderers: { [webImplementationId]: () => null },
      lifecycle: {
        snapshot: () => { throw new Error("LIFECYCLE_SECRET"); },
        subscribe: () => () => {},
      },
    });
    expect(badLifecycle.ok).toBe(true);
    if (!badLifecycle.ok) return;
    const lifecycleFailure = badLifecycle.value.createExperience(experienceInput(
      activeResolver,
      descriptor.instanceId,
      activeBrand,
      runtimeHost.value,
      "lifecycle-secret",
    ));
    expect(lifecycleFailure).toMatchObject({
      ok: false,
      issue: { code: "LIFECYCLE_SNAPSHOT_FAILED", path: "$.lifecycle" },
    });
    expect(JSON.stringify(lifecycleFailure)).not.toContain("LIFECYCLE_SECRET");
  });
});

describe("MASTER-07A browser lifecycle adapter", () => {
  it("maps browser visibility/connectivity signals to platform-neutral session events and removes listeners", () => {
    const documentListeners = new Map<string, () => void>();
    const windowListeners = new Map<string, () => void>();
    const documentPort = {
      visibilityState: "visible",
      addEventListener(type: string, listener: () => void) { documentListeners.set(type, listener); },
      removeEventListener(type: string, listener: () => void) {
        if (documentListeners.get(type) === listener) documentListeners.delete(type);
      },
    };
    const windowPort = {
      addEventListener(type: string, listener: () => void) { windowListeners.set(type, listener); },
      removeEventListener(type: string, listener: () => void) {
        if (windowListeners.get(type) === listener) windowListeners.delete(type);
      },
    };
    const navigatorPort = { onLine: true };
    const platform = {
      document: documentPort,
      window: windowPort,
      navigator: navigatorPort,
    } satisfies ViraWebBrowserPlatform;

    const created = createViraWebBrowserLifecycleSource(platform);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.snapshot()).toEqual({ visibility: "foreground", connectivity: "connected" });

    const events: string[] = [];
    const unsubscribe = created.value.subscribe((event) => events.push(event.type));
    expect(documentListeners.has("visibilitychange")).toBe(true);
    expect(windowListeners.has("online")).toBe(true);
    expect(windowListeners.has("offline")).toBe(true);

    documentPort.visibilityState = "hidden";
    documentListeners.get("visibilitychange")?.();
    documentPort.visibilityState = "visible";
    documentListeners.get("visibilitychange")?.();
    navigatorPort.onLine = false;
    windowListeners.get("offline")?.();
    navigatorPort.onLine = true;
    windowListeners.get("online")?.();

    expect(events).toEqual(["background", "resume", "disconnect", "reconnect"]);
    expect(created.value.snapshot()).toEqual({ visibility: "foreground", connectivity: "connected" });

    unsubscribe();
    expect(documentListeners.size).toBe(0);
    expect(windowListeners.size).toBe(0);
  });

  it("rejects an invalid initial browser connectivity signal", () => {
    const platform = {
      document: {
        visibilityState: "visible",
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      window: {
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      navigator: { onLine: "yes" },
    } as unknown as ViraWebBrowserPlatform;

    expect(createViraWebBrowserLifecycleSource(platform)).toEqual({
      ok: false,
      issue: {
        code: "INVALID_PLATFORM",
        message: "browser lifecycle platform could not provide a valid initial state",
      },
    });
  });
});
