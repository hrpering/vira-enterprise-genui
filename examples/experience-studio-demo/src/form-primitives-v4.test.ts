import { describe, expect, it } from "vitest";
import {
  componentCatalog,
  runtimeRenderers,
  workbenchRenderers,
} from "./catalog-v4.js";

const FORM_REFS = [
  "airline.form.input",
  "airline.form.checkbox",
  "airline.status.alert",
  "airline.status.progress",
] as const;

describe("Studio catalog v4 primitives", () => {
  it("adds editable form and status primitives without renderer parity drift", () => {
    const catalogRefs = componentCatalog.components.map((component) => component.ref).sort();
    for (const ref of FORM_REFS) expect(catalogRefs).toContain(ref);
    expect(Object.keys(workbenchRenderers).sort()).toEqual(catalogRefs);
    expect(Object.keys(runtimeRenderers).sort()).toEqual(catalogRefs);
  });

  it("keeps primitive prop keys inside the canonical one-semantic-segment contract", () => {
    const input = componentCatalog.components.find((component) => component.ref === "airline.form.input");
    const keys = input?.props.map((prop) => prop.key) ?? [];
    expect(keys).toContain("input-type");
    expect(keys).not.toContain("inputType");
  });

  it("declares typed payload fields for interactive form primitives", () => {
    const input = componentCatalog.components.find((component) => component.ref === "airline.form.input");
    const checkbox = componentCatalog.components.find((component) => component.ref === "airline.form.checkbox");
    expect(input?.events).toEqual([{
      name: "change",
      label: "Value changed",
      payload: [{ key: "value", type: "string", required: true }],
    }]);
    expect(checkbox?.events).toEqual([{
      name: "change",
      label: "Checked changed",
      payload: [{ key: "checked", type: "boolean", required: true }],
    }]);
  });
});
