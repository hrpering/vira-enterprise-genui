import { describe, expect, it } from "vitest";
import {
  VIRA_CANVAS_DESIGN_SOURCE_FORMAT,
  importViraCanvasDesignSystem,
} from "../../packages/application-canvas-design-import/src/index.js";

function draft() {
  return {
    schemaVersion: "1",
    draftId: "brand-draft-1",
    editorRevision: 2,
    semantics: {
      application: {
        schemaVersion: "1",
        identity: { id: "vira.brand-app" },
        version: "1.0.0",
        publisher: { id: "vira", name: "Vira" },
        experiences: [],
        capabilities: [],
        contextTypes: [],
        actions: [],
        flows: [],
        brandRef: { id: "vira.brand-system", versionRef: "1.0.0" },
        governanceRequirements: [],
        hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
        protocolProjections: [],
        distribution: { name: "Brand App", tags: [], visibility: "private", discoverable: false },
        commercial: { entitlementRefs: [], meteringRefs: [] },
      },
      graphs: [],
    },
    projection: { activeGraphRef: null, graphViews: [] },
  };
}

function input(document: unknown) {
  return {
    draft: draft(),
    source: {
      format: VIRA_CANVAS_DESIGN_SOURCE_FORMAT,
      sourceId: "external:design/system",
      revision: "rev-1",
      document,
    },
  };
}

describe("Vira Canvas design import hardening", () => {
  it("canonicalizes raw DTCG object keys deterministically", () => {
    const first = importViraCanvasDesignSystem(input({
      zFont: { $type: "fontFamily", $value: "Inter" },
      aColor: { $type: "color", $value: { colorSpace: "srgb", components: [0, 0, 0], hex: "#000000" } },
    }));
    const second = importViraCanvasDesignSystem(input({
      aColor: { $value: { hex: "#000000", components: [0, 0, 0], colorSpace: "srgb" }, $type: "color" },
      zFont: { $value: "Inter", $type: "fontFamily" },
    }));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.source.document).toEqual(second.value.source.document);
    expect(JSON.stringify(first.value.source.document)).toBe(JSON.stringify(second.value.source.document));
    expect(first.value.compiled).toEqual(second.value.compiled);
  });

  it("preserves prototype-sensitive keys as data until the canonical compiler rejects them", () => {
    const polluted = JSON.parse(`{"__proto__":{"$type":"fontFamily","$value":"Inter"}}`) as unknown;
    const result = importViraCanvasDesignSystem(input(polluted));
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "COMPILE_FAILED", compilerCode: "UNSAFE_NAME" },
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("does not reinterpret vendor extension objects as canonical design semantics", () => {
    const result = importViraCanvasDesignSystem(input({
      palette: {
        $extensions: { figma: { styleId: "S:123" } },
        primary: { $type: "color", $value: { colorSpace: "srgb", components: [0, 0, 0] } },
      },
    }));
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "COMPILE_FAILED", compilerCode: "UNKNOWN_RESERVED_FIELD" },
    });
  });
});
