import { describe, expect, it } from "vitest";
import { createStudioDesignCatalog } from "../../packages/studio-design/src/index.js";
import {
  compileDtcgDesignTokens,
  DESIGN_SYSTEM_COMPILER_SOURCE_FORMAT,
} from "../../packages/design-system-compiler/src/index.js";

function baseCatalog() {
  return {
    version: "1",
    id: "test.design.catalog",
    brandId: "test.brand",
    components: [{
      ref: "test.component.card",
      label: "Card",
      category: "content.card",
      kind: "content",
      props: [],
      slots: [],
      events: [],
    }],
  };
}

function color(hex: string) {
  return {
    $type: "color",
    $value: {
      colorSpace: "srgb",
      components: [
        Number.parseInt(hex.slice(1, 3), 16) / 255,
        Number.parseInt(hex.slice(3, 5), 16) / 255,
        Number.parseInt(hex.slice(5, 7), 16) / 255,
      ],
      hex,
    },
  };
}

describe("DTCG design system compiler", () => {
  it("compiles supported DTCG tokens into the existing Studio design catalog options", () => {
    const result = compileDtcgDesignTokens({
      typography: {
        body: { $type: "fontFamily", $value: ["Inter", "Arial"] },
      },
      spacing: {
        $type: "dimension",
        small: { $value: { value: 8, unit: "px" } },
      },
      palette: {
        $type: "color",
        secondary: {
          $value: { colorSpace: "srgb", components: [1, 0.5, 0] },
        },
        primary: {
          $value: { colorSpace: "srgb", components: [17 / 255, 34 / 255, 51 / 255], hex: "#112233" },
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.options).toEqual({
      colorMode: "palette",
      colors: ["#112233", "#FF8000"],
      fonts: ["Inter, Arial"],
    });
    expect(result.value.metadata).toMatchObject({
      sourceFormat: DESIGN_SYSTEM_COMPILER_SOURCE_FORMAT,
      visitedTokenCount: 4,
      compiledTokenCount: 3,
      ignoredTokenCount: 1,
    });
    expect(result.value.metadata.colorTokenPaths).toEqual(["$.palette.primary", "$.palette.secondary"]);
    expect(result.value.metadata.fontTokenPaths).toEqual(["$.typography.body"]);

    const catalog = createStudioDesignCatalog(baseCatalog(), result.value.options);
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) return;
    expect(catalog.value.components[0]?.props.find((prop) => prop.key === "designcolor")).toMatchObject({
      type: "enum",
      options: ["#112233", "#FF8000"],
    });
    expect(catalog.value.components[0]?.props.find((prop) => prop.key === "designfont")).toMatchObject({
      type: "enum",
      options: ["Inter, Arial"],
    });
  });

  it("honors inherited group types, explicit token overrides, $root tokens, and DTCG group order", () => {
    const result = compileDtcgDesignTokens({
      brand: {
        $type: "color",
        $root: { $value: { colorSpace: "srgb", components: [0, 0, 0], hex: "#000000" } },
        accent: { $value: { colorSpace: "srgb", components: [1, 1, 1], hex: "#FFFFFF" } },
        typography: { $type: "fontFamily", $value: "Inter" },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.options).toEqual({
      colorMode: "palette",
      colors: ["#FFFFFF", "#000000"],
      fonts: ["Inter"],
    });
    expect(result.value.metadata.colorTokenPaths).toEqual(["$.brand.accent", "$[\"brand\"][\"$root\"]"]);
  });

  it("converts numeric sRGB deterministically and accepts opaque hex fallbacks for unsupported spaces", () => {
    const result = compileDtcgDesignTokens({
      colors: {
        $type: "color",
        orange: { $value: { colorSpace: "srgb", components: [1, 0.5, 0] } },
        wide: { $value: { colorSpace: "display-p3", components: [0.9, 0.1, 0.2], hex: "#E61933" } },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.options.colors).toEqual(["#FF8000", "#E61933"]);
  });

  it("rejects alpha colors, unsupported spaces without fallback, and inconsistent sRGB fallback", () => {
    expect(compileDtcgDesignTokens({
      color: { $type: "color", $value: { colorSpace: "srgb", components: [1, 0, 0], alpha: 0.5 } },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_COLOR", path: "$.color.$value.alpha" } });

    expect(compileDtcgDesignTokens({
      color: { $type: "color", $value: { colorSpace: "display-p3", components: [1, 0, 0] } },
    })).toMatchObject({ ok: false, issue: { code: "UNSUPPORTED_COLOR_SPACE", path: "$.color.$value.colorSpace" } });

    expect(compileDtcgDesignTokens({
      color: { $type: "color", $value: { colorSpace: "srgb", components: [1, 0, 0], hex: "#00FF00" } },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_COLOR", path: "$.color.$value.hex" } });
  });

  it("fails closed on unsupported reference and extension resolution", () => {
    expect(compileDtcgDesignTokens({
      palette: {
        $type: "color",
        alias: { $value: "{palette.base}" },
      },
    })).toMatchObject({ ok: false, issue: { code: "UNSUPPORTED_REFERENCE", path: "$.palette.alias.$value" } });

    expect(compileDtcgDesignTokens({
      palette: {
        $extends: "base.palette",
        $type: "color",
        red: { $value: { colorSpace: "srgb", components: [1, 0, 0] } },
      },
    })).toMatchObject({ ok: false, issue: { code: "UNSUPPORTED_EXTENDS", path: "$.palette.$extends" } });

    expect(compileDtcgDesignTokens({
      fonts: {
        $type: "fontFamily",
        body: { $value: { $ref: "#/fonts/base" } },
      },
    })).toMatchObject({ ok: false, issue: { code: "UNSUPPORTED_REFERENCE", path: "$.fonts.body.$value" } });

    expect(compileDtcgDesignTokens({
      fonts: {
        $type: "fontFamily",
        body: { $value: ["Inter", "{fonts.fallback}"] },
      },
    })).toMatchObject({ ok: false, issue: { code: "UNSUPPORTED_REFERENCE", path: "$.fonts.body.$value[1]" } });
  });

  it("rejects missing types, unsafe font grammar, and unsupported reserved fields", () => {
    expect(compileDtcgDesignTokens({
      orphan: { $value: "Inter" },
    })).toMatchObject({ ok: false, issue: { code: "MISSING_TYPE", path: "$.orphan" } });

    expect(compileDtcgDesignTokens({
      font: { $type: "fontFamily", $value: "Inter;url(https://evil.example)" },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_FONT_FAMILY", path: "$.font.$value" } });

    expect(compileDtcgDesignTokens({
      group: {
        $extensions: { vendor: true },
        color: color("#112233"),
      },
    })).toMatchObject({ ok: false, issue: { code: "UNKNOWN_RESERVED_FIELD" } });
  });

  it("rejects prototype-sensitive token names and root token input", () => {
    const pollutedName = JSON.parse(`{"__proto__":{"$type":"fontFamily","$value":"Inter"}}`) as unknown;
    expect(compileDtcgDesignTokens(pollutedName)).toMatchObject({ ok: false, issue: { code: "UNSAFE_NAME" } });

    expect(compileDtcgDesignTokens({ $type: "fontFamily", $value: "Inter" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ROOT", path: "$" },
    });
  });

  it("enforces the existing Studio palette and font limits", () => {
    const palette: Record<string, unknown> = { $type: "color" };
    for (let index = 0; index < 65; index += 1) {
      const hex = `#${index.toString(16).padStart(6, "0")}`;
      palette[`color${index.toString().padStart(2, "0")}`] = color(hex);
    }
    expect(compileDtcgDesignTokens({ palette })).toMatchObject({
      ok: false,
      issue: { code: "PALETTE_LIMIT_EXCEEDED" },
    });

    const fonts: Record<string, unknown> = { $type: "fontFamily" };
    for (let index = 0; index < 33; index += 1) {
      fonts[`font${index.toString().padStart(2, "0")}`] = { $value: `Font${index}` };
    }
    expect(compileDtcgDesignTokens({ fonts })).toMatchObject({
      ok: false,
      issue: { code: "FONT_LIMIT_EXCEEDED" },
    });
  });

  it("enforces the traversal depth resource budget", () => {
    const source: Record<string, unknown> = {};
    let cursor = source;
    for (let index = 0; index < 34; index += 1) {
      const next: Record<string, unknown> = {};
      cursor[`group${index}`] = next;
      cursor = next;
    }
    cursor.token = { $type: "fontFamily", $value: "Inter" };
    expect(compileDtcgDesignTokens(source)).toMatchObject({
      ok: false,
      issue: { code: "RESOURCE_LIMIT_EXCEEDED" },
    });
  });

  it("is deterministic across object key order and returns deeply frozen output", () => {
    const first = compileDtcgDesignTokens({
      z: { $type: "fontFamily", $value: "Geist" },
      a: color("#112233"),
    });
    const second = compileDtcgDesignTokens({
      a: color("#112233"),
      z: { $value: "Geist", $type: "fontFamily" },
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value).toEqual(second.value);
    expect(Object.isFrozen(first.value)).toBe(true);
    expect(Object.isFrozen(first.value.options)).toBe(true);
    expect(Object.isFrozen(first.value.options.colors)).toBe(true);
    expect(Object.isFrozen(first.value.metadata.colorTokenPaths)).toBe(true);
  });

  it("rejects sources with no supported tokens instead of inventing design defaults", () => {
    expect(compileDtcgDesignTokens({
      spacing: {
        $type: "dimension",
        small: { $value: { value: 8, unit: "px" } },
      },
    })).toMatchObject({
      ok: false,
      issue: { code: "NO_SUPPORTED_TOKENS", path: "$" },
    });
  });
});
