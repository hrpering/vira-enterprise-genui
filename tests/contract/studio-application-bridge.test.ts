import { describe, expect, it } from "vitest";
import {
  prepareStudioApplicationPackageV2,
  type StudioApplicationBridgeInput,
} from "../../integrations/studio-application-bridge/index.js";

const STUDIO_INPUT = Object.freeze({
  document: Object.freeze({
    version: "1",
    id: "demo.checkout",
    recipeId: "demo.checkout",
    entryView: "main",
    views: Object.freeze([Object.freeze({
      id: "main",
      nodes: Object.freeze([Object.freeze({
        id: "button",
        component: "demo.component.button",
        order: 0,
        props: Object.freeze({}),
      })]),
    })]),
    bindings: Object.freeze([]),
    interactions: Object.freeze([Object.freeze({
      viewId: "main",
      nodeId: "button",
      event: "press",
      actionEvent: "submit",
      routes: Object.freeze([]),
    })]),
  }),
  componentCatalog: Object.freeze({
    version: "1",
    id: "demo.components",
    brandId: "demo.brand",
    components: Object.freeze([Object.freeze({
      ref: "demo.component.button",
      label: "Button",
      category: "demo.action",
      kind: "action",
      props: Object.freeze([]),
      slots: Object.freeze([]),
      events: Object.freeze([Object.freeze({ name: "press", label: "Press" })]),
    })]),
  }),
  bindingSourceCatalog: Object.freeze({
    version: "1",
    id: "demo.data",
    sources: Object.freeze([]),
  }),
  actionAdapter: Object.freeze({
    version: "1",
    id: "demo.actions",
    mappings: Object.freeze([Object.freeze({ event: "submit", actionType: "demo.action.submit" })]),
  }),
});

const APPLICATION_INPUT = Object.freeze({
  id: "demo.application.checkout",
  version: "1.0.0",
  packId: "demo/checkout",
  publicationArtifactId: "studio",
  publisher: Object.freeze({ id: "demo", name: "Demo" }),
  capabilities: Object.freeze([]),
  contextTypes: Object.freeze([]),
  actions: Object.freeze([Object.freeze({ id: "demo.action.submit", versionRef: "1.0.0" })]),
  flows: Object.freeze([]),
  brandRef: null,
  governanceRequirements: Object.freeze([]),
  hostCompatibility: Object.freeze({ minViraVersion: "1.0.0", requiredCapabilities: Object.freeze([]) }),
  protocolProjections: Object.freeze([]),
  triggers: Object.freeze([]),
  distribution: Object.freeze({
    name: "Demo checkout",
    description: "Studio bridge fixture",
    tags: Object.freeze(["demo"]),
    visibility: "private",
    discoverable: false,
  }),
  commercial: Object.freeze({
    entitlementRefs: Object.freeze([]),
    meteringRefs: Object.freeze([]),
    pricingRefs: Object.freeze([]),
    settlementRefs: Object.freeze([]),
  }),
});

function input(
  overrides: Partial<StudioApplicationBridgeInput["application"]> = {},
): StudioApplicationBridgeInput {
  return {
    studio: STUDIO_INPUT,
    application: { ...APPLICATION_INPUT, ...overrides },
  };
}

describe("Studio → Canonical Application V2 bridge", () => {
  it("creates a deterministic exact Studio artifact, Experience Pack and Application V2 chain", async () => {
    const result = await prepareStudioApplicationPackageV2(input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.publication.id).toBe("demo.checkout");
    expect(result.value.publication.manifest.actionEvents).toEqual(["submit"]);
    expect(result.value.publicationArtifact).toMatchObject({
      id: "studio",
      role: "studio-publication",
      mediaType: "application/json",
    });
    expect(result.value.publicationArtifact.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.value.publicationArtifact.size).toBe(
      new TextEncoder().encode(result.value.publicationArtifact.bytes).byteLength,
    );

    expect(result.value.experiencePack).toMatchObject({
      schemaVersion: "1",
      id: "demo/checkout",
      version: "1.0.0",
      publisher: { id: "demo", name: "Demo" },
      entrypoints: ["studio"],
      artifacts: [{
        id: "studio",
        role: "studio-publication",
        mediaType: "application/json",
        digest: result.value.publicationArtifact.digest,
        size: result.value.publicationArtifact.size,
      }],
    });
    expect(result.value.application).toMatchObject({
      schemaVersion: "2",
      identity: { id: "demo.application.checkout" },
      version: "1.0.0",
      experiences: [{
        id: "demo.checkout",
        packId: "demo/checkout",
        packVersion: "1.0.0",
        entrypoint: "studio",
      }],
      actions: [{ id: "demo.action.submit", versionRef: "1.0.0" }],
    });

    const replay = await prepareStudioApplicationPackageV2(input());
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.value.publicationArtifact).toEqual(result.value.publicationArtifact);
    expect(replay.value.experiencePack).toEqual(result.value.experiencePack);
    expect(replay.value.application).toEqual(result.value.application);
  });

  it("fails closed when a Studio event is not backed by an exact versioned Application Action", async () => {
    const result = await prepareStudioApplicationPackageV2(input({ actions: [] }));
    expect(result).toEqual({
      ok: false,
      issue: {
        code: "STUDIO_ACTION_REFERENCE_MISSING",
        path: "$.application.actions",
        message: "Studio action event submit maps to demo.action.submit, but the Application does not declare an exact versioned Action reference",
      },
    });
  });

  it("delegates duplicate Action id rejection to the canonical Application V2 parser", async () => {
    const result = await prepareStudioApplicationPackageV2(input({
      actions: [
        { id: "demo.action.submit", versionRef: "1.0.0" },
        { id: "demo.action.submit", versionRef: "2.0.0" },
      ],
    }));
    expect(result).toEqual({
      ok: false,
      issue: {
        code: "APPLICATION_PACKAGE_REJECTED",
        path: "$.application.actions[1].id",
        message: "Application V2 may bind only one exact version per Action id",
        sourceCode: "DUPLICATE_ACTION",
      },
    });
  });

  it("delegates floating Action rejection to the canonical Application V2 parser", async () => {
    const result = await prepareStudioApplicationPackageV2(input({
      actions: [{ id: "demo.action.submit", versionRef: "latest" }],
    }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.code).toBe("APPLICATION_PACKAGE_REJECTED");
    expect(result.issue.sourceCode).toBe("FLOATING_REFERENCE");
    expect(result.issue.path).toContain("$.application.actions[0]");
  });

  it("delegates Pack namespace/publisher authority to the canonical Experience Pack parser", async () => {
    const result = await prepareStudioApplicationPackageV2(input({ packId: "evil/checkout" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.code).toBe("EXPERIENCE_PACK_REJECTED");
    expect(result.issue.sourceCode).toBe("INVALID_PUBLISHER");
    expect(result.issue.path).toBe("$.experiencePack.publisher.id");
  });

  it("does not bypass the canonical Studio publication gate", async () => {
    const result = await prepareStudioApplicationPackageV2({
      studio: {
        ...STUDIO_INPUT,
        actionAdapter: { version: "1", id: "demo.actions", mappings: [] },
      },
      application: APPLICATION_INPUT,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue.code).toBe("STUDIO_PUBLICATION_REJECTED");
    expect(result.issue.sourceCode).toBe("INVALID_FLOW");
    expect(result.issue.path).toBe("$.studio.document.actionAdapter.mappings");
  });
});
