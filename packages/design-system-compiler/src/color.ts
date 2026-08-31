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

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const DTCG_2025_10_COLOR_SPACES = new Set([
  "srgb",
  "srgb-linear",
  "hsl",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "display-p3",
  "a98-rgb",
  "prophoto-rgb",
  "rec2020",
  "xyz-d65",
  "xyz-d50",
]);

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

function srgbHex(components: readonly unknown[], path: string): ColorResult {
  const bytes: number[] = [];
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    if (component === "none") {
      return failure("INVALID_COLOR", `${path}[${index}]`, "sRGB none components require a valid hex fallback");
    }
    if (typeof component !== "number" || !Number.isFinite(component) || component < 0 || component > 1) {
      return failure("INVALID_COLOR", `${path}[${index}]`, "sRGB components must be finite numbers from 0 to 1");
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

  if (typeof color.colorSpace !== "string" || !DTCG_2025_10_COLOR_SPACES.has(color.colorSpace)) {
    return failure("UNSUPPORTED_COLOR_SPACE", `${path}.colorSpace`, "colorSpace must be a DTCG 2025.10 supported color space");
  }
  if (!Array.isArray(color.components) || color.components.length !== 3) {
    return failure("INVALID_COLOR", `${path}.components`, "DTCG 2025.10 color values must contain exactly three components");
  }
  for (let index = 0; index < color.components.length; index += 1) {
    const component = color.components[index];
    if (component !== "none" && (typeof component !== "number" || !Number.isFinite(component))) {
      return failure("INVALID_COLOR", `${path}.components[${index}]`, "color components must be finite numbers or none");
    }
  }

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
