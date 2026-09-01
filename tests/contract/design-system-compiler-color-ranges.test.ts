import { describe, expect, it } from "vitest";
import { compileDtcgDesignTokens } from "../../packages/design-system-compiler/src/index.js";

describe("DTCG color range validation", () => {
  it("rejects color spaces outside the stable DTCG 2025.10 allowlist even with a hex fallback", () => {
    expect(compileDtcgDesignTokens({
      color: {
        $type: "color",
        $value: { colorSpace: "custom-rgb", components: [0, 0, 0], hex: "#000000" },
      },
    })).toMatchObject({ ok: false, issue: { code: "UNSUPPORTED_COLOR_SPACE", path: "$.color.$value.colorSpace" } });
  });

  it("rejects out-of-range components before using a non-sRGB fallback", () => {
    expect(compileDtcgDesignTokens({
      color: {
        $type: "color",
        $value: { colorSpace: "display-p3", components: [2, 0, 0], hex: "#FF0000" },
      },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_COLOR", path: "$.color.$value.components[0]" } });

    expect(compileDtcgDesignTokens({
      color: {
        $type: "color",
        $value: { colorSpace: "hsl", components: [360, 100, 50], hex: "#FF0000" },
      },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_COLOR", path: "$.color.$value.components[0]" } });
  });

  it("accepts DTCG spaces with unbounded signed channels when an exact fallback is available", () => {
    const result = compileDtcgDesignTokens({
      color: {
        $type: "color",
        $value: { colorSpace: "lab", components: [60, -20, 30], hex: "#887766" },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.options.colors).toEqual(["#887766"]);
  });
});
