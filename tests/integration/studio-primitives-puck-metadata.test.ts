import { describe, expect, it } from "vitest";
import { createStudioPuckEditorMetadata } from "../../packages/studio-puck-adapter/src/index.js";
import { componentCatalog } from "../../examples/experience-studio-demo/src/catalog.js";

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

describe("Studio v4 primitive Puck metadata", () => {
  it("converts every primitive into editor metadata with safe required-prop bootstrap values", () => {
    const metadata = createStudioPuckEditorMetadata(componentCatalog);
    expect(metadata.ok).toBe(true);
    if (!metadata.ok) return;

    const byRef = new Map(metadata.value.components.map((component) => [component.type, component] as const));
    for (const ref of PRIMITIVE_REFS) expect(byRef.has(ref), `${ref} must be insertable`).toBe(true);

    expect(byRef.get("airline.form.input")?.defaultProps).toMatchObject({
      label: "",
      value: "",
      placeholder: "",
      "input-type": "text",
    });
    expect(byRef.get("airline.form.textarea")?.defaultProps).toMatchObject({
      label: "",
      value: "",
      placeholder: "",
      rows: 0,
    });
    expect(byRef.get("airline.form.checkbox")?.defaultProps).toMatchObject({
      label: "",
      checked: false,
    });
    expect(byRef.get("airline.status.alert")?.defaultProps).toMatchObject({
      text: "",
      tone: "info",
    });

    const selectDefaults = byRef.get("airline.form.select")?.defaultProps ?? {};
    const radioDefaults = byRef.get("airline.form.radio")?.defaultProps ?? {};
    for (const defaults of [selectDefaults, radioDefaults]) {
      expect(defaults).not.toHaveProperty("value");
      expect(defaults).not.toHaveProperty("option-a");
      expect(defaults).not.toHaveProperty("option-b");
      expect(defaults).not.toHaveProperty("option-c");
    }
  });

  it("maps the composable field-group slot and input controls to Puck-native field definitions", () => {
    const metadata = createStudioPuckEditorMetadata(componentCatalog);
    expect(metadata.ok).toBe(true);
    if (!metadata.ok) return;

    const byRef = new Map(metadata.value.components.map((component) => [component.type, component] as const));
    expect(byRef.get("airline.form.field-group")?.fields.content).toEqual({
      type: "slot",
      label: "Fields",
    });
    expect(byRef.get("airline.form.input")?.fields["input-type"]).toMatchObject({
      type: "select",
      options: [
        { label: "text", value: "text" },
        { label: "email", value: "email" },
        { label: "date", value: "date" },
      ],
    });
    expect(byRef.get("airline.form.radio")?.fields["option-a"]).toMatchObject({ type: "text" });
  });
});
