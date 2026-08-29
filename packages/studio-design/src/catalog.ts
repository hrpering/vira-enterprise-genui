import {
  createStudioComponentCatalog,
} from "@vira-enterprise-genui/studio-catalog";
import type {
  StudioCatalogPropDefinition,
  StudioComponentCatalog,
} from "@vira-enterprise-genui/studio-catalog";
import {
  STUDIO_DESIGN_COLOR_PATTERN,
  STUDIO_DESIGN_MAX_FONTS,
  STUDIO_DESIGN_MAX_PALETTE_COLORS,
  STUDIO_DESIGN_PROP_KEYS,
} from "./types.js";
import type {
  StudioDesignCatalogOptions,
  StudioDesignCatalogResult,
  StudioDesignCatalogValidationCode,
  StudioDesignLayout,
  StudioDesignShadow,
} from "./types.js";

const defaultShadows: readonly StudioDesignShadow[] = ["none", "sm", "md", "lg", "xl"];
const defaultLayouts: readonly StudioDesignLayout[] = ["block", "row", "column", "grid2", "grid3"];
const allowedShadows = new Set<StudioDesignShadow>(defaultShadows);
const allowedLayouts = new Set<StudioDesignLayout>(defaultLayouts);
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

function failure(code: StudioDesignCatalogValidationCode, path: string, message: string): StudioDesignCatalogResult {
  return { ok: false, issue: { code, path, message } };
}

function validFont(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 128
    && value.trim() === value
    && !controlCharacterPattern.test(value);
}

function uniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function enumProp(key: string, options: readonly string[]): StudioCatalogPropDefinition {
  return { key, type: "enum", required: false, bindable: false, options };
}

function numberProp(key: string): StudioCatalogPropDefinition {
  return { key, type: "number", required: false, bindable: false };
}

function colorProp(key: string, mode: "any" | "palette", colors: readonly string[]): StudioCatalogPropDefinition {
  return mode === "palette"
    ? enumProp(key, colors)
    : { key, type: "string", required: false, bindable: false };
}

function createDesignProps(input: {
  readonly colorMode: "any" | "palette";
  readonly colors: readonly string[];
  readonly fonts: readonly string[];
  readonly allowGradient: boolean;
  readonly shadows: readonly StudioDesignShadow[];
  readonly layouts: readonly StudioDesignLayout[];
}): readonly StudioCatalogPropDefinition[] {
  const props: StudioCatalogPropDefinition[] = [
    colorProp(STUDIO_DESIGN_PROP_KEYS.color, input.colorMode, input.colors),
    enumProp(STUDIO_DESIGN_PROP_KEYS.backgroundMode, input.allowGradient ? ["none", "solid", "gradient"] : ["none", "solid"]),
    colorProp(STUDIO_DESIGN_PROP_KEYS.background, input.colorMode, input.colors),
  ];

  if (input.allowGradient) {
    props.push(
      colorProp(STUDIO_DESIGN_PROP_KEYS.gradientFrom, input.colorMode, input.colors),
      colorProp(STUDIO_DESIGN_PROP_KEYS.gradientTo, input.colorMode, input.colors),
      numberProp(STUDIO_DESIGN_PROP_KEYS.gradientAngle),
    );
  }

  if (input.fonts.length > 0) props.push(enumProp(STUDIO_DESIGN_PROP_KEYS.font, input.fonts));
  props.push(
    numberProp(STUDIO_DESIGN_PROP_KEYS.fontSize),
    enumProp(STUDIO_DESIGN_PROP_KEYS.fontWeight, ["400", "500", "600", "700", "800"]),
    numberProp(STUDIO_DESIGN_PROP_KEYS.lineHeight),
    numberProp(STUDIO_DESIGN_PROP_KEYS.letterSpacing),
    numberProp(STUDIO_DESIGN_PROP_KEYS.padding),
    numberProp(STUDIO_DESIGN_PROP_KEYS.gap),
    numberProp(STUDIO_DESIGN_PROP_KEYS.radius),
    enumProp(STUDIO_DESIGN_PROP_KEYS.shadow, input.shadows),
    enumProp(STUDIO_DESIGN_PROP_KEYS.align, ["left", "center", "right"]),
    enumProp(STUDIO_DESIGN_PROP_KEYS.width, ["auto", "full", "fit"]),
    enumProp(STUDIO_DESIGN_PROP_KEYS.layout, input.layouts),
  );
  return props;
}

