import { describe, expect, it } from "vitest";
import { parseStudioExperienceDocument } from "../../packages/studio-schema/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

interface MutableNode {
  id: string;
  component: string;
  order: number;
  props: Record<string, unknown>;
  parentId?: string;
  slot?: string;
}

interface MutableView {
  id: string;
  nodes: MutableNode[];
}

interface MutableBinding {
  viewId: string;
  nodeId: string;
  prop: string;
  source: { kind: string; path: string };
}

interface MutableRoute {
  outcome: string;
  viewId: string;
}

interface MutableInteraction {
  viewId: string;
  nodeId: string;
  event: string;
  actionEvent: string;
  routes: MutableRoute[];
}

interface MutableStudioDocument {
  version: string;
  id: string;
  recipeId: string;
  entryView: string;
  views: MutableView[];
  bindings: MutableBinding[];
  interactions: MutableInteraction[];
}

function document(): MutableStudioDocument {
  return {
    version: "1",
    id: "pegasus.flight-discovery",
    recipeId: "pegasus.flight.search",
    entryView: "search",
    views: [
      {
        id: "search",
        nodes: [
          { id: "form", component: "pegasus.layout.stack", order: 0, props: {} },
          { id: "origin", component: "pegasus.component.airport-picker", parentId: "form", slot: "content", order: 0, props: { label: "From" } },
          { id: "destination", component: "pegasus.component.airport-picker", parentId: "form", slot: "content", order: 1, props: { label: "To" } },
          { id: "submit", component: "pegasus.component.button", parentId: "form", slot: "content", order: 2, props: { label: "Find flights" } },
        ],
      },
      {
        id: "results",
        nodes: [
          { id: "list", component: "pegasus.component.flight-list", order: 0, props: {} },
        ],
      },
      {
        id: "empty",
        nodes: [
          { id: "calendar", component: "pegasus.component.flexible-calendar", order: 0, props: {} },
        ],
      },
      {
        id: "error",
        nodes: [
          { id: "message", component: "pegasus.component.error-state", order: 0, props: {} },
        ],
      },
    ],
    bindings: [
      { viewId: "search", nodeId: "origin", prop: "value", source: { kind: "state", path: "origin" } },
      { viewId: "results", nodeId: "list", prop: "items", source: { kind: "domain", path: "travel.flight.results" } },
    ],
    interactions: [
      {
        viewId: "search",
        nodeId: "submit",
        event: "press",
        actionEvent: "flight.search.submit",
        routes: [
          { outcome: "success", viewId: "results" },
          { outcome: "empty", viewId: "empty" },
          { outcome: "error", viewId: "error" },
        ],
      },
    ],
  };
}

describe("Experience Studio document", () => {
  it("normalizes a multi-view brand-native experience independently of Puck", () => {
    const input = document();
    const result = parseStudioExperienceDocument(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("pegasus.flight-discovery");
    expect(result.value.views[0]?.nodes[1]).toMatchObject({ parentId: "form", slot: "content", order: 0 });
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.views)).toBe(true);
    expect(Object.isFrozen(result.value.views[0]?.nodes)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
    input.views[0]!.nodes[1]!.props.label = "Mutated";
    expect(result.value.views[0]?.nodes[1]?.props.label).toBe("From");
  });

  it("rejects orphaned, cyclic, and ambiguously ordered nodes", () => {
    const orphan = document();
    orphan.views[0]!.nodes[1]!.parentId = "missing";
    expect(parseStudioExperienceDocument(orphan)).toMatchObject({ ok: false, issue: { code: "INVALID_PARENT" } });

    const cycle = document();
    cycle.views[0]!.nodes[0]!.parentId = "origin";
    cycle.views[0]!.nodes[0]!.slot = "content";
    expect(parseStudioExperienceDocument(cycle)).toMatchObject({ ok: false, issue: { code: "NODE_CYCLE" } });

    const duplicateOrder = document();
    duplicateOrder.views[0]!.nodes[2]!.order = 0;
    expect(parseStudioExperienceDocument(duplicateOrder)).toMatchObject({ ok: false, issue: { code: "DUPLICATE_NODE_ORDER" } });
  });

  it("fails closed for dangling bindings and routes", () => {
    const binding = document();
    binding.bindings[0]!.nodeId = "missing";
    expect(parseStudioExperienceDocument(binding)).toMatchObject({ ok: false, issue: { code: "INVALID_BINDING" } });

    const route = document();
    route.interactions[0]!.routes[0]!.viewId = "missing";
    expect(parseStudioExperienceDocument(route)).toMatchObject({ ok: false, issue: { code: "INVALID_ROUTE" } });
  });

  it("rejects duplicate binding targets and duplicate node-event interactions", () => {
    const duplicateBinding = document();
    duplicateBinding.bindings.push({ ...duplicateBinding.bindings[0]!, source: { ...duplicateBinding.bindings[0]!.source } });
    expect(parseStudioExperienceDocument(duplicateBinding)).toMatchObject({ ok: false, issue: { code: "DUPLICATE_BINDING" } });

    const duplicateInteraction = document();
    duplicateInteraction.interactions.push({ ...duplicateInteraction.interactions[0]!, routes: [] });
    expect(parseStudioExperienceDocument(duplicateInteraction)).toMatchObject({ ok: false, issue: { code: "DUPLICATE_INTERACTION" } });
  });

  it("rejects executable and implementation escape hatches as unknown fields", () => {
    for (const field of ["javascript", "html", "css", "endpoint", "url", "callback", "iframe", "puckData"]) {
      expect(parseStudioExperienceDocument({ ...document(), [field]: "forbidden" })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });
});
