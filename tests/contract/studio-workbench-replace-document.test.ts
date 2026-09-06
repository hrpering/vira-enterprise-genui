import { describe, expect, it } from "vitest";
import { COMMERCE_BRAND_PACKAGE_INPUT } from "@vira-enterprise-genui/commerce-brand-kit";
import { createStudioBrandPackage } from "@vira-enterprise-genui/studio-brand";
import { createStudioWorkbenchSession } from "@vira-enterprise-genui/studio-workbench";

function createWorkbench() {
  const brandResult = createStudioBrandPackage(COMMERCE_BRAND_PACKAGE_INPUT);
  if (!brandResult.ok) throw new Error(`brand rejected: ${brandResult.issue.code}`);
  const template = brandResult.value.templates[0];
  if (!template) throw new Error("commerce brand requires one template");
  let nextNodeId = 1;
  const created = createStudioWorkbenchSession({
    document: template.document,
    componentCatalog: brandResult.value.components,
    bindingSourceCatalog: brandResult.value.dataSources,
    actionAdapter: brandResult.value.actions,
    allocateNodeId: () => `replacement-${nextNodeId++}`,
  });
  if (!created.ok) throw new Error(`workbench rejected: ${created.issue.code}`);
  return { brand: brandResult.value, template, workbench: created.value };
}

describe("Studio Workbench document replacement", () => {
  it("preserves the active view when the validated replacement still contains it", () => {
    const { workbench } = createWorkbench();
    const added = workbench.addView({
      viewId: "confirmation",
      root: { id: "confirmation-root", component: "commerce.layout.stack", props: {} },
    });
    expect(added.ok).toBe(true);
    expect(workbench.currentViewId()).toBe("confirmation");

    const candidate = structuredClone(workbench.currentDocument());
    const replaced = workbench.replaceDocument(candidate);

    expect(replaced.ok).toBe(true);
    expect(workbench.currentViewId()).toBe("confirmation");
    expect(workbench.currentDocument()).toEqual(candidate);
  });

  it("falls back to the replacement entry view when the active view no longer exists", () => {
    const { template, workbench } = createWorkbench();
    const added = workbench.addView({
      viewId: "confirmation",
      root: { id: "confirmation-root", component: "commerce.layout.stack", props: {} },
    });
    expect(added.ok).toBe(true);
    expect(workbench.currentViewId()).toBe("confirmation");

    const replacement = structuredClone(template.document);
    const replaced = workbench.replaceDocument(replacement);

    expect(replaced.ok).toBe(true);
    expect(workbench.currentViewId()).toBe(template.document.entryView);
    expect(workbench.currentDocument()).toEqual(replacement);
  });

  it("fails closed and leaves document, view, and Puck projection untouched on invalid replacement", () => {
    const { workbench } = createWorkbench();
    const beforeDocument = structuredClone(workbench.currentDocument());
    const beforeView = workbench.currentViewId();
    const beforePuck = structuredClone(workbench.toPuckData());
    const invalid = { ...structuredClone(beforeDocument), entryView: "missing-view" };

    const replaced = workbench.replaceDocument(invalid);

    expect(replaced.ok).toBe(false);
    if (replaced.ok) throw new Error("expected invalid replacement to fail");
    expect(replaced.issue.code).toBe("MUTATION_FAILED");
    expect(workbench.currentDocument()).toEqual(beforeDocument);
    expect(workbench.currentViewId()).toBe(beforeView);
    expect(workbench.toPuckData()).toEqual(beforePuck);
  });
});
