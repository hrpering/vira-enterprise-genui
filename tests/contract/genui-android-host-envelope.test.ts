import { describe, expect, it } from "vitest";
import type { ResolvedExperienceDescriptor } from "../../packages/experience-resolver/src/index.js";
import {
  createViraAndroidMountEnvelope,
  prepareAuthoredStudioPublication,
} from "../../packages/genui/src/index.js";
import { parseJsonValue, type JsonObject } from "../../packages/protocol/src/index.js";
import {
  defineViraBrand,
  type ViraBrandDefinition,
} from "../../packages/studio-brand/src/index.js";

const brandId = "alpha.android";
const componentRef = `${brandId}.component.card`;
const webImplementationId = `${brandId}.web.card.v1`;
const iosImplementationId = `${brandId}.ios.card.v1`;
const androidImplementationId = `${brandId}.android.card.v1`;
const recipeId = `${brandId}.recipe.browse`;
const hostId = "vira.host.android.reference";
const digest = `sha256:${"b".repeat(64)}`;

function brand(): ViraBrandDefinition {
  const result = defineViraBrand({
    identity: {
      version: "1",
      id: brandId,
      displayName: "Alpha Android",
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
      sources: [{
        kind: "state",
        path: "catalog.count",
        label: "Catalog count",
        valueType: "number",
      }],
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
      description: "Synthetic Android experience.",
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
        }],
      },
    }],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Android brand fixture must be canonical");
  return result.value;
}

function descriptor(activeBrand: ViraBrandDefinition): ResolvedExperienceDescriptor {
  const publication = prepareAuthoredStudioPublication({
    document: activeBrand.package.templates[0]!.document,
    componentCatalog: activeBrand.package.components,
    bindingSourceCatalog: activeBrand.package.dataSources,
    actionAdapter: activeBrand.package.actions,
  });
  expect(publication.ok).toBe(true);
  if (!publication.ok) throw new Error("Android publication fixture must be canonical");
  const canonicalPublication = parseJsonValue(publication.value, "$.publication");
  if (!canonicalPublication.ok || canonicalPublication.value === null || typeof canonicalPublication.value !== "object" || Array.isArray(canonicalPublication.value)) {
    throw new Error("Android publication fixture must serialize as a canonical JSON object");
  }
  const publicationObject = canonicalPublication.value as JsonObject;

  return {
    instanceId: "instance-android-001",
    deploymentId: "deployment-android-exact",
    pack: {
      id: "alpha/android-native",
      version: "1.0.0",
      entrypoint: "main",
    },
    artifact: {
      id: "main",
      role: "studio-publication",
      mediaType: "application/json",
      digest,
    },
    publication: publicationObject,
    compatibility: {
      hostId,
      platform: "android",
    },
  };
}

function hostManifest(implementationIds: readonly string[] = [androidImplementationId]) {
  return {
    version: "1",
    id: hostId,
    platform: "android",
    implementationIds,
    capabilities: [{ version: "1", id: `${brandId}.capability.native` }],
  } as const;
}

describe("MASTER-07C canonical Android mount envelope", () => {
  it("projects only exact Android implementation IDs", () => {
    const activeBrand = brand();
    const activeDescriptor = descriptor(activeBrand);
    const result = createViraAndroidMountEnvelope({
      instanceId: activeDescriptor.instanceId,
      descriptor: activeDescriptor,
      brand: activeBrand,
      hostManifest: hostManifest(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      version: "1",
      instanceId: "instance-android-001",
      deploymentId: "deployment-android-exact",
      compatibility: { hostId, platform: "android" },
      host: {
        version: "1",
        id: hostId,
        platform: "android",
        implementationIds: [androidImplementationId],
      },
      brand: {
        id: brandId,
        components: [{
          ref: componentRef,
          implementationId: androidImplementationId,
        }],
      },
    });
    expect(JSON.stringify(result.value)).not.toContain(iosImplementationId);
    expect(JSON.stringify(result.value)).not.toContain("https://");
    expect(Object.isFrozen(result.value.brand.components)).toBe(true);
  });

  it("rejects non-Android Host manifests with an Android-specific public code", () => {
    const activeBrand = brand();
    const activeDescriptor = descriptor(activeBrand);
    expect(createViraAndroidMountEnvelope({
      instanceId: activeDescriptor.instanceId,
      descriptor: activeDescriptor,
      brand: activeBrand,
      hostManifest: { ...hostManifest(), platform: "ios" },
    })).toMatchObject({
      ok: false,
      issue: { stage: "host", code: "NON_ANDROID_HOST", path: "$.hostManifest.platform" },
    });
  });

  it("fails closed when the Host does not support the Brand Android implementation", () => {
    const activeBrand = brand();
    const activeDescriptor = descriptor(activeBrand);
    expect(createViraAndroidMountEnvelope({
      instanceId: activeDescriptor.instanceId,
      descriptor: activeDescriptor,
      brand: activeBrand,
      hostManifest: hostManifest([`${brandId}.android.other.v1`]),
    })).toMatchObject({
      ok: false,
      issue: {
        stage: "brand",
        code: "UNSUPPORTED_IMPLEMENTATION",
        path: "$.brand.implementations",
      },
    });
  });

  it("rejects exact-instance mismatches before native mounting", () => {
    const activeBrand = brand();
    const activeDescriptor = descriptor(activeBrand);
    expect(createViraAndroidMountEnvelope({
      instanceId: "instance-android-other",
      descriptor: activeDescriptor,
      brand: activeBrand,
      hostManifest: hostManifest(),
    })).toMatchObject({
      ok: false,
      issue: {
        stage: "descriptor",
        code: "INSTANCE_MISMATCH",
        path: "$.descriptor.instanceId",
      },
    });
  });
});
