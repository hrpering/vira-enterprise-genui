import { describe, expect, it } from "vitest";
import {
  createStudioDesignCatalog,
  resolveStudioDesignProps,
  validateStudioDesignDocument,
} from "../../packages/studio-design/src/index.js";
import { createStudioPuckEditorMetadata } from "../../packages/studio-puck-adapter/src/index.js";
import { createStudioPuckShellSession } from "../../packages/studio-react/src/index.js";

function baseCatalog() {
  return {
    version: "1",
    id: "pegasus.studio.catalog",
    brandId: "pegasus.airlines",
    components: [{
      ref: "pegasus.component.card",
      label: "Card",
      category: "content.card",
      kind: "content",
      props: [{ key: "title", type: "string", required: true, bindable: false }],
      slots: [],
      events: [],
    }],
  };
}

function styledDocument() {
  return {
    version: "1",
    id: "pegasus.modern-flight",
    recipeId: "travel.flight.modern",
    entryView: "main",
    views: [{
      id: "main",
      nodes: [{
        id: "hero-card",
        component: "pegasus.component.card",
        order: 0,
        props: {
          title: "Istanbul to Paris",
          designcolor: "#FFFFFF",
          designbackgroundmode: "gradient",
          designgradientfrom: "#101014",
          designgradientto: "#3A2B7A",
          designgradientangle: 135,
          designfont: "Inter",
          designfontsize: 48,
          designweight: "700",
          designlineheight: 1.1,
          designletterspacing: -1,
          designpadding: 32,
          designgap: 16,
          designradius: 24,
          designshadow: "lg",
          designalign: "left",
          designwidth: "full",
          designlayout: "column",
        },
      }],
    }],
    bindings: [],
    interactions: [],
  };
}

function designCatalog() {
  const result = createStudioDesignCatalog(baseCatalog(), {
    colorMode: "any",
    fonts: ["Inter", "Geist", "Pegasus Sans"],
    allowGradient: true,
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function mutableDocument() {
  return JSON.parse(JSON.stringify(styledDocument())) as ReturnType<typeof styledDocument>;
}

describe("Studio human design controls", () => {
  it("augments brand components with bounded design controls without changing StudioDocument schema", () => {
    const catalog = designCatalog();
    const card = catalog.components[0];
    expect(card?.props.find((prop) => prop.key === "designcolor")).toMatchObject({ type: "string", required: false, bindable: false });
    expect(card?.props.find((prop) => prop.key === "designfont")).toMatchObject({ type: "enum", options: ["Inter", "Geist", "Pegasus Sans"] });
    expect(card?.props.find((prop) => prop.key === "designlayout")).toMatchObject({ type: "enum", options: ["block", "row", "column", "grid2", "grid3"] });
  });

  it("supports brand-locked palettes as an alternative to any safe hex color", () => {
    const result = createStudioDesignCatalog(baseCatalog(), {
      colorMode: "palette",
      colors: ["#FECB00", "#111111", "#FFFFFF"],
      fonts: ["Pegasus Sans"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.components[0]?.props.find((prop) => prop.key === "designcolor")).toMatchObject({
      type: "enum",
      options: ["#FECB00", "#111111", "#FFFFFF"],
    });
  });

  it("maps color props to Puck custom color controls and numeric props to bounded native fields", () => {
    const metadata = createStudioPuckEditorMetadata(designCatalog());
    expect(metadata.ok).toBe(true);
    if (!metadata.ok) return;
    const card = metadata.value.components[0];
    expect(card?.fields.designcolor).toEqual({ type: "color", label: "Text color" });
    expect(card?.fields.designfontsize).toEqual({ type: "number", label: "Font size", min: 8, max: 160, step: 1 });
    expect(card?.fields.designradius).toEqual({ type: "number", label: "Radius", min: 0, max: 128, step: 1 });
    expect(card?.fields.designfont).toMatchObject({ type: "select", label: "Font" });
  });

  it("renders human-selected design through the trusted Studio React wrapper while hiding design props from brand renderers", () => {
    let rendererProps: Readonly<Record<string, unknown>> | undefined;
    const session = createStudioPuckShellSession({
      document: styledDocument(),
      catalog: designCatalog(),
      viewId: "main",
      renderers: {
        "pegasus.component.card": (context: { readonly props: Readonly<Record<string, unknown>> }) => {
          rendererProps = context.props;
          return "Pegasus card";
        },
      },
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const config = session.value.config as unknown as {
      components: Record<string, {
        fields: Record<string, { type?: string }>;
        render: (props: Record<string, unknown>) => unknown;
      }>;
    };
    const component = config.components["pegasus.component.card"];
    expect(component?.fields.designcolor?.type).toBe("custom");
    const rendered = component?.render({ id: "hero-card", ...styledDocument().views[0]!.nodes[0]!.props }) as {
      props?: { style?: Record<string, unknown> };
    } | undefined;
    expect(rendererProps).toEqual({ title: "Istanbul to Paris" });
    expect(rendered?.props?.style).toMatchObject({
      color: "#FFFFFF",
      background: "linear-gradient(135deg, #101014, #3A2B7A)",
      fontFamily: "Inter",
      fontSize: "48px",
      padding: "32px",
      gap: "16px",
      borderRadius: "24px",
      width: "100%",
      display: "flex",
      flexDirection: "column",
    });
  });

  it("fails closed on CSS-like color injection, out-of-range sizing, and incomplete gradients", () => {
    const badColor = mutableDocument();
    badColor.views[0]!.nodes[0]!.props.designcolor = "red;background:url(https://evil.example)";
    expect(validateStudioDesignDocument(badColor, designCatalog())).toMatchObject({ ok: false, issue: { code: "INVALID_COLOR" } });

    const huge = mutableDocument();
    huge.views[0]!.nodes[0]!.props.designfontsize = 9999;
    expect(validateStudioDesignDocument(huge, designCatalog())).toMatchObject({ ok: false, issue: { code: "OUT_OF_RANGE" } });

    const gradient = mutableDocument();
    delete (gradient.views[0]!.nodes[0]!.props as Record<string, unknown>).designgradientto;
    expect(validateStudioDesignDocument(gradient, designCatalog())).toMatchObject({ ok: false, issue: { code: "INVALID_GRADIENT" } });
  });

  it("resolves only the safe design grammar and never returns raw CSS", () => {
    const result = resolveStudioDesignProps(styledDocument().views[0]!.nodes[0]!.props);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      color: "#FFFFFF",
      fontFamily: "Inter",
      fontSize: 48,
      radius: 24,
      shadow: "lg",
      layout: "column",
      background: { type: "linear-gradient", from: "#101014", to: "#3A2B7A", angle: 135 },
    });
    expect(Object.keys(result.value)).not.toContain("css");
    expect(Object.keys(result.value)).not.toContain("style");
  });
});
