import { describe, expect, it } from "vitest";
import { createElement } from "react";
import type { ReactNode } from "react";
import { createStudioDesignCatalog } from "../../packages/studio-design/src/index.js";
import { createStudioReactDesignState } from "../../packages/studio-design-react/src/index.js";
import { renderStudioRuntimeReactView } from "../../packages/studio-runtime-react/src/index.js";
import type { StudioRuntimeReactRenderContext } from "../../packages/studio-runtime-react/src/index.js";
import type { StudioRuntimeSession } from "@vira-enterprise-genui/studio-runtime";

function baseCatalog() {
  return {
    version: "1",
    id: "pegasus.runtime.catalog",
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
        ref: "pegasus.component.card",
        label: "Card",
        category: "travel.flight",
        kind: "content",
        props: [{ key: "title", type: "string", required: true, bindable: false }],
        slots: [],
        events: [{ name: "select", label: "Select" }],
      },
    ],
  };
}

function catalog() {
  const result = createStudioDesignCatalog(baseCatalog(), {
    colorMode: "any",
    fonts: ["Inter", "Pegasus Sans"],
    allowGradient: true,
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

const rootProps = {
  designbackgroundmode: "gradient",
  designgradientfrom: "#101014",
  designgradientto: "#3A2B7A",
  designgradientangle: 135,
  designpadding: 32,
  designgap: 16,
  designradius: 24,
  designlayout: "column",
};

const cardProps = {
  title: "SAW → CDG",
  designcolor: "#FFFFFF",
  designfont: "Inter",
  designfontsize: 28,
  designweight: "700",
};

function runtimeSession(dispatches: Array<{ nodeId: string; event: string; payload?: unknown }>): StudioRuntimeSession {
  return {
    currentView: () => ({
      ok: true,
      value: {
        experienceId: "pegasus.flight-runtime",
        viewId: "results",
        nodes: [
          { id: "root", component: "pegasus.layout.stack", order: 0, props: rootProps },
          { id: "flight", component: "pegasus.component.card", parentId: "root", slot: "content", order: 0, props: cardProps },
        ],
      },
    }),
    dispatch: (input: Parameters<StudioRuntimeSession["dispatch"]>[0]) => {
      dispatches.push(input);
      return { ok: true, value: {} } as ReturnType<StudioRuntimeSession["dispatch"]>;
    },
  } as unknown as StudioRuntimeSession;
}

type ElementLike = {
  readonly props?: {
    readonly style?: Readonly<Record<string, unknown>>;
    readonly children?: ReactNode | readonly ReactNode[];
  };
};

describe("Studio React runtime design parity", () => {
  it("uses the same safe design adapter for published runtime output", () => {
    const previewDesign = createStudioReactDesignState(rootProps);
    expect(previewDesign.style).toMatchObject({
      background: "linear-gradient(135deg, #101014, #3A2B7A)",
      padding: "32px",
      gap: "16px",
      borderRadius: "24px",
      display: "flex",
      flexDirection: "column",
    });

    const dispatches: Array<{ nodeId: string; event: string; payload?: unknown }> = [];
    let cardContext: StudioRuntimeReactRenderContext | undefined;
    const rendered = renderStudioRuntimeReactView({
      session: runtimeSession(dispatches),
      componentCatalog: catalog(),
      renderers: {
        "pegasus.layout.stack": (context: StudioRuntimeReactRenderContext) => createElement("section", null, ...(context.slots.content ?? [])),
        "pegasus.component.card": (context: StudioRuntimeReactRenderContext) => {
          cardContext = context;
          return createElement("article", null, context.props.title as string);
        },
      },
    });
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;

    const fragment = rendered.value as ElementLike;
    const root = fragment.props?.children as ElementLike | undefined;
    expect(root?.props?.style).toEqual(previewDesign.style);
    expect(cardContext?.props).toEqual({ title: "SAW → CDG" });
    expect(Object.keys(cardContext?.slots ?? {})).toEqual([]);

    const selected = cardContext?.emit("select", { flightId: "PC201" });
    expect(selected).toMatchObject({ ok: true });
    expect(dispatches).toEqual([{ nodeId: "flight", event: "select", payload: { flightId: "PC201" } }]);

    const denied = cardContext?.emit("admin", { unsafe: true });
    expect(denied).toMatchObject({ ok: false, stage: "studio", issue: { code: "INTERACTION_NOT_FOUND" } });
    expect(dispatches.length).toBe(1);
  });

  it("fails closed when a renderer registry is incomplete", () => {
    const rendered = renderStudioRuntimeReactView({
      session: runtimeSession([]),
      componentCatalog: catalog(),
      renderers: {
        "pegasus.layout.stack": (context: StudioRuntimeReactRenderContext) => createElement("section", null, ...(context.slots.content ?? [])),
      },
    });
    expect(rendered).toMatchObject({ ok: false, issue: { code: "MISSING_RENDERER" } });
  });
});
