import { describe, expect, it } from "vitest";
import {
  createComponentAdapterContract,
  resolveComponentForCapability,
} from "../../packages/adapter-sdk/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

const capability = (id: string) => ({ version: "1", id });

function contract() {
  return {
    version: "1",
    id: "acme.web.components",
    mappings: [
      { capability: capability("select-date"), component: "acme.component.date-picker" },
      { capability: capability("select-return-date"), component: "acme.component.date-picker" },
      { capability: capability("display.flight-results"), component: "acme.component.flight-results" },
    ],
  };
}

describe("adapter-sdk component adapter", () => {
  it("resolves canonical capabilities to semantic component references", () => {
    expect(resolveComponentForCapability(contract(), capability("select-date"))).toEqual({
      ok: true,
      value: "acme.component.date-picker",
    });
    const parsed = createComponentAdapterContract(contract());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.mappings)).toBe(true);
    expect(jsonRoundTrip(parsed.value)).toEqual(parsed.value);
  });

  it("allows multiple capabilities to intentionally share one component reference", () => {
    expect(resolveComponentForCapability(contract(), capability("select-return-date"))).toEqual({
      ok: true,
      value: "acme.component.date-picker",
    });
  });

  it("rejects duplicate mappings for one capability", () => {
    expect(createComponentAdapterContract({
      ...contract(),
      mappings: [...contract().mappings, { capability: capability("select-date"), component: "acme.component.other" }],
    })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_CAPABILITY" } });
  });

  it("fails closed for unmapped capabilities", () => {
    expect(resolveComponentForCapability(contract(), capability("admin.delete"))).toMatchObject({
      ok: false,
      issue: { code: "UNMAPPED_CAPABILITY", path: "$.capability.id" },
    });
  });

  it("rejects implementation/import/URL/tag values as component references", () => {
    for (const component of ["DatePicker", "./DatePicker.js", "@acme/ui/DatePicker", "https://cdn.example.com/x.js", "vira-experience", "<date-picker>"]) {
      expect(createComponentAdapterContract({
        ...contract(),
        mappings: [{ capability: capability("select-date"), component }],
      })).toMatchObject({ ok: false, issue: { code: "INVALID_COMPONENT_REFERENCE" } });
    }
  });

  it("rejects implementation, props, rendering, and permission fields", () => {
    for (const field of ["componentImpl", "import", "url", "tag", "template", "props", "render", "callback", "execute", "permission"]) {
      expect(createComponentAdapterContract({ ...contract(), [field]: "forbidden" })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("does not retain caller-owned capability objects", () => {
    const input = contract();
    const sourceCapability = input.mappings[0]?.capability;
    const parsed = createComponentAdapterContract(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || !sourceCapability) return;
    sourceCapability.id = "mutated";
    expect(parsed.value.mappings[0]?.capability.id).toBe("select-date");
  });
});
