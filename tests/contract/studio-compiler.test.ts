import { describe, expect, it } from "vitest";
import { compileStudioExperience } from "../../packages/studio-compiler/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

function document() {
  return {
    version: "1",
    id: "pegasus.flight-discovery",
    recipeId: "pegasus.flight.search",
    entryView: "search",
    views: [
      {
        id: "search",
        nodes: [
          { id: "layout", component: "pegasus.layout.stack", order: 0, props: {} },
          { id: "submit", component: "pegasus.component.button", parentId: "layout", slot: "content", order: 0, props: { label: "Search" } },
        ],
      },
      {
        id: "results",
        nodes: [
          { id: "list", component: "pegasus.component.flight-list", order: 0, props: {} },
          { id: "secondary", component: "pegasus.component.button", order: 1, props: { label: "Change dates" } },
        ],
      },
    ],
    bindings: [
      { viewId: "results", nodeId: "list", prop: "items", source: { kind: "domain", path: "travel.flight.results" } },
      { viewId: "search", nodeId: "submit", prop: "disabled", source: { kind: "state", path: "search.disabled" } },
    ],
    interactions: [
      { viewId: "search", nodeId: "submit", event: "press", actionEvent: "flight.search.submit", routes: [{ outcome: "success", viewId: "results" }] },
      { viewId: "results", nodeId: "secondary", event: "press", actionEvent: "flight.date.change", routes: [] },
    ],
  };
}

describe("Experience Studio compiler", () => {
  it("produces a deterministic publication manifest without inventing an ExperiencePlan", () => {
    const result = compileStudioExperience(document());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      version: "1",
      id: "pegasus.flight-discovery",
      recipeId: "pegasus.flight.search",
      entryView: "search",
      manifest: {
        componentRefs: ["pegasus.component.button", "pegasus.component.flight-list", "pegasus.layout.stack"],
        actionEvents: ["flight.date.change", "flight.search.submit"],
        bindingSources: ["domain:travel.flight.results", "state:search.disabled"],
      },
    });
    expect(Object.hasOwn(result.value, "plan")).toBe(false);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.manifest.componentRefs)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("fails through the canonical StudioDocument validator", () => {
    expect(compileStudioExperience({ ...document(), entryView: "missing" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ENTRY_VIEW" },
    });
  });
});
