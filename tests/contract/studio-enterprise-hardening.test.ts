import { describe, expect, it } from "vitest";
import { COMMERCE_BRAND_PACKAGE_INPUT } from "../../examples/commerce-brand-kit/src/index.js";
import { createStudioBrandPackage } from "../../packages/studio-brand/src/index.js";
import {
  createStudioAuditEvent,
  createStudioPortableBundle,
  exportStudioPortableBundle,
  STUDIO_PORTABLE_BUNDLE_MAX_BYTES,
} from "../../packages/studio-enterprise/src/index.js";
import { STUDIO_RUNTIME_MAX_REPEAT_ITEMS } from "../../packages/studio-runtime/src/index.js";
import { STUDIO_MAX_NODES_PER_VIEW, STUDIO_MAX_VIEWS } from "../../packages/studio-schema/src/index.js";

function commerceDocument() {
  const template = COMMERCE_BRAND_PACKAGE_INPUT.templates[0];
  if (!template) throw new Error("commerce reference template missing");
  return template.document;
}

describe("Studio Canvas v2 enterprise release hardening", () => {
  it("round-trips a bounded canonical portable bundle without renderer or backend surfaces", () => {
    const exported = exportStudioPortableBundle({ brandId: "commerce.brand", document: commerceDocument() });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const encoded = JSON.stringify(exported.value);
    expect(encoded.length).toBeLessThan(STUDIO_PORTABLE_BUNDLE_MAX_BYTES);
    expect(encoded).not.toMatch(/renderer|endpoint|apiKey|secret|headers|fetch/i);
    expect(createStudioPortableBundle(JSON.parse(encoded))).toEqual(exported);
  });

  it("rejects unsupported portable versions and oversized canonical documents", () => {
    expect(createStudioPortableBundle({ version: "2", brandId: "commerce.brand", document: commerceDocument() })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VERSION" },
    });
    const huge = {
      version: "1",
      brandId: "commerce.brand",
      document: {
        version: "1",
        id: "commerce.huge",
        recipeId: "commerce.huge",
        entryView: "main",
        views: [{ id: "main", nodes: [{ id: "root", component: "commerce.component.product-title", order: 0, props: { text: "x".repeat(STUDIO_PORTABLE_BUNDLE_MAX_BYTES) } }] }],
        bindings: [],
        interactions: [],
      },
    };
    expect(createStudioPortableBundle(huge)).toMatchObject({ ok: false, issue: { code: "BUNDLE_TOO_LARGE" } });
  });

  it("keeps audit events metadata-only and rejects payload/domain/secret capture", () => {
    const base = {
      kind: "publish",
      experienceId: "commerce.product-card",
      brandId: "commerce.brand",
      documentVersion: "1",
      timestamp: "2026-08-30T09:30:00Z",
    } as const;
    const event = createStudioAuditEvent(base);
    expect(event.ok).toBe(true);
    if (event.ok) expect(Object.keys(event.value).sort()).toEqual(["brandId", "documentVersion", "experienceId", "kind", "timestamp", "version"].sort());
    for (const field of ["payload", "domain", "prompt", "headers", "apiKey", "secret"]) {
      expect(createStudioAuditEvent({ ...base, [field]: "do-not-log" })).toMatchObject({ ok: false, issue: { code: "UNKNOWN_FIELD" } });
    }
  });

  it("keeps malicious backend configuration out of declarative brand packages", () => {
    for (const field of ["endpoint", "apiKey", "fetch", "headers", "secret", "renderer"]) {
      expect(createStudioBrandPackage({ ...COMMERCE_BRAND_PACKAGE_INPUT, [field]: "forbidden" })).toMatchObject({ ok: false });
    }
  });

  it("pins explicit authoring/runtime resource budgets for release review", () => {
    expect(STUDIO_MAX_VIEWS).toBeLessThanOrEqual(128);
    expect(STUDIO_MAX_NODES_PER_VIEW).toBeLessThanOrEqual(4096);
    expect(STUDIO_RUNTIME_MAX_REPEAT_ITEMS).toBeLessThanOrEqual(512);
    expect(STUDIO_PORTABLE_BUNDLE_MAX_BYTES).toBe(1_048_576);
  });
});
