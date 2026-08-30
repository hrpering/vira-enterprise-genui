import { describe, expect, it } from "vitest";
import { createStudioBrandPackage } from "../../packages/studio-brand/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

function brandPackage() {
  return {
    version: "1",
    id: "acme.travel.studio",
    brand: {
      version: "1",
      id: "acme.travel",
      displayName: "Acme Travel",
      tokenRefs: {},
    },
    components: {
      version: "1",
      id: "acme.travel.components",
      brandId: "acme.travel",
      components: [{
        ref: "acme.component.offer-card",
        label: "Offer card",
        category: "offers",
        kind: "content",
        props: [{ key: "title", type: "string", required: true, bindable: true }],
        slots: [],
        events: [{ name: "select", label: "Offer selected" }],
      }],
    },
    dataSources: {
      version: "1",
      id: "acme.travel.data",
      sources: [{ kind: "domain", path: "offer.title", label: "Offer title", valueType: "string" }],
    },
    actions: {
      version: "1",
      id: "acme.travel.actions",
      mappings: [{ event: "offer.select", actionType: "travel.offer.select" }],
    },
    templates: [{
      id: "offer-results",
      label: "Offer results",
      description: "Editable offer result starter.",
      document: {
        version: "1",
        id: "studio.template.offer-results",
        recipeId: "studio.recipe.offer-results",
        entryView: "main",
        views: [{
          id: "main",
          nodes: [{ id: "root", component: "acme.component.offer-card", order: 0, props: { title: "Choose an offer" } }],
        }],
        bindings: [],
        interactions: [{ viewId: "main", nodeId: "root", event: "select", actionEvent: "offer.select", routes: [] }],
      },
    }],
  };
}

describe("studio brand package", () => {
  it("composes existing brand, component, data, action, and template contracts into one immutable package", () => {
    const result = createStudioBrandPackage(brandPackage());
    expect(result).toMatchObject({ ok: true, value: { id: "acme.travel.studio", brand: { id: "acme.travel" } } });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.templates)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("requires exact brand identity parity with the component catalog", () => {
    const input = brandPackage();
    input.components.brandId = "other.brand";
    expect(createStudioBrandPackage(input)).toMatchObject({
      ok: false,
      issue: { code: "BRAND_ID_MISMATCH", path: "$.components.brandId" },
    });
  });

  it("rejects templates that reference components outside the active brand catalog", () => {
    const input = brandPackage();
    input.templates[0]!.document.views[0]!.nodes[0]!.component = "other.component.card";
    expect(createStudioBrandPackage(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_TEMPLATE_DOCUMENT" },
    });
  });

  it("rejects template actions that are not registered by the brand action adapter", () => {
    const input = brandPackage();
    input.templates[0]!.document.interactions[0]!.actionEvent = "offer.delete";
    expect(createStudioBrandPackage(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_TEMPLATE_DOCUMENT" },
    });
  });

  it("rejects duplicate template ids", () => {
    const input = brandPackage();
    input.templates.push({ ...input.templates[0]!, document: { ...input.templates[0]!.document } });
    expect(createStudioBrandPackage(input)).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_TEMPLATE", path: "$.templates[1].id" },
    });
  });

  it("does not allow backend connection details to become part of the brand package contract", () => {
    expect(createStudioBrandPackage({ ...brandPackage(), endpoint: "https://customer.example/api" })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.endpoint" },
    });
    expect(createStudioBrandPackage({ ...brandPackage(), apiKey: "secret" })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.apiKey" },
    });
  });
});
