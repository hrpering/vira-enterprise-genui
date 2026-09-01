import { describe, expect, it } from "vitest";
import { compileDtcgDesignTokens } from "../../packages/design-system-compiler/src/index.js";

describe("Design System Compiler control-character validation", () => {
  it("rejects ASCII control characters in token and group names without regex-based inspection", () => {
    expect(compileDtcgDesignTokens({
      ["bad\nname"]: { $type: "fontFamily", $value: "Inter" },
    })).toMatchObject({
      ok: false,
      issue: { code: "UNSAFE_NAME" },
    });
  });

  it("rejects ASCII control characters in DTCG metadata", () => {
    expect(compileDtcgDesignTokens({
      group: {
        $description: "invalid\tmetadata",
        font: { $type: "fontFamily", $value: "Inter" },
      },
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_GROUP", path: "$.group.$description" },
    });
  });
});
