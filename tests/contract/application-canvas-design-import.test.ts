import { describe, expect, it } from "vitest";
import {
  VIRA_CANVAS_DESIGN_IMPORT_MODE,
  VIRA_CANVAS_DESIGN_SOURCE_FORMAT,
  importViraCanvasDesignSystem,
} from "../../packages/application-canvas-design-import/src/index.js";

function application(withBrand = true) {
  return {
    schemaVersion: "1",
    identity: { id: "vira.flight-assistant" },
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [{
      id: "travel.flight.search",
      packId: "vira/flight-booking",
      packVersion: "2.1.0",
      entrypoint: "main",
    }],
    capabilities: [{ id: "vira.flight-search", versionRef: "1.0.0" }],
    contextTypes: [{ id: "vira.trip-context", versionRef: "1.0.0" }],
    actions: [{ actionType: "travel.flight.book" }],
    flows: [{ id: "vira.flight-application-graph", versionRef: "1.0.0" }],
    brandRef: withBrand ? { id: "vira.travel-brand", versionRef: "1.4.0" } : null,
    governanceRequirements: [],
    hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
    protocolProjections: [],
    distribution: {
      name: "Flight Assistant",
      tags: ["travel"],
      visibility: "private",
      discoverable: false,
    },
    commercial: { entitlementRefs: [], meteringRefs: [] },
  };
}

function graph() {
  return {
    schemaVersion: "1",
    id: "vira.flight-application-graph",
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    metadata: { name: "Flight Graph" },
    nodes: [{
      id: "search-surface",
      target: {
        kind: "experience",
        ref: {
          id: "travel.flight.search",
          packId: "vira/flight-booking",
          packVersion: "2.1.0",
          entrypoint: "main",
        },
      },
    }],
    edges: [],
  };
}

function draft(withBrand = true, editorRevision = 4, x = 120) {
  return {
    schemaVersion: "1",
    draftId: "flight-draft-1",
    editorRevision,
    semantics: { application: application(withBrand), graphs: [graph()] },
    projection: {
      activeGraphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
      graphViews: [{
        graphRef: { id: "vira.flight-application-graph", version: "1.0.0" },
        nodeLayouts: [{ nodeId: "search-surface", x, y: 80 }],
        viewport: { x: 0, y: 0, zoom: 1 },
        selection: { nodeIds: [], edgeIds: [] },
      }],
    },
  };
}

function designDocument() {
  return {
    typography: {
      body: { $type: "fontFamily", $value: ["Inter", "Arial"] },
    },
    spacing: {
      $type: "dimension",
      small: { $value: { value: 8, unit: "px" } },
    },
    palette: {
      $type: "color",
      secondary: { $value: { colorSpace: "srgb", components: [1, 0.5, 0] } },
      primary: { $value: { colorSpace: "srgb", components: [17 / 255, 34 / 255, 51 / 255], hex: "#112233" } },
    },
  };
}

function source(document: unknown = designDocument()) {
  return {
    format: VIRA_CANVAS_DESIGN_SOURCE_FORMAT,
    sourceId: "figma:acme/travel-system",
    revision: "rev-2026-09-04.7",
    document,
  };
}

