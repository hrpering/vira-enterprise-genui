import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { COMMERCE_BRAND_PACKAGE_INPUT } from "@vira-enterprise-genui/commerce-brand-kit";
import { createStudioBrandPackage } from "@vira-enterprise-genui/studio-brand";
import { createStudioWorkbenchSession } from "@vira-enterprise-genui/studio-workbench";
import "./studio.css";

function fail(message: string): never {
  throw new Error(message);
}

const brandResult = createStudioBrandPackage(COMMERCE_BRAND_PACKAGE_INPUT);
if (!brandResult.ok) fail(`Brand package rejected: ${brandResult.issue.code}`);
const brand = brandResult.value;
const template = brand.templates[0] ?? fail("Commerce reference brand requires one template");
let nextNodeId = 1;
const workbenchResult = createStudioWorkbenchSession({
  document: template.document,
  componentCatalog: brand.components,
  bindingSourceCatalog: brand.dataSources,
  actionAdapter: brand.actions,
  allocateNodeId: () => `generated-${nextNodeId++}`,
});
if (!workbenchResult.ok) fail(`Workbench rejected: ${workbenchResult.issue.code}`);
const workbench = workbenchResult.value;

function App() {
  const [status, setStatus] = useState("Ready");
  const [viewCount, setViewCount] = useState(workbench.listViews().length);
  const document = useMemo(() => workbench.currentDocument(), [viewCount, status]);

  function preview() {
    const result = workbench.preview();
    setStatus(result.ok
      ? `Preview ready · ${result.value.experienceId} · ${result.value.viewId}`
      : `Preview rejected · ${result.issue.code}`);
  }

  function publish() {
    const result = workbench.publish();
    setStatus(result.ok
      ? `Publication ready · ${result.value.document.id}`
      : `Publication rejected · ${result.issue.code}`);
  }

  function addView() {
    const result = workbench.addView({
      viewId: "confirmation",
      root: { id: "confirmation-root", component: "commerce.layout.stack", props: {} },
    });
    if (!result.ok) {
      setStatus(`Mutation rejected · ${result.issue.code}`);
      return;
    }
    setViewCount(workbench.listViews().length);
    setStatus("Confirmation view added");
  }

  return (
    <main className="shell">
      <header>
        <p className="eyebrow">Vira Experience Studio</p>
        <h1>Generic commerce authoring smoke surface</h1>
        <p>Canonical Brand Package → Workbench → Preview → Publication</p>
      </header>

      <section className="panel" aria-label="Brand package">
        <h2>{brand.brand.displayName}</h2>
        <dl>
          <div><dt>Brand</dt><dd data-testid="brand-id">{brand.brand.id}</dd></div>
          <div><dt>Template</dt><dd data-testid="template-id">{template.id}</dd></div>
          <div><dt>Experience</dt><dd data-testid="experience-id">{document.id}</dd></div>
          <div><dt>Views</dt><dd data-testid="view-count">{viewCount}</dd></div>
        </dl>
      </section>

      <section className="panel" aria-label="Workbench controls">
        <h2>Canonical workbench</h2>
        <div className="actions">
          <button type="button" onClick={preview}>Preview</button>
          <button type="button" onClick={publish}>Publish</button>
          <button type="button" onClick={addView} disabled={viewCount > 1}>Add confirmation view</button>
        </div>
        <p role="status" data-testid="status">{status}</p>
      </section>

      <section className="panel" aria-label="Document summary">
        <h2>Document summary</h2>
        <p>{document.views[0]?.nodes.length ?? 0} nodes · {document.bindings.length} bindings · {document.interactions.length} interactions</p>
      </section>
    </main>
  );
}

const root = document.getElementById("root") ?? fail("Missing application root");
createRoot(root).render(<App />);
