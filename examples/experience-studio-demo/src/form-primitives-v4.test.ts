import { isStudioSemanticSegment } from "@vira-enterprise-genui/studio-schema";
import { describe, expect, it } from "vitest";
import {
  componentCatalog,
  runtimeRenderers,
  workbenchRenderers,
} from "./catalog-v4.js";

const PRIMITIVE_REFS = [
  "airline.form.input",
  "airline.form.textarea",
  "airline.form.select",
  "airline.form.checkbox",
  "airline.form.radio",
  "airline.form.field-group",
  "airline.status.alert",
  "airline.status.progress",
  "airline.status.spinner",
  "airline.status.empty-state",
] as const;

const VALUE_EVENT_REFS = [
  "airline.form.input",
  "airline.form.textarea",
  "airline.form.select",
  "airline.form.radio",
] as const;

function component(ref: string) {
  return componentCatalog.components.find((candidate) => candidate.ref === ref);
}

describe("Studio catalog v4 primitives", () => {
  it("adds the minimum editable form/feedback kit without renderer parity drift", () => {
    const catalogRefs = componentCatalog.components.map((item) => item.ref).sort();
    for (const ref of PRIMITIVE_REFS) expect(catalogRefs).toContain(ref);
    expect(Object.keys(workbenchRenderers).sort()).toEqual(catalogRefs);
    expect(Object.keys(runtimeRenderers).sort()).toEqual(catalogRefs);
  });

  it("keeps every primitive prop and slot key inside canonical semantic-segment syntax", () => {
    for (const ref of PRIMITIVE_REFS) {
      const definition = component(ref);
      expect(definition, `${ref} must exist`).toBeDefined();
      for (const prop of definition?.props ?? []) {
        expect(isStudioSemanticSegment(prop.key), `${ref}.${prop.key}`).toBe(true);
      }
      for (const slot of definition?.slots ?? []) {
        expect(isStudioSemanticSegment(slot.name), `${ref}.${slot.name}`).toBe(true);
      }
    }

    const inputKeys = component("airline.form.input")?.props.map((prop) => prop.key) ?? [];
    expect(inputKeys).toContain("input-type");
    expect(inputKeys).not.toContain("inputType");
  });

  it("declares typed value events for text/select/radio inputs and boolean events for checkbox", () => {
    for (const ref of VALUE_EVENT_REFS) {
      expect(component(ref)?.events).toEqual([expect.objectContaining({
        name: "change",
        payload: [{ key: "value", type: "string", required: true }],
      })]);
    }
    expect(component("airline.form.checkbox")?.events).toEqual([expect.objectContaining({
      name: "change",
      payload: [{ key: "checked", type: "boolean", required: true }],
    })]);
  });

  it("keeps the field group composable and status surfaces in the feedback category", () => {
    expect(component("airline.form.field-group")).toMatchObject({
      kind: "layout",
      slots: [{ name: "content", label: "Fields" }],
    });
    for (const ref of [
      "airline.status.alert",
      "airline.status.progress",
      "airline.status.spinner",
      "airline.status.empty-state",
    ] as const) {
      expect(component(ref)?.kind).toBe("feedback");
    }
  });
});
