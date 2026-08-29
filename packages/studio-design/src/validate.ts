import { validateStudioDocumentAgainstCatalog } from "@vira-enterprise-genui/studio-catalog";
import {
  STUDIO_DESIGN_COLOR_PATTERN,
  STUDIO_DESIGN_PROP_KEYS,
} from "./types.js";
import type {
  StudioDesignDocumentValidationCode,
  StudioDesignDocumentValidationResult,
} from "./types.js";

function failure(code: StudioDesignDocumentValidationCode, path: string, message: string): StudioDesignDocumentValidationResult {
  return { ok: false, issue: { code, path, message } };
}

function validNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validateColor(value: unknown, path: string): StudioDesignDocumentValidationResult | undefined {
  if (typeof value !== "string" || !STUDIO_DESIGN_COLOR_PATTERN.test(value)) {
    return failure("INVALID_COLOR", path, "design colors must use #RRGGBB values");
  }
  return undefined;
}

export function validateStudioDesignDocument(
  documentInput: unknown,
  catalogInput: unknown,
): StudioDesignDocumentValidationResult {
  const base = validateStudioDocumentAgainstCatalog(documentInput, catalogInput);
  if (!base.ok) {
    const code = base.issue.code === "INVALID_CATALOG" ? "INVALID_CATALOG" : "INVALID_DOCUMENT";
    return failure(code, base.issue.path, base.issue.message);
  }

  const colorKeys = [
    STUDIO_DESIGN_PROP_KEYS.color,
    STUDIO_DESIGN_PROP_KEYS.background,
    STUDIO_DESIGN_PROP_KEYS.gradientFrom,
    STUDIO_DESIGN_PROP_KEYS.gradientTo,
  ] as const;
  const numericBounds = [
    [STUDIO_DESIGN_PROP_KEYS.gradientAngle, 0, 360],
    [STUDIO_DESIGN_PROP_KEYS.fontSize, 8, 160],
    [STUDIO_DESIGN_PROP_KEYS.lineHeight, 0.8, 3],
    [STUDIO_DESIGN_PROP_KEYS.letterSpacing, -8, 24],
    [STUDIO_DESIGN_PROP_KEYS.padding, 0, 192],
    [STUDIO_DESIGN_PROP_KEYS.gap, 0, 192],
    [STUDIO_DESIGN_PROP_KEYS.radius, 0, 128],
  ] as const;

  for (let viewIndex = 0; viewIndex < base.value.views.length; viewIndex += 1) {
    const view = base.value.views[viewIndex];
    if (!view) continue;
    for (let nodeIndex = 0; nodeIndex < view.nodes.length; nodeIndex += 1) {
      const node = view.nodes[nodeIndex];
      if (!node) continue;
      const nodePath = `$.document.views[${viewIndex}].nodes[${nodeIndex}].props`;

      for (const key of colorKeys) {
        if (!Object.hasOwn(node.props, key)) continue;
        const issue = validateColor(node.props[key], `${nodePath}.${key}`);
        if (issue) return issue;
      }

      for (const [key, min, max] of numericBounds) {
        if (!Object.hasOwn(node.props, key)) continue;
        if (!validNumber(node.props[key], min, max)) {
          return failure("OUT_OF_RANGE", `${nodePath}.${key}`, `design numeric value must be between ${min} and ${max}`);
        }
      }

      if (node.props[STUDIO_DESIGN_PROP_KEYS.backgroundMode] === "gradient") {
        if (!Object.hasOwn(node.props, STUDIO_DESIGN_PROP_KEYS.gradientFrom)
          || !Object.hasOwn(node.props, STUDIO_DESIGN_PROP_KEYS.gradientTo)) {
          return failure("INVALID_GRADIENT", `${nodePath}.${STUDIO_DESIGN_PROP_KEYS.backgroundMode}`, "gradient background requires start and end colors");
        }
      }
    }
  }

  return { ok: true, value: base.value };
}
