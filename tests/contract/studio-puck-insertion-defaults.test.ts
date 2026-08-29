import { describe, expect, it } from "vitest";
import { createStudioPuckEditorMetadata } from "../../packages/studio-puck-adapter/src/index.js";
import { createStudioPuckShellSession } from "../../packages/studio-react/src/index.js";

function catalog() {
  return {
    version: "1",
    id: "demo.studio.catalog",
    brandId: "demo",
    components: [{
      ref: "demo.component.form",
      label: "Form",
      category: "input",
      kind: "input",
      props: [
        { key: "label", type: "string", required: true, bindable: false },
        { key: "count", type: "number", required: true, bindable: false },
        { key: "enabled", type: "boolean", required: true, bindable: false },
        { key: "mode", type: "enum", required: true, bindable: false, options: ["simple", "advanced"] },
        { key: "hint", type: "string", required: false, bindable: false },
      ],
      slots: [],
      events: [],
    }],
  };
}

function document() {
  return {
    version: "1",
    id: "demo.form",
    recipeId: "demo.form",
    entryView: "main",
    views: [{ id: "main", nodes: [{ id: "form", component: "demo.component.form", order: 0, props: { label: "Existing", count: 1, enabled: true, mode: "advanced" } }] }],
    bindings: [],
    interactions: [],
  };
}

describe("Studio Puck insertion defaults", () => {
  it("derives safe editor-only defaults for required props", () => {
    const metadata = createStudioPuckEditorMetadata(catalog());
    expect(metadata.ok).toBe(true);
    if (!metadata.ok) return;
    expect(metadata.value.components[0]?.defaultProps).toEqual({
      label: "",
      count: 0,
      enabled: false,
      mode: "simple",
    });
    expect(metadata.value.components[0]?.defaultProps).not.toHaveProperty("hint");
  });

  it("passes insertion defaults into Puck config without changing existing document props", () => {
    const shell = createStudioPuckShellSession({
      document: document(),
      catalog: catalog(),
      viewId: "main",
      renderers: { "demo.component.form": () => "Form" },
    });
    expect(shell.ok).toBe(true);
    if (!shell.ok) return;
    const config = shell.value.config as unknown as { components: Record<string, { defaultProps?: Record<string, unknown> }> };
    expect(config.components["demo.component.form"]?.defaultProps).toEqual({ label: "", count: 0, enabled: false, mode: "simple" });
    expect(shell.value.data.content[0]?.props).toMatchObject({ label: "Existing", count: 1, enabled: true, mode: "advanced" });
  });
});
