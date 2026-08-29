import {
  isStudioDesignPropKey,
  resolveStudioDesignProps,
} from "@vira-enterprise-genui/studio-design";
import type { CSSProperties } from "react";

const shadows: Readonly<Record<string, string>> = Object.freeze({
  none: "none",
  sm: "0 1px 2px rgba(0,0,0,0.08)",
  md: "0 6px 18px rgba(0,0,0,0.12)",
  lg: "0 14px 36px rgba(0,0,0,0.16)",
  xl: "0 24px 64px rgba(0,0,0,0.20)",
});

export interface StudioReactDesignState {
  readonly props: Readonly<Record<string, unknown>>;
  readonly style?: CSSProperties;
}

function styleFromResolved(input: ReturnType<typeof resolveStudioDesignProps> & { readonly ok: true }): CSSProperties {
  const design = input.value;
  const style: CSSProperties = { boxSizing: "border-box" };
  if (design.color !== undefined) style.color = design.color;
  if (design.background?.type === "solid") style.backgroundColor = design.background.color;
  if (design.background?.type === "linear-gradient") {
    style.background = `linear-gradient(${design.background.angle}deg, ${design.background.from}, ${design.background.to})`;
  }
  if (design.fontFamily !== undefined) style.fontFamily = design.fontFamily;
  if (design.fontSize !== undefined) style.fontSize = `${design.fontSize}px`;
  if (design.fontWeight !== undefined) style.fontWeight = design.fontWeight;
  if (design.lineHeight !== undefined) style.lineHeight = design.lineHeight;
  if (design.letterSpacing !== undefined) style.letterSpacing = `${design.letterSpacing}px`;
  if (design.padding !== undefined) style.padding = `${design.padding}px`;
  if (design.gap !== undefined) style.gap = `${design.gap}px`;
  if (design.radius !== undefined) style.borderRadius = `${design.radius}px`;
  if (design.shadow !== undefined) style.boxShadow = shadows[design.shadow];
  if (design.align !== undefined) style.textAlign = design.align;
  if (design.width === "full") style.width = "100%";
  if (design.width === "fit") style.width = "fit-content";
  if (design.width === "auto") style.width = "auto";
  if (design.layout === "row") {
    style.display = "flex";
    style.flexDirection = "row";
  } else if (design.layout === "column") {
    style.display = "flex";
    style.flexDirection = "column";
  } else if (design.layout === "grid2") {
    style.display = "grid";
    style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  } else if (design.layout === "grid3") {
    style.display = "grid";
    style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
  } else if (design.layout === "block") {
    style.display = "block";
  }
  return style;
}

export function createStudioReactDesignState(renderProps: Readonly<Record<string, unknown>>): StudioReactDesignState {
  const props: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  let hasDesign = false;
  for (const [key, value] of Object.entries(renderProps)) {
    if (key === "id" || key === "puck") continue;
    if (isStudioDesignPropKey(key)) {
      hasDesign = true;
      continue;
    }
    props[key] = value;
  }
  if (!hasDesign) return { props: Object.freeze(props) };
  const design = resolveStudioDesignProps(renderProps);
  if (!design.ok) return { props: Object.freeze(props) };
  return { props: Object.freeze(props), style: styleFromResolved(design) };
}
