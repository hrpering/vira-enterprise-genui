import { describe, expect, it } from "vitest";
import {
  compileDtcgDesignTokens,
  DESIGN_SYSTEM_COMPILER_MAX_NODES,
} from "../../packages/design-system-compiler/src/index.js";

describe("Design System Compiler final review regressions", () => {
  it("rejects CSS-wide and digit-leading font family names instead of emitting ambiguous raw CSS", () => {
    for (const family of ["inherit", "initial", "unset", "revert", "revert-layer", "123 Font"]) {
      expect(compileDtcgDesignTokens({
        font: { $type: "fontFamily", $value: family },
      })).toMatchObject({
        ok: false,
        issue: { code: "INVALID_FONT_FAMILY", path: "$.font.$value" },
      });
    }
  });

  it("preserves safe unquoted family names used by the existing Studio font contract", () => {
    const result = compileDtcgDesignTokens({
      fonts: {
        $type: "fontFamily",
        system: { $value: "system-ui" },
        brand: { $value: "IBM Plex Sans" },
        apple: { $value: "-apple-system" },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.options.fonts).toEqual(["-apple-system", "IBM Plex Sans", "system-ui"]);
  });

  it("fails the direct-child node budget before sorting or materializing an oversized child list", () => {
    const source: Record<string, unknown> = {};
    for (let index = 0; index < DESIGN_SYSTEM_COMPILER_MAX_NODES; index += 1) {
      source[`child${index.toString().padStart(5, "0")}`] = {};
    }

    expect(compileDtcgDesignTokens(source)).toMatchObject({
      ok: false,
      issue: { code: "RESOURCE_LIMIT_EXCEEDED", path: "$" },
    });
  });
});
