import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import { EXPERIENCE_PLAN_MAX_CAPABILITIES } from "../../packages/protocol/src/index.js";
import { prepareRenderModel } from "../../packages/runtime-web/src/index.js";

const capability = (index: number) => ({ version: "1", id: `capability-${index}` });

function plan() {
  return {
    version: "1",
    id: "scale-plan-1",
    intent: { version: "1", namespace: "runtime.scale", name: "render" },
    state: {},
    capabilities: {
      required: Array.from({ length: EXPERIENCE_PLAN_MAX_CAPABILITIES }, (_, index) => capability(index)),
      available: [],
      future: [],
    },
  };
}

function componentAdapter(mappingCount: number = EXPERIENCE_PLAN_MAX_CAPABILITIES) {
  return {
    version: "1",
    id: "scale.web.components",
    mappings: Array.from({ length: mappingCount }, (_, index) => ({
      capability: capability(index),
      component: `scale.component.capability-${index}`,
    })),
  };
}

describe("runtime-web render model canonical scale", () => {
  it("prepares the Protocol-owned maximum capability set with exact ordered mappings", () => {
    const sourcePlan = plan();
    const composed = composeExperience({
      plan: sourcePlan,
      layout: { family: "flow" },
      disclosure: { primary: "immediate", supporting: "progressive", deferred: "on-demand" },
    });
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;

    const rendered = prepareRenderModel({
      composition: composed.value,
      plan: sourcePlan,
      componentAdapter: componentAdapter(),
    });
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;

    expect(rendered.value.regions).toHaveLength(1);
    expect(rendered.value.regions[0]?.bindings).toHaveLength(EXPERIENCE_PLAN_MAX_CAPABILITIES);
    expect(rendered.value.regions[0]?.bindings[0]).toMatchObject({
      capability: { id: "capability-0" },
      component: "scale.component.capability-0",
    });
    expect(rendered.value.regions[0]?.bindings[EXPERIENCE_PLAN_MAX_CAPABILITIES - 1]).toMatchObject({
      capability: { id: `capability-${EXPERIENCE_PLAN_MAX_CAPABILITIES - 1}` },
      component: `scale.component.capability-${EXPERIENCE_PLAN_MAX_CAPABILITIES - 1}`,
    });
    expect(Object.isFrozen(rendered.value)).toBe(true);
    expect(Object.isFrozen(rendered.value.regions[0]?.bindings)).toBe(true);
  });

  it("remains fail-closed when the final canonical capability has no component mapping", () => {
    const sourcePlan = plan();
    const composed = composeExperience({
      plan: sourcePlan,
      layout: { family: "flow" },
      disclosure: { primary: "immediate", supporting: "progressive", deferred: "on-demand" },
    });
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;

    expect(prepareRenderModel({
      composition: composed.value,
      plan: sourcePlan,
      componentAdapter: componentAdapter(EXPERIENCE_PLAN_MAX_CAPABILITIES - 1),
    })).toMatchObject({
      ok: false,
      issue: {
        code: "UNMAPPED_COMPONENT",
        path: `$.composition.regions[0].capabilities[${EXPERIENCE_PLAN_MAX_CAPABILITIES - 1}]`,
      },
    });
  });
});