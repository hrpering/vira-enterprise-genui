import {
  STUDIO_DESIGN_COLOR_PATTERN,
  STUDIO_DESIGN_PROP_KEYS,
} from "./types.js";
import type {
  StudioDesignAlign,
  StudioDesignLayout,
  StudioDesignResolveCode,
  StudioDesignResolveResult,
  StudioDesignShadow,
  StudioDesignWidth,
  StudioResolvedDesign,
} from "./types.js";

const shadows = new Set<StudioDesignShadow>(["none", "sm", "md", "lg", "xl"]);
const layouts = new Set<StudioDesignLayout>(["block", "row", "column", "grid2", "grid3"]);
const aligns = new Set<StudioDesignAlign>(["left", "center", "right"]);
const widths = new Set<StudioDesignWidth>(["auto", "full", "fit"]);
const weights = new Set(["400", "500", "600", "700", "800"]);
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

function failure(code: StudioDesignResolveCode, path: string, message: string): StudioDesignResolveResult {
  return { ok: false, issue: { code, path, message } };
}

function ownValue(props: Readonly<Record<string, unknown>>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(props, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function readColor(props: Readonly<Record<string, unknown>>, key: string): string | StudioDesignResolveResult | undefined {
  const value = ownValue(props, key);
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !STUDIO_DESIGN_COLOR_PATTERN.test(value)) {
    return failure("INVALID_COLOR", `$.props.${key}`, "design colors must use #RRGGBB values");
  }
  return value.toUpperCase();
}

function readNumber(
  props: Readonly<Record<string, unknown>>,
  key: string,
  min: number,
  max: number,
): number | StudioDesignResolveResult | undefined {
  const value = ownValue(props, key);
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    return failure("OUT_OF_RANGE", `$.props.${key}`, `design numeric value must be between ${min} and ${max}`);
  }
  return value;
}

function isFailure(value: unknown): value is StudioDesignResolveResult & { readonly ok: false } {
  return typeof value === "object" && value !== null && "ok" in value && (value as { readonly ok?: unknown }).ok === false;
}

