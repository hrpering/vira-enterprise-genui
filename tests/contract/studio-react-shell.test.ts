import { describe, expect, it } from "vitest";
import {
  createStudioPuckShellSession,
  ViraExperienceStudio,
} from "../../packages/studio-react/src/index.js";
import type { StudioTrustedRenderContext, StudioTrustedRenderer } from "../../packages/studio-react/src/index.js";

function catalog() {
  return {
    version: "1",
    id: "pegasus.studio.catalog",
    brandId: "pegasus.airlines",
    components: [
      {
        ref: "pegasus.layout.stack",
        label: "Stack",
        category: "layout.structure",
        kind: "layout",
        props: [],
        slots: [{ name: "content", label: "Content" }],
        events: [],
      },
      {
        ref: "pegasus.component.button",
        label: "Button",
        category: "core.action",
        kind: "action",
        props: [
          { key: "label", type: "string", required: true, bindable: false },
          { key: "disabled", type: "boolean", required: false, bindable: true },
        ],
        slots: [],
        events: [{ name: "press", label: "Press" }],
      },
    ],
  };
}

function document() {
  return {
    version: "1",
    id: "pegasus.cheap-flight",
    recipeId: "travel.flight.search",
    entryView: "search",
    views: [
      {
        id: "search",
        nodes: [
          { id: "root", component: "pegasus.layout.stack", order: 0, props: {} },
          { id: "submit", component: "pegasus.component.button", parentId: "root", slot: "content", order: 0, props: { label: "Ucuz bilet bul" } },
        ],
      },
    ],
    bindings: [
      { viewId: "search", nodeId: "submit", prop: "disabled", source: { kind: "state", path: "search.disabled" } },
    ],
    interactions: [
      { viewId: "search", nodeId: "submit", event: "press", actionEvent: "flight.search.submit", routes: [] },
    ],
  };
}

function rendererRegistry(log: StudioTrustedRenderContext[] = []): Record<string, StudioTrustedRenderer> {
  return {
    "pegasus.layout.stack": (context) => {
      log.push(context);
      return "stack";
    },
    "pegasus.component.button": (context) => {
      log.push(context);
      return `button:${String(context.props.label ?? "")}`;
    },
  };
}

type TestComponentConfig = {
  fields: Record<string, unknown>;
  render: (props: Record<string, unknown>) => unknown;
};

type TestConfig = {
  components: Record<string, TestComponentConfig>;
  categories: Record<string, { title: string; components: string[] }>;
};

describe("studio React/Puck shell", () => {
  it("creates executable Puck config only from an exact trusted renderer registry", () => {
    const log: StudioTrustedRenderContext[] = [];
    const session = createStudioPuckShellSession({
      document: document(),
      catalog: catalog(),
      viewId: "search",
      renderers: rendererRegistry(log),
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const config = session.value.config as unknown as TestConfig;
    expect(Object.keys(config.components).sort()).toEqual([
      "pegasus.component.button",
      "pegasus.layout.stack",
    ]);
    expect(config.components["pegasus.layout.stack"]?.fields.content).toMatchObject({ type: "slot" });
    expect(config.categories["core.action"]?.components).toEqual(["pegasus.component.button"]);

    const output = config.components["pegasus.component.button"]?.render({
      id: "submit",
      label: "Search",
      disabled: false,
      puck: { editMode: true },
    });
    expect(output).toBe("button:Search");
    expect(log.at(-1)).toEqual({
      component: "pegasus.component.button",
      nodeId: "submit",
      props: { label: "Search", disabled: false },
    });
    expect(Object.isFrozen(log.at(-1))).toBe(true);
    expect(Object.isFrozen(log.at(-1)?.props)).toBe(true);
  });

  it("snapshots trusted renderer functions instead of reading a mutable registry during render", () => {
    const renderers = rendererRegistry();
    const session = createStudioPuckShellSession({ document: document(), catalog: catalog(), viewId: "search", renderers });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    renderers["pegasus.component.button"] = () => "replaced";

    const config = session.value.config as unknown as TestConfig;
    expect(config.components["pegasus.component.button"]?.render({ id: "submit", label: "Original" })).toBe("button:Original");
  });

  it("fails closed for missing, extra, accessor-backed, or non-function renderers", () => {
    const missing = rendererRegistry();
    delete missing["pegasus.component.button"];
    expect(createStudioPuckShellSession({ document: document(), catalog: catalog(), viewId: "search", renderers: missing })).toMatchObject({
      ok: false,
      issue: { code: "MISSING_RENDERER" },
    });

    const extra = { ...rendererRegistry(), "pegasus.component.secret": () => "secret" };
    expect(createStudioPuckShellSession({ document: document(), catalog: catalog(), viewId: "search", renderers: extra })).toMatchObject({
      ok: false,
      issue: { code: "EXTRA_RENDERER" },
    });

    const accessor: Record<string, unknown> = { "pegasus.layout.stack": () => "stack" };
    Object.defineProperty(accessor, "pegasus.component.button", { enumerable: true, get: () => () => "unsafe" });
    expect(createStudioPuckShellSession({ document: document(), catalog: catalog(), viewId: "search", renderers: accessor })).toMatchObject({
      ok: false,
      issue: { code: "MISSING_RENDERER" },
    });

    expect(createStudioPuckShellSession({
      document: document(),
      catalog: catalog(),
      viewId: "search",
      renderers: { ...rendererRegistry(), "pegasus.component.button": "not-a-function" },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_RENDERER_REGISTRY" } });
  });

  it("keeps executable renderers out of Puck data and returns a thin React shell element", () => {
    const session = createStudioPuckShellSession({ document: document(), catalog: catalog(), viewId: "search", renderers: rendererRegistry() });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    expect(JSON.stringify(session.value.data)).not.toContain("function");
    expect(JSON.stringify(session.value.data)).not.toContain("renderer");

    const element = ViraExperienceStudio({ session: session.value, headerTitle: "Pegasus Experience Studio", height: "100%" });
    const props = element.props as { config: unknown; data: unknown; headerTitle?: string; height?: string | number };
    expect(props.config).toBe(session.value.config);
    expect(props.data).toBe(session.value.data);
    expect(props.headerTitle).toBe("Pegasus Experience Studio");
    expect(props.height).toBe("100%");
  });
});
