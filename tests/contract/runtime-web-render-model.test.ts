import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import { prepareRenderModel } from "../../packages/runtime-web/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

const capability = (id: string) => ({ version: "1", id });
const disclosure = { primary: "immediate", supporting: "progressive", deferred: "on-demand" };

function plan() {
  return {
    version: "1",
    id: "plan-1",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: { origin: "IST" },
    capabilities: {
      required: [capability("select-date")],
      available: [capability("submit-search")],
      future: [capability("display.flight-results")],
    },
  };
}

function composition() {
  return composeExperience({ plan: plan(), layout: { family: "split" }, disclosure });
}

function componentAdapter() {
  return {
    version: "1",
    id: "acme.web.components",
    mappings: [
      { capability: capability("select-date"), component: "acme.component.date-picker" },
      { capability: capability("submit-search"), component: "acme.component.search-button" },
      { capability: capability("display.flight-results"), component: "acme.component.flight-results" },
    ],
  };
}

describe("runtime-web render model", () => {
  it("prepares source-plan-validated semantic component bindings without browser implementation data", () => {
    const composed = composition();
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    const result = prepareRenderModel({ composition: composed.value, plan: plan(), componentAdapter: componentAdapter() });
    expect(result).toMatchObject({
      ok: true,
      value: {
        planId: "plan-1",
        mode: "resolve",
        layout: { family: "split" },
        disclosure,
        regions: [
          { id: "primary", role: "primary", bindings: [{ capability: { id: "select-date" }, component: "acme.component.date-picker" }] },
          { id: "supporting", role: "supporting", bindings: [{ capability: { id: "submit-search" }, component: "acme.component.search-button" }] },
          { id: "deferred", role: "deferred", bindings: [{ capability: { id: "display.flight-results" }, component: "acme.component.flight-results" }] },
        ],
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.regions)).toBe(true);
    expect(Object.isFrozen(result.value.regions[0]?.bindings)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
    for (const field of ["state", "data", "props", "html", "dom", "css", "implementation", "callback"]) {
      expect(Object.hasOwn(result.value, field)).toBe(false);
    }
  });

  it("fails closed if the composition is detached or forged relative to its source plan", () => {
    const composed = composition();
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    const forged = {
      ...composed.value,
      regions: [
        ...composed.value.regions,
        { id: "injected", role: "supporting", capabilities: [capability("admin.delete")] },
      ],
    };
    expect(prepareRenderModel({ composition: forged, plan: plan(), componentAdapter: componentAdapter() })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_COMPOSITION" },
    });
  });

  it("fails closed when any composed capability lacks an exact component mapping", () => {
    const composed = composition();
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    const adapter = componentAdapter();
    adapter.mappings = adapter.mappings.slice(1);
    expect(prepareRenderModel({ composition: composed.value, plan: plan(), componentAdapter: adapter })).toMatchObject({
      ok: false,
      issue: { code: "UNMAPPED_COMPONENT", path: "$.composition.regions[0].capabilities[0]" },
    });
  });

  it("preserves region and capability ordering", () => {
    const multiPlan = plan();
    multiPlan.capabilities.required = [capability("select-date"), capability("resolve-origin")];
    const composed = composeExperience({ plan: multiPlan, layout: { family: "flow" }, disclosure });
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    const adapter = componentAdapter();
    adapter.mappings.push({ capability: capability("resolve-origin"), component: "acme.component.origin-picker" });
    const result = prepareRenderModel({ composition: composed.value, plan: multiPlan, componentAdapter: adapter });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.regions[0]?.bindings.map((binding) => binding.capability.id)).toEqual(["select-date", "resolve-origin"]);
  });

  it("does not retain caller-owned component mappings", () => {
    const composed = composition();
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    const adapter = componentAdapter();
    const result = prepareRenderModel({ composition: composed.value, plan: plan(), componentAdapter: adapter });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    adapter.mappings[0]!.component = "acme.component.mutated";
    expect(result.value.regions[0]?.bindings[0]?.component).toBe("acme.component.date-picker");
  });

  it("rejects accessor-backed root fields without invoking getters", () => {
    let calls = 0;
    const input: Record<string, unknown> = { composition: {}, plan: {} };
    Object.defineProperty(input, "componentAdapter", {
      enumerable: true,
      get() {
        calls += 1;
        return componentAdapter();
      },
    });
    expect(prepareRenderModel(input)).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT", path: "$.componentAdapter" } });
    expect(calls).toBe(0);
  });
});
