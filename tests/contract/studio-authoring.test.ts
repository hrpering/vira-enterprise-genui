import { describe, expect, it } from "vitest";
import {
  defineStudioExperience,
  prepareAuthoredStudioPublication,
} from "../../packages/studio-authoring/src/index.js";
import type { StudioAuthoringDocumentInput } from "../../packages/studio-authoring/src/index.js";

function components() {
  return {
    version: "1",
    id: "manual.studio.components",
    brandId: "manual",
    components: [{
      ref: "manual.component.button",
      label: "Button",
      category: "actions",
      kind: "action",
      props: [],
      slots: [],
      events: [{ name: "press", label: "Press" }],
    }],
  };
}

function sources() {
  return { version: "1", id: "manual.studio.data", sources: [] };
}

function actions() {
  return {
    version: "1",
    id: "manual.studio.actions",
    mappings: [{ event: "manual.submit", actionType: "manual.submit" }],
  };
}

function document(): StudioAuthoringDocumentInput {
  return {
    id: "manual.example",
    recipeId: "manual.example",
    entryView: "main",
    views: [{
      id: "main",
      nodes: [{ id: "submit", component: "manual.component.button", order: 0, props: {} }],
    }],
    interactions: [{
      viewId: "main",
      nodeId: "submit",
      event: "press",
      actionEvent: "manual.submit",
      routes: [{ outcome: "success", viewId: "main" }],
    }],
  };
}

describe("manual Studio authoring", () => {
  it("adds only canonical defaults and returns the parsed immutable Studio document", () => {
    const result = defineStudioExperience(document());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe("1");
    expect(result.value.bindings).toEqual([]);
    expect(result.value.interactions).toHaveLength(1);
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it("preserves unknown fields for the canonical parser to reject fail-closed", () => {
    const input = {
      ...document(),
      backendUrl: "https://forbidden.example.test",
    } as StudioAuthoringDocumentInput;
    expect(defineStudioExperience(input)).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.backendUrl" },
    });
  });

  it("uses the existing publication gate after canonical document parsing", () => {
    const result = prepareAuthoredStudioPublication({
      document: document(),
      componentCatalog: components(),
      bindingSourceCatalog: sources(),
      actionAdapter: actions(),
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        id: "manual.example",
        manifest: {
          componentRefs: ["manual.component.button"],
          actionEvents: ["manual.submit"],
          bindingSources: [],
        },
      },
    });
  });

  it("distinguishes document failures from publication-policy failures", () => {
    expect(prepareAuthoredStudioPublication({
      document: { ...document(), entryView: "missing" },
      componentCatalog: components(),
      bindingSourceCatalog: sources(),
      actionAdapter: actions(),
    })).toMatchObject({ ok: false, stage: "document" });

    expect(prepareAuthoredStudioPublication({
      document: document(),
      componentCatalog: components(),
      bindingSourceCatalog: sources(),
      actionAdapter: { ...actions(), mappings: [] },
    })).toMatchObject({
      ok: false,
      stage: "publication",
      issue: { code: "INVALID_FLOW" },
    });
  });
});
