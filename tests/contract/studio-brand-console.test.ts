import test from "node:test";
import assert from "node:assert/strict";
import { createViraStudioBrandConsole } from "../../packages/studio-brand-console/src/index.js";

const scope = Object.freeze({ version: "1", organizationId: "acme", projectId: "travel", environment: "dev" });

const brandPackage = {
  version: "1",
  id: "acme.travel",
  brand: { version: "1", id: "acme", name: "Acme", tokens: {} },
  components: {
    version: "1",
    brandId: "acme",
    components: [
      {
        id: "acme.card",
        label: "Card",
        props: [],
        events: [],
      },
    ],
  },
  dataSources: { version: "1", sources: [] },
  actions: { version: "1", brandId: "acme", actions: [] },
  templates: [
    {
      id: "starter",
      label: "Starter",
      description: "Starter template",
      document: {
        version: "1",
        id: "acme.starter",
        entryViewId: "main",
        views: [
          {
            id: "main",
            nodes: [
              { id: "root", component: "acme.card", props: {} },
            ],
          },
        ],
        bindings: [],
        interactions: [],
      },
    },
  ],
};

test("Studio Brand Console binds exact enterprise scope and exposes immutable template summaries", () => {
  const created = createViraStudioBrandConsole({ scope, brandPackage });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.deepEqual(created.value.scope, scope);
  assert.deepEqual(created.value.listTemplates(), [
    { id: "starter", label: "Starter", description: "Starter template" },
  ]);
  assert.equal(Object.isFrozen(created.value.listTemplates()), true);
});

test("Studio Brand Console rejects malformed enterprise scope before Brand import", () => {
  const created = createViraStudioBrandConsole({
    scope: { ...scope, projectId: "../other" },
    brandPackage,
  });
  assert.deepEqual(created, {
    ok: false,
    issue: {
      code: "INVALID_SCOPE",
      path: "$.scope",
      message: "Studio Brand Console requires an exact enterprise scope",
    },
  });
});

test("Studio Brand Console delegates Brand validation to canonical studio-brand authority", () => {
  const created = createViraStudioBrandConsole({
    scope,
    brandPackage: { ...brandPackage, version: "999" },
  });
  assert.equal(created.ok, false);
  if (created.ok) return;
  assert.equal(created.issue.code, "INVALID_BRAND_PACKAGE");
});

test("Studio Brand Console resolves template IDs exactly with no fallback", () => {
  const created = createViraStudioBrandConsole({ scope, brandPackage });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const opened = created.value.openTemplate({ templateId: "missing", allocateNodeId: () => "node-1" });
  assert.deepEqual(opened, {
    ok: false,
    issue: {
      code: "TEMPLATE_NOT_FOUND",
      path: "$.templateId",
      message: "brand template does not exist in the active package",
    },
  });
});

test("Studio Brand Console hands validated template and exact Brand catalogs to Workbench", () => {
  const created = createViraStudioBrandConsole({ scope, brandPackage });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const opened = created.value.openTemplate({ templateId: "starter", allocateNodeId: () => "node-1" });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  assert.equal(opened.value.currentViewId(), "main");
  assert.equal(opened.value.componentCatalog().brandId, "acme");
  assert.equal(opened.value.actionAdapter().brandId, "acme");
  assert.deepEqual(opened.value.currentDocument().id, "acme.starter");
});
