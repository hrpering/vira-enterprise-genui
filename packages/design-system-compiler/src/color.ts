import { curlyReference, objectReference, record } from "./internal.js";
import type { DesignSystemCompileIssue } from "./types.js";

interface ColorSuccess {
  readonly ok: true;
  readonly value: string;
}

interface ColorFailure {
  readonly ok: false;
  readonly issue: DesignSystemCompileIssue;
}

type ColorResult = ColorSuccess | ColorFailure;

interface ComponentRange {
  readonly min?: number;
  readonly max?: number;
  readonly maxExclusive?: boolean;
}

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const UNIT: ComponentRange = { min: 0, max: 1 };
const PERCENT: ComponentRange = { min: 0, max: 100 };
const HUE: ComponentRange = { min: 0, max: 360, maxExclusive: true };
const UNBOUNDED: ComponentRange = {};
const NON_NEGATIVE: ComponentRange = { min: 0 };

const DTCG_2025_10_COMPONENT_RANGES: Readonly<Record<string, readonly ComponentRange[]>> = Object.freeze({
  srgb: [UNIT, UNIT, UNIT],
  "srgb-linear": [UNIT, UNIT, UNIT],
  hsl: [HUE, PERCENT, PERCENT],
  hwb: [HUE, PERCENT, PERCENT],
  lab: [PERCENT, UNBOUNDED, UNBOUNDED],
  lch: [PERCENT, NON_NEGATIVE, HUE],
  oklab: [UNIT, UNBOUNDED, UNBOUNDED],
  oklch: [UNIT, NON_NEGATIVE, HUE],
  "display-p3": [UNIT, UNIT, UNIT],
  "a98-rgb": [UNIT, UNIT, UNIT],
  "prophoto-rgb": [UNIT, UNIT, UNIT],
  rec2020: [UNIT, UNIT, UNIT],
  "xyz-d65": [UNIT, UNIT, UNIT],
  "xyz-d50": [UNIT, UNIT, UNIT],
});

function failure(
  code: DesignSystemCompileIssue["code"],
  path: string,
  message: string,
): ColorFailure {
  return { ok: false, issue: { code, path, message } };
}

function normalizedHex(value: unknown, path: string): ColorResult | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !HEX_COLOR.test(value)) {
    return failure("INVALID_COLOR", path, "DTCG color hex fallback must be a six-digit CSS hex value");
  }
  return { ok: true, value: value.toUpperCase() };
}

function validateComponents(
  colorSpace: string,
  components: readonly unknown[],
  path: string,
): DesignSystemCompileIssue | undefined {
  const ranges = DTCG_2025_10_COMPONENT_RANGES[colorSpace];
  if (!ranges) {
    return { code: "UNSUPPORTED_COLOR_SPACE", path: path.replace(/\.components$/, ".colorSpace"), message: "colorSpace must be a DTCG 2025.10 supported color space" };
  }
  if (components.length !== ranges.length) {
    return { code: "INVALID_COLOR", path, message: `DTCG ${colorSpace} colors must contain exactly ${ranges.length} components` };
  }
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    if (component === "none") continue;
    if (typeof component !== "number" || !Number.isFinite(component)) {
      return { code: "INVALID_COLOR", path: `${path}[${index}]`, message: "color components must be finite numbers or none" };
    }
    const range = ranges[index];
    if (!range) {
      return { code: "INVALID_COLOR", path: `${path}[${index}]`, message: "color component range is unavailable" };
    }
    if (range.min !== undefined && component < range.min) {
      return { code: "INVALID_COLOR", path: `${path}[${index}]`, message: `component is below the DTCG ${colorSpace} range` };
    }
    if (range.max !== undefined) {
      const exceeds = range.maxExclusive ? component >= range.max : component > range.max;
      if (exceeds) {
        return { code: "INVALID_COLOR", path: `${path}[${index}]`, message: `component is above the DTCG ${colorSpace} range` };
      }
    }
  }
  return undefined;
}

function srgbHex(components: readonly unknown[], path: string): ColorResult {
  const bytes: number[] = [];
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    if (component === "none") {
      return failure("INVALID_COLOR", `${path}[${index}]`, "sRGB none components require a valid hex fallback");
    }
    if (typeof component !== "number") {
      return failure("INVALID_COLOR", `${path}[${index}]`, "sRGB numeric component expected after validation");
    }
    bytes.push(Math.round(component * 255));
  }
  return {
    ok: true,
    value: `#${bytes.map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join("")}`,
  };
}

export function compileDtcgColor(value: unknown, path: string): ColorResult {
  if (curlyReference(value) || objectReference(value)) {
    return failure("UNSUPPORTED_REFERENCE", path, "DTCG token references are not resolved by compiler v1");
  }

  const color = record(value);
  if (!color) {
    return failure("INVALID_COLOR", path, "color token value must be a DTCG color object");
  }
  const allowed = new Set(["colorSpace", "components", "alpha", "hex"]);
  const unknown = Object.keys(color).sort().find((key) => !allowed.has(key));
  if (unknown) {
    if (unknown === "$ref") {
      return failure("UNSUPPORTED_REFERENCE", `${path}.$ref`, "DTCG JSON Pointer references are not resolved by compiler v1");
    }
    return failure("INVALID_COLOR", `${path}.${unknown}`, `unsupported DTCG color field: ${unknown}`);
  }

  if (typeof color.colorSpace !== "string" || !Object.hasOwn(DTCG_2025_10_COMPONENT_RANGES, color.colorSpace)) {
    return failure("UNSUPPORTED_COLOR_SPACE", `${path}.colorSpace`, "colorSpace must be a DTCG 2025.10 supported color space");
  }
  if (!Array.isArray(color.components)) {
    return failure("INVALID_COLOR", `${path}.components`, "DTCG color components must be an array");
  }
  const componentIssue = validateComponents(color.colorSpace, color.components, `${path}.components`);
  if (componentIssue) return { ok: false, issue: componentIssue };

  const alpha = Object.hasOwn(color, "alpha") ? color.alpha : 1;
  if (typeof alpha !== "number" || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    return failure("INVALID_COLOR", `${path}.alpha`, "alpha must be a finite number from 0 to 1");
  }
  if (alpha !== 1) {
    return failure("INVALID_COLOR", `${path}.alpha`, "Studio design colors are opaque in the current canonical contract");
  }

  const fallback = normalizedHex(color.hex, `${path}.hex`);
  if (fallback && !fallback.ok) return fallback;

  if (color.colorSpace !== "srgb") {
    if (fallback?.ok) return fallback;
    return failure(
      "UNSUPPORTED_COLOR_SPACE",
      `${path}.colorSpace`,
      `DTCG ${color.colorSpace} requires an opaque six-digit hex fallback in compiler v1`,
    );
  }

  const hasNone = color.components.some((component) => component === "none");
  if (hasNone) {
    if (fallback?.ok) return fallback;
    return failure("INVALID_COLOR", `${path}.components`, "sRGB none components require a valid hex fallback");
  }

  const converted = srgbHex(color.components, `${path}.components`);
  if (!converted.ok) return converted;
  if (fallback?.ok && fallback.value !== converted.value) {
    return failure("INVALID_COLOR", `${path}.hex`, "sRGB hex fallback must match the numeric components");
  }
  return converted;
}