export function resolveStudioDesignProps(props: Readonly<Record<string, unknown>>): StudioDesignResolveResult {
  const color = readColor(props, STUDIO_DESIGN_PROP_KEYS.color);
  if (isFailure(color)) return color;
  const background = readColor(props, STUDIO_DESIGN_PROP_KEYS.background);
  if (isFailure(background)) return background;
  const gradientFrom = readColor(props, STUDIO_DESIGN_PROP_KEYS.gradientFrom);
  if (isFailure(gradientFrom)) return gradientFrom;
  const gradientTo = readColor(props, STUDIO_DESIGN_PROP_KEYS.gradientTo);
  if (isFailure(gradientTo)) return gradientTo;
  const gradientAngle = readNumber(props, STUDIO_DESIGN_PROP_KEYS.gradientAngle, 0, 360);
  if (isFailure(gradientAngle)) return gradientAngle;
  const fontSize = readNumber(props, STUDIO_DESIGN_PROP_KEYS.fontSize, 8, 160);
  if (isFailure(fontSize)) return fontSize;
  const lineHeight = readNumber(props, STUDIO_DESIGN_PROP_KEYS.lineHeight, 0.8, 3);
  if (isFailure(lineHeight)) return lineHeight;
  const letterSpacing = readNumber(props, STUDIO_DESIGN_PROP_KEYS.letterSpacing, -8, 24);
  if (isFailure(letterSpacing)) return letterSpacing;
  const padding = readNumber(props, STUDIO_DESIGN_PROP_KEYS.padding, 0, 192);
  if (isFailure(padding)) return padding;
  const gap = readNumber(props, STUDIO_DESIGN_PROP_KEYS.gap, 0, 192);
  if (isFailure(gap)) return gap;
  const radius = readNumber(props, STUDIO_DESIGN_PROP_KEYS.radius, 0, 128);
  if (isFailure(radius)) return radius;

  const fontValue = ownValue(props, STUDIO_DESIGN_PROP_KEYS.font);
  let fontFamily: string | undefined;
  if (fontValue !== undefined) {
    if (typeof fontValue !== "string" || fontValue.length < 1 || fontValue.length > 128 || controlCharacterPattern.test(fontValue)) {
      return failure("INVALID_VALUE", `$.props.${STUDIO_DESIGN_PROP_KEYS.font}`, "font must be one bounded registered font name");
    }
    fontFamily = fontValue;
  }

  const weightValue = ownValue(props, STUDIO_DESIGN_PROP_KEYS.fontWeight);
  let fontWeight: number | undefined;
  if (weightValue !== undefined) {
    if (typeof weightValue !== "string" || !weights.has(weightValue)) {
      return failure("INVALID_VALUE", `$.props.${STUDIO_DESIGN_PROP_KEYS.fontWeight}`, "unsupported font weight");
    }
    fontWeight = Number(weightValue);
  }

  const shadowValue = ownValue(props, STUDIO_DESIGN_PROP_KEYS.shadow);
  let shadow: StudioDesignShadow | undefined;
  if (shadowValue !== undefined) {
    if (typeof shadowValue !== "string" || !shadows.has(shadowValue as StudioDesignShadow)) {
      return failure("INVALID_VALUE", `$.props.${STUDIO_DESIGN_PROP_KEYS.shadow}`, "unsupported shadow preset");
    }
    shadow = shadowValue as StudioDesignShadow;
  }

  const alignValue = ownValue(props, STUDIO_DESIGN_PROP_KEYS.align);
  let align: StudioDesignAlign | undefined;
  if (alignValue !== undefined) {
    if (typeof alignValue !== "string" || !aligns.has(alignValue as StudioDesignAlign)) {
      return failure("INVALID_VALUE", `$.props.${STUDIO_DESIGN_PROP_KEYS.align}`, "unsupported alignment");
    }
    align = alignValue as StudioDesignAlign;
  }

  const widthValue = ownValue(props, STUDIO_DESIGN_PROP_KEYS.width);
  let width: StudioDesignWidth | undefined;
  if (widthValue !== undefined) {
    if (typeof widthValue !== "string" || !widths.has(widthValue as StudioDesignWidth)) {
      return failure("INVALID_VALUE", `$.props.${STUDIO_DESIGN_PROP_KEYS.width}`, "unsupported width");
    }
    width = widthValue as StudioDesignWidth;
  }

  const layoutValue = ownValue(props, STUDIO_DESIGN_PROP_KEYS.layout);
  let layout: StudioDesignLayout | undefined;
  if (layoutValue !== undefined) {
    if (typeof layoutValue !== "string" || !layouts.has(layoutValue as StudioDesignLayout)) {
      return failure("INVALID_VALUE", `$.props.${STUDIO_DESIGN_PROP_KEYS.layout}`, "unsupported layout");
    }
    layout = layoutValue as StudioDesignLayout;
  }

  const mode = ownValue(props, STUDIO_DESIGN_PROP_KEYS.backgroundMode);
  let resolvedBackground: StudioResolvedDesign["background"];
  if (mode === "gradient") {
    if (typeof gradientFrom !== "string" || typeof gradientTo !== "string") {
      return failure("INVALID_GRADIENT", `$.props.${STUDIO_DESIGN_PROP_KEYS.backgroundMode}`, "gradient background requires start and end colors");
    }
    resolvedBackground = {
      type: "linear-gradient",
      from: gradientFrom,
      to: gradientTo,
      angle: typeof gradientAngle === "number" ? gradientAngle : 135,
    };
  } else if (mode === "solid" || (mode === undefined && typeof background === "string")) {
    if (typeof background === "string") resolvedBackground = { type: "solid", color: background };
  } else if (mode !== undefined && mode !== "none") {
    return failure("INVALID_VALUE", `$.props.${STUDIO_DESIGN_PROP_KEYS.backgroundMode}`, "unsupported background mode");
  }

  return {
    ok: true,
    value: Object.freeze({
      ...(typeof color === "string" ? { color } : {}),
      ...(resolvedBackground === undefined ? {} : { background: resolvedBackground }),
      ...(fontFamily === undefined ? {} : { fontFamily }),
      ...(typeof fontSize === "number" ? { fontSize } : {}),
      ...(fontWeight === undefined ? {} : { fontWeight }),
      ...(typeof lineHeight === "number" ? { lineHeight } : {}),
      ...(typeof letterSpacing === "number" ? { letterSpacing } : {}),
      ...(typeof padding === "number" ? { padding } : {}),
      ...(typeof gap === "number" ? { gap } : {}),
      ...(typeof radius === "number" ? { radius } : {}),
      ...(shadow === undefined ? {} : { shadow }),
      ...(align === undefined ? {} : { align }),
      ...(width === undefined ? {} : { width }),
      ...(layout === undefined ? {} : { layout }),
    }),
  };
}
