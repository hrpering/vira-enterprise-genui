import type { StudioComponentCatalog } from "@vira-enterprise-genui/studio-catalog";
import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";

export const STUDIO_DESIGN_MAX_FONTS = 32 as const;
export const STUDIO_DESIGN_MAX_PALETTE_COLORS = 64 as const;
export const STUDIO_DESIGN_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export const STUDIO_DESIGN_PROP_KEYS = Object.freeze({
  color: "designcolor",
  backgroundMode: "designbackgroundmode",
  background: "designbackground",
  gradientFrom: "designgradientfrom",
  gradientTo: "designgradientto",
  gradientAngle: "designgradientangle",
  font: "designfont",
  fontSize: "designfontsize",
  fontWeight: "designweight",
  lineHeight: "designlineheight",
  letterSpacing: "designletterspacing",
  padding: "designpadding",
  gap: "designgap",
  radius: "designradius",
  shadow: "designshadow",
  align: "designalign",
  width: "designwidth",
  layout: "designlayout",
} as const);

export type StudioDesignPropKey = typeof STUDIO_DESIGN_PROP_KEYS[keyof typeof STUDIO_DESIGN_PROP_KEYS];
export type StudioDesignColorMode = "any" | "palette";
export type StudioDesignShadow = "none" | "sm" | "md" | "lg" | "xl";
export type StudioDesignLayout = "block" | "row" | "column" | "grid2" | "grid3";
export type StudioDesignAlign = "left" | "center" | "right";
export type StudioDesignWidth = "auto" | "full" | "fit";

export interface StudioDesignCatalogOptions {
  readonly componentRefs?: readonly string[];
  readonly colorMode?: StudioDesignColorMode;
  readonly colors?: readonly string[];
  readonly fonts?: readonly string[];
  readonly allowGradient?: boolean;
  readonly shadows?: readonly StudioDesignShadow[];
  readonly layouts?: readonly StudioDesignLayout[];
}

export type StudioDesignCatalogValidationCode =
  | "INVALID_CATALOG"
  | "INVALID_OPTIONS"
  | "UNKNOWN_COMPONENT"
  | "PROP_COLLISION";

export interface StudioDesignCatalogValidationIssue {
  readonly code: StudioDesignCatalogValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StudioDesignCatalogResult =
  | { readonly ok: true; readonly value: StudioComponentCatalog }
  | { readonly ok: false; readonly issue: StudioDesignCatalogValidationIssue };

export type StudioDesignDocumentValidationCode =
  | "INVALID_CATALOG"
  | "INVALID_DOCUMENT"
  | "INVALID_COLOR"
  | "OUT_OF_RANGE"
  | "INVALID_GRADIENT";

export interface StudioDesignDocumentValidationIssue {
  readonly code: StudioDesignDocumentValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StudioDesignDocumentValidationResult =
  | { readonly ok: true; readonly value: StudioExperienceDocument }
  | { readonly ok: false; readonly issue: StudioDesignDocumentValidationIssue };

export interface StudioResolvedSolidBackground {
  readonly type: "solid";
  readonly color: string;
}

export interface StudioResolvedGradientBackground {
  readonly type: "linear-gradient";
  readonly from: string;
  readonly to: string;
  readonly angle: number;
}

export interface StudioResolvedDesign {
  readonly color?: string;
  readonly background?: StudioResolvedSolidBackground | StudioResolvedGradientBackground;
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly fontWeight?: number;
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly padding?: number;
  readonly gap?: number;
  readonly radius?: number;
  readonly shadow?: StudioDesignShadow;
  readonly align?: StudioDesignAlign;
  readonly width?: StudioDesignWidth;
  readonly layout?: StudioDesignLayout;
}

export type StudioDesignResolveCode = "INVALID_COLOR" | "OUT_OF_RANGE" | "INVALID_VALUE" | "INVALID_GRADIENT";

export interface StudioDesignResolveIssue {
  readonly code: StudioDesignResolveCode;
  readonly path: string;
  readonly message: string;
}

export type StudioDesignResolveResult =
  | { readonly ok: true; readonly value: StudioResolvedDesign }
  | { readonly ok: false; readonly issue: StudioDesignResolveIssue };

export interface StudioDesignControlDescriptor {
  readonly label: string;
  readonly control: "color" | "default";
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}