function normalizedOptions(options: StudioDesignCatalogOptions):
  | { readonly ok: true; readonly value: {
      readonly componentRefs?: readonly string[];
      readonly colorMode: "any" | "palette";
      readonly colors: readonly string[];
      readonly fonts: readonly string[];
      readonly allowGradient: boolean;
      readonly shadows: readonly StudioDesignShadow[];
      readonly layouts: readonly StudioDesignLayout[];
    } }
  | { readonly ok: false; readonly result: StudioDesignCatalogResult } {
  const colorMode = options.colorMode ?? "any";
  if (colorMode !== "any" && colorMode !== "palette") {
    return { ok: false, result: failure("INVALID_OPTIONS", "$.options.colorMode", "colorMode must be any or palette") };
  }

  const colors = options.colors ?? [];
  if (!Array.isArray(colors) || colors.length > STUDIO_DESIGN_MAX_PALETTE_COLORS || !uniqueStrings(colors)) {
    return { ok: false, result: failure("INVALID_OPTIONS", "$.options.colors", "colors must be a bounded unique array") };
  }
  if (colors.some((color) => !STUDIO_DESIGN_COLOR_PATTERN.test(color))) {
    return { ok: false, result: failure("INVALID_OPTIONS", "$.options.colors", "colors must use #RRGGBB values") };
  }
  if (colorMode === "palette" && colors.length === 0) {
    return { ok: false, result: failure("INVALID_OPTIONS", "$.options.colors", "palette color mode requires at least one color") };
  }

  const fonts = options.fonts ?? ["system-ui"];
  if (!Array.isArray(fonts) || fonts.length > STUDIO_DESIGN_MAX_FONTS || !uniqueStrings(fonts) || fonts.some((font) => !validFont(font))) {
    return { ok: false, result: failure("INVALID_OPTIONS", "$.options.fonts", "fonts must be a bounded unique registered-font list") };
  }

  const shadows = options.shadows ?? defaultShadows;
  if (!Array.isArray(shadows) || shadows.length === 0 || !uniqueStrings(shadows) || shadows.some((shadow) => !allowedShadows.has(shadow))) {
    return { ok: false, result: failure("INVALID_OPTIONS", "$.options.shadows", "shadows contains an unsupported preset") };
  }

  const layouts = options.layouts ?? defaultLayouts;
  if (!Array.isArray(layouts) || layouts.length === 0 || !uniqueStrings(layouts) || layouts.some((layout) => !allowedLayouts.has(layout))) {
    return { ok: false, result: failure("INVALID_OPTIONS", "$.options.layouts", "layouts contains an unsupported layout") };
  }

  if (options.allowGradient !== undefined && typeof options.allowGradient !== "boolean") {
    return { ok: false, result: failure("INVALID_OPTIONS", "$.options.allowGradient", "allowGradient must be boolean") };
  }

  if (options.componentRefs !== undefined && (!Array.isArray(options.componentRefs) || !uniqueStrings(options.componentRefs))) {
    return { ok: false, result: failure("INVALID_OPTIONS", "$.options.componentRefs", "componentRefs must be a unique array") };
  }

  return {
    ok: true,
    value: {
      ...(options.componentRefs === undefined ? {} : { componentRefs: options.componentRefs }),
      colorMode,
      colors,
      fonts,
      allowGradient: options.allowGradient ?? true,
      shadows,
      layouts,
    },
  };
}

export function createStudioDesignCatalog(
  catalogInput: unknown,
  options: StudioDesignCatalogOptions = {},
): StudioDesignCatalogResult {
  const catalog = createStudioComponentCatalog(catalogInput);
  if (!catalog.ok) return failure("INVALID_CATALOG", `$.catalog${catalog.issue.path.slice(1)}`, catalog.issue.message);
  const normalized = normalizedOptions(options);
  if (!normalized.ok) return normalized.result;

  const selected = normalized.value.componentRefs === undefined
    ? new Set(catalog.value.components.map((component) => component.ref))
    : new Set(normalized.value.componentRefs);
  for (const ref of selected) {
    if (!catalog.value.components.some((component) => component.ref === ref)) {
      return failure("UNKNOWN_COMPONENT", "$.options.componentRefs", `component is not registered in the base catalog: ${ref}`);
    }
  }

  const designProps = createDesignProps(normalized.value);
  const reserved = new Set(designProps.map((prop) => prop.key));
  for (let componentIndex = 0; componentIndex < catalog.value.components.length; componentIndex += 1) {
    const component = catalog.value.components[componentIndex];
    if (!component || !selected.has(component.ref)) continue;
    const collision = component.props.find((prop) => reserved.has(prop.key));
    if (collision) {
      return failure(
        "PROP_COLLISION",
        `$.catalog.components[${componentIndex}].props`,
        `selected component already declares reserved Studio design prop: ${collision.key}`,
      );
    }
  }

  const components: StudioComponentCatalog["components"] = catalog.value.components.map((component) => selected.has(component.ref)
    ? { ...component, props: [...component.props, ...designProps] }
    : component);
  const result = createStudioComponentCatalog({
    version: catalog.value.version,
    id: catalog.value.id,
    brandId: catalog.value.brandId,
    components,
  });
  return result.ok
    ? { ok: true, value: result.value }
    : failure("INVALID_OPTIONS", `$.catalog${result.issue.path.slice(1)}`, result.issue.message);
}
