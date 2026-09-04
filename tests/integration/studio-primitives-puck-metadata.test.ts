import { describe, expect, it } from "vitest";
import { createStudioPuckEditorMetadata } from "../../packages/studio-puck-adapter/src/index.js";

const componentCatalog = {
  version: "1",
  id: "reference.studio.components",
  brandId: "reference.brand",
  components: [
    {
      ref: "reference.form.input",
      label: "Input",
      category: "reference.form",
      kind: "input",
      props: [
        { key: "label", type: "string", required: true, bindable: false },
        { key: "value", type: "string", required: true, bindable: true },
        { key: "placeholder", type: "string", required: true, bindable: false },
        { key: "input-type", type: "enum", required: true, bindable: false, options: ["text", "email", "date"] },
      ],
      slots: [],
      events: [],
    },
    {
      ref: "reference.form.textarea",
      label: "Textarea",
      category: "reference.form",
      kind: "input",
      props: [
        { key: "label", type: "string", required: true, bindable: false },
        { key: "value", type: "string", required: true, bindable: true },
        { key: "placeholder", type: "string", required: true, bindable: false },
        { key: "rows", type: "number", required: true, bindable: false },
      ],
      slots: [],
      events: [],
    },
    {
      ref: "reference.form.select",
      label: "Select",
      category: "reference.form",
      kind: "input",
      props: [
        { key: "label", type: "string", required: true, bindable: false },
        { key: "value", type: "string", required: false, bindable: true },
        { key: "option-a", type: "string", required: false, bindable: false },
        { key: "option-b", type: "string", required: false, bindable: false },
        { key: "option-c", type: "string", required: false, bindable: false },
      ],
      slots: [],
      events: [],
    },
    {
      ref: "reference.form.checkbox",
      label: "Checkbox",
      category: "reference.form",
      kind: "input",
      props: [
        { key: "label", type: "string", required: true, bindable: false },
        { key: "checked", type: "boolean", required: true, bindable: true },
      ],
      slots: [],
      events: [],
    },
    {
      ref: "reference.form.radio",
      label: "Radio",
      category: "reference.form",
      kind: "input",
      props: [
        { key: "label", type: "string", required: true, bindable: false },
        { key: "value", type: "string", required: false, bindable: true },
        { key: "option-a", type: "string", required: false, bindable: false },
        { key: "option-b", type: "string", required: false, bindable: false },
        { key: "option-c", type: "string", required: false, bindable: false },
      ],
      slots: [],
      events: [],
    },
    {
      ref: "reference.form.field-group",
      label: "Field group",
      category: "reference.form",
      kind: "layout",
      props: [],
      slots: [{ name: "content", label: "Fields" }],
      events: [],
    },
    {
      ref: "reference.status.alert",
      label: "Alert",
      category: "reference.status",
      kind: "feedback",
      props: [
        { key: "text", type: "string", required: true, bindable: true },
        { key: "tone", type: "enum", required: true, bindable: false, options: ["info", "success", "warning", "danger"] },
      ],
      slots: [],
      events: [],
    },
    { ref: "reference.status.progress", label: "Progress", category: "reference.status", kind: "feedback", props: [], slots: [], events: [] },
    { ref: "reference.status.spinner", label: "Spinner", category: "reference.status", kind: "feedback", props: [], slots: [], events: [] },
    { ref: "reference.status.empty-state", label: "Empty state", category: "reference.status", kind: "feedback", props: [], slots: [], events: [] },
  ],
} as const;

const PRIMITIVE_REFS = componentCatalog.components.map((component) => component.ref);

describe("Studio v4 primitive Puck metadata", () => {
  it("converts every primitive into editor metadata with safe required-prop bootstrap values", () => {
    const metadata = createStudioPuckEditorMetadata(componentCatalog);
    expect(metadata.ok).toBe(true);
    if (!metadata.ok) return;

    const byRef = new Map(metadata.value.components.map((component) => [component.type, component] as const));
    for (const ref of PRIMITIVE_REFS) expect(byRef.has(ref), `${ref} must be insertable`).toBe(true);

    expect(byRef.get("reference.form.input")?.defaultProps).toMatchObject({
      label: "",
      value: "",
      placeholder: "",
      "input-type": "text",
    });
    expect(byRef.get("reference.form.textarea")?.defaultProps).toMatchObject({
      label: "",
      value: "",
      placeholder: "",
      rows: 0,
    });
    expect(byRef.get("reference.form.checkbox")?.defaultProps).toMatchObject({
      label: "",
      checked: false,
    });
    expect(byRef.get("reference.status.alert")?.defaultProps).toMatchObject({
      text: "",
      tone: "info",
    });

    const selectDefaults = byRef.get("reference.form.select")?.defaultProps ?? {};
    const radioDefaults = byRef.get("reference.form.radio")?.defaultProps ?? {};
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
    expect(byRef.get("reference.form.field-group")?.fields.content).toEqual({
      type: "slot",
      label: "Fields",
    });
    expect(byRef.get("reference.form.input")?.fields["input-type"]).toMatchObject({
      type: "select",
      options: [
        { label: "text", value: "text" },
        { label: "email", value: "email" },
        { label: "date", value: "date" },
      ],
    });
    expect(byRef.get("reference.form.radio")?.fields["option-a"]).toMatchObject({ type: "text" });
  });
});
