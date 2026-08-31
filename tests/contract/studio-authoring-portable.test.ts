import { describe, expect, it } from "vitest";
import {
  exportAuthoredStudioBundle,
  importAuthoredStudioBundle,
} from "../../packages/studio-authoring/src/index.js";

function document() {
  return {
    version: "1",
    id: "manual.portable",
    recipeId: "manual.portable",
    entryView: "main",
    views: [{ id: "main", nodes: [] }],
    bindings: [],
    interactions: [],
  };
}

describe("manual Studio portable bridge", () => {
  it("exports and imports through the canonical enterprise bundle contract", () => {
    const exported = exportAuthoredStudioBundle({ brandId: "manual.brand", document: document() });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const imported = importAuthoredStudioBundle(exported.value);
    expect(imported).toMatchObject({
      ok: true,
      brandId: "manual.brand",
      document: { id: "manual.portable" },
    });
  });

  it("reports document failures before bundle export", () => {
    expect(exportAuthoredStudioBundle({ brandId: "manual.brand", document: { ...document(), backendUrl: "https://forbidden.example" } })).toMatchObject({
      ok: false,
      stage: "document",
      issue: { code: "UNKNOWN_FIELD" },
    });
  });

  it("fails closed for unsupported portable versions", () => {
    expect(importAuthoredStudioBundle({ version: "999", brandId: "manual.brand", document: document() })).toMatchObject({
      ok: false,
      stage: "bundle",
      issue: { code: "INVALID_VERSION" },
    });
  });
});
