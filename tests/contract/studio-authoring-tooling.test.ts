import { describe, expect, it } from "vitest";
import {
  buildStudioExperience,
  previewStudioExperience,
  validateStudioExperience,
} from "../../packages/studio-authoring/src/index.js";

const context = {
  componentCatalog: {
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
  },
  bindingSourceCatalog: { version: "1", id: "manual.studio.data", sources: [] },
  actionAdapter: {
    version: "1",
    id: "manual.studio.actions",
    mappings: [{ event: "manual.submit", actionType: "manual.submit" }],
  },
};

function document() {
  return {
    version: "1",
    id: "manual.tooling",
    recipeId: "manual.tooling",
    entryView: "main",
    views: [{ id: "main", nodes: [{ id: "submit", component: "manual.component.button", order: 0, props: {} }] }],
    bindings: [],
    interactions: [{
      viewId: "main",
      nodeId: "submit",
      event: "press",
      actionEvent: "manual.submit",
      routes: [{ outcome: "success", viewId: "main" }],
    }],
  };
}

describe("manual Studio tooling", () => {
  it("validates raw canonical data without normalizing invalid fields away", () => {
    expect(validateStudioExperience(document())).toMatchObject({ ok: true, value: { id: "manual.tooling" } });
    expect(validateStudioExperience({ ...document(), backendUrl: "https://forbidden.example" })).toMatchObject({
      ok: false,
      stage: "document",
      issue: { code: "UNKNOWN_FIELD", path: "$.backendUrl" },
    });
  });

  it("builds through the existing Studio publication gate", () => {
    expect(buildStudioExperience({ document: document(), ...context })).toMatchObject({
      ok: true,
      value: { id: "manual.tooling", manifest: { componentRefs: ["manual.component.button"] } },
    });
  });

  it("previews through the same publication gate and fails closed for unknown views", () => {
    expect(previewStudioExperience({ document: document(), viewId: "main", ...context })).toMatchObject({
      ok: true,
      value: { experienceId: "manual.tooling", viewId: "main" },
    });
    expect(previewStudioExperience({ document: document(), viewId: "missing", ...context })).toMatchObject({
      ok: false,
      stage: "publication",
      issue: { code: "VIEW_NOT_FOUND" },
    });
  });
});
