import { describe, expect, it } from "vitest";
import { prepareStudioPublication } from "@vira-enterprise-genui/studio-publish";
import {
  actionAdapter,
  bindingSourceCatalog,
  componentCatalog,
  createStarterDocument,
  runtimeRenderers,
  workbenchRenderers,
} from "./catalog-v4.js";

describe("generic form primitive extension", () => {
  it("registers editable form/input/feedback primitives with authoring/runtime renderer parity", () => {
    const refs = componentCatalog.components.map((component) => component.ref);
    for (const ref of [
      "airline.layout.form",
      "airline.input.text",
      "airline.input.textarea",
      "airline.input.checkbox",
      "airline.component.alert",
      "airline.component.progress",
    ]) {
      expect(refs).toContain(ref);
      expect(workbenchRenderers).toHaveProperty(ref);
      expect(runtimeRenderers).toHaveProperty(ref);
    }
  });

  it("publishes the form starter through the same Studio gate without functional airline widgets", () => {
    const document = createStarterDocument("demo.form-canvas", "form-canvas");
    expect(document.views[0]?.nodes.some((node) => node.component === "airline.input.text")).toBe(true);
    expect(document.views[0]?.nodes.some((node) => node.component.startsWith("airline.booking."))).toBe(false);
    expect(prepareStudioPublication({ document, componentCatalog, bindingSourceCatalog, actionAdapter })).toMatchObject({
      ok: true,
      value: { id: "demo.form-canvas" },
    });
  });
});