describe("Vira Canvas Design System / External Import v1", () => {
  it("compiles normalized external DTCG tokens into a frozen authoring import artifact", () => {
    const input = { draft: draft(), source: source() };
    const result = importViraCanvasDesignSystem(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).not.toBe(input);
    expect(result.value.mode).toBe(VIRA_CANVAS_DESIGN_IMPORT_MODE);
    expect(result.value.draftId).toBe("flight-draft-1");
    expect(result.value.expectedRevision).toBe(4);
    expect(result.value.brandRef).toEqual({ id: "vira.travel-brand", versionRef: "1.4.0" });
    expect(result.value.compiled.options).toEqual({
      colorMode: "palette",
      colors: ["#112233", "#FF8000"],
      fonts: ["Inter, Arial"],
    });
    expect(result.value.compiled.metadata).toMatchObject({
      sourceFormat: VIRA_CANVAS_DESIGN_SOURCE_FORMAT,
      visitedTokenCount: 4,
      compiledTokenCount: 3,
      ignoredTokenCount: 1,
    });
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.source)).toBe(true);
    expect(Object.isFrozen(result.value.source.document)).toBe(true);
    expect(Object.isFrozen(result.value.compiled.options)).toBe(true);
  });

  it("requires an exact Application brandRef instead of inventing an implicit brand", () => {
    expect(importViraCanvasDesignSystem({ draft: draft(false), source: source() })).toMatchObject({
      ok: false,
      issue: {
        code: "BRAND_REF_REQUIRED",
        path: "$.draft.semantics.application.brandRef",
      },
    });
  });

  it("rejects vendor, URL, credential and apply authority smuggling through exact input shapes", () => {
    for (const extra of [
      { provider: "figma" },
      { url: "https://api.figma.com/file/x" },
      { credential: "secret" },
      { accessToken: "secret" },
      { apply: true },
      { publish: true },
    ]) {
      expect(importViraCanvasDesignSystem({ draft: draft(), source: { ...source(), ...extra } })).toMatchObject({
        ok: false,
        issue: { code: "INVALID_SOURCE" },
      });
    }
  });

  it("rejects unsupported source formats rather than adding vendor-specific parsers to Canvas", () => {
    expect(importViraCanvasDesignSystem({
      draft: draft(),
      source: { ...source(), format: "figma-file-v1" },
    })).toMatchObject({
      ok: false,
      issue: { code: "UNSUPPORTED_FORMAT", path: "$.source.format" },
    });
  });

  it("forwards fail-closed compiler failures with source-document paths and compiler codes", () => {
    const result = importViraCanvasDesignSystem({
      draft: draft(),
      source: source({
        palette: {
          $type: "color",
          alias: { $value: "{palette.base}" },
        },
      }),
    });
    expect(result).toMatchObject({
      ok: false,
      issue: {
        code: "COMPILE_FAILED",
        compilerCode: "UNSUPPORTED_REFERENCE",
        path: "$.source.document.palette.alias.$value",
      },
    });
  });

  it("preserves explicit source provenance without treating it as a network binding", () => {
    const result = importViraCanvasDesignSystem({ draft: draft(), source: source() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.source).toMatchObject({
      format: VIRA_CANVAS_DESIGN_SOURCE_FORMAT,
      sourceId: "figma:acme/travel-system",
      revision: "rev-2026-09-04.7",
    });
    expect(Object.keys(result.value.source).sort()).toEqual(["document", "format", "revision", "sourceId"]);
  });

  it("keeps projection-only changes outside compiled design semantics", () => {
    const first = importViraCanvasDesignSystem({ draft: draft(true, 4, 120), source: source() });
    const second = importViraCanvasDesignSystem({ draft: draft(true, 5, 900), source: source() });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.compiled).toEqual(second.value.compiled);
    expect(first.value.brandRef).toEqual(second.value.brandRef);
    expect(first.value.expectedRevision).toBe(4);
    expect(second.value.expectedRevision).toBe(5);
  });

  it("does not mutate the caller draft or external token document", () => {
    const design = designDocument();
    const inputDraft = draft();
    const beforeDraft = JSON.stringify(inputDraft);
    const beforeDesign = JSON.stringify(design);
    const result = importViraCanvasDesignSystem({ draft: inputDraft, source: source(design) });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(inputDraft)).toBe(beforeDraft);
    expect(JSON.stringify(design)).toBe(beforeDesign);
  });

  it("rejects unsafe source identifiers and revisions", () => {
    expect(importViraCanvasDesignSystem({
      draft: draft(),
      source: { ...source(), sourceId: " figma:bad " },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_SOURCE_ID" } });

    expect(importViraCanvasDesignSystem({
      draft: draft(),
      source: { ...source(), revision: "rev\n1" },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_SOURCE_REVISION" } });
  });

  it("rejects unsafe accessor and custom-prototype input through the shared JSON boundary", () => {
    const input: Record<string, unknown> = { source: source() };
    Object.defineProperty(input, "draft", { enumerable: true, get: () => draft() });
    expect(importViraCanvasDesignSystem(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });

    const custom = Object.create({ inherited: true }) as Record<string, unknown>;
    custom.draft = draft();
    custom.source = source();
    expect(importViraCanvasDesignSystem(custom)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });
  });

  it("rejects sources with no supported tokens instead of inventing design defaults", () => {
    expect(importViraCanvasDesignSystem({
      draft: draft(),
      source: source({
        spacing: {
          $type: "dimension",
          small: { $value: { value: 8, unit: "px" } },
        },
      }),
    })).toMatchObject({
      ok: false,
      issue: { code: "COMPILE_FAILED", compilerCode: "NO_SUPPORTED_TOKENS" },
    });
  });

  it("returns import data only and exposes no renderer, mutation, publish, deploy or execution authority", () => {
    const result = importViraCanvasDesignSystem({ draft: draft(), source: source() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value).sort()).toEqual([
      "brandRef",
      "compiled",
      "draftId",
      "expectedRevision",
      "mode",
      "source",
      "version",
    ]);
    for (const forbidden of ["apply", "publish", "deploy", "execute", "renderers", "components", "credentials", "provider"]) {
      expect(forbidden in result.value).toBe(false);
    }
  });
});
