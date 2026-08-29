import {
  STUDIO_DESIGN_PROP_KEYS,
} from "./types.js";
import type {
  StudioDesignControlDescriptor,
  StudioDesignPropKey,
} from "./types.js";

const descriptors: Readonly<Record<StudioDesignPropKey, StudioDesignControlDescriptor>> = Object.freeze({
  [STUDIO_DESIGN_PROP_KEYS.color]: { label: "Text color", control: "color" },
  [STUDIO_DESIGN_PROP_KEYS.backgroundMode]: { label: "Background", control: "default" },
  [STUDIO_DESIGN_PROP_KEYS.background]: { label: "Background color", control: "color" },
  [STUDIO_DESIGN_PROP_KEYS.gradientFrom]: { label: "Gradient start", control: "color" },
  [STUDIO_DESIGN_PROP_KEYS.gradientTo]: { label: "Gradient end", control: "color" },
  [STUDIO_DESIGN_PROP_KEYS.gradientAngle]: { label: "Gradient angle", control: "default", min: 0, max: 360, step: 1 },
  [STUDIO_DESIGN_PROP_KEYS.font]: { label: "Font", control: "default" },
  [STUDIO_DESIGN_PROP_KEYS.fontSize]: { label: "Font size", control: "default", min: 8, max: 160, step: 1 },
  [STUDIO_DESIGN_PROP_KEYS.fontWeight]: { label: "Font weight", control: "default" },
  [STUDIO_DESIGN_PROP_KEYS.lineHeight]: { label: "Line height", control: "default", min: 0.8, max: 3, step: 0.1 },
  [STUDIO_DESIGN_PROP_KEYS.letterSpacing]: { label: "Letter spacing", control: "default", min: -8, max: 24, step: 0.5 },
  [STUDIO_DESIGN_PROP_KEYS.padding]: { label: "Padding", control: "default", min: 0, max: 192, step: 1 },
  [STUDIO_DESIGN_PROP_KEYS.gap]: { label: "Gap", control: "default", min: 0, max: 192, step: 1 },
  [STUDIO_DESIGN_PROP_KEYS.radius]: { label: "Radius", control: "default", min: 0, max: 128, step: 1 },
  [STUDIO_DESIGN_PROP_KEYS.shadow]: { label: "Shadow", control: "default" },
  [STUDIO_DESIGN_PROP_KEYS.align]: { label: "Text alignment", control: "default" },
  [STUDIO_DESIGN_PROP_KEYS.width]: { label: "Width", control: "default" },
  [STUDIO_DESIGN_PROP_KEYS.layout]: { label: "Layout", control: "default" },
});

const designKeys = new Set<string>(Object.values(STUDIO_DESIGN_PROP_KEYS));

export function isStudioDesignPropKey(value: string): value is StudioDesignPropKey {
  return designKeys.has(value);
}

export function getStudioDesignControl(key: string): StudioDesignControlDescriptor | undefined {
  if (!isStudioDesignPropKey(key)) return undefined;
  return descriptors[key];
}
