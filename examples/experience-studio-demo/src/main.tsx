import {
  COMMERCE_BRAND_PACKAGE_INPUT,
  commerceAuthoringRenderers,
} from "@vira-enterprise-genui/commerce-brand-kit";
import { createStudioBrandPackage } from "@vira-enterprise-genui/studio-brand";
import { createStudioWorkbenchSession } from "@vira-enterprise-genui/studio-workbench";
import { StrictMode, useRef, useState } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { prepareStudioApplicationPackageV2 } from "../../../integrations/studio-application-bridge/index.js";
import {
  createStudioLifecycleService,
  type StudioLifecycleRecord,
  type StudioLifecycleRevision,
  type StudioLifecycleService,
} from "../../../packages/studio-lifecycle/src/index.js";
import { ViraStudioWorkbench } from "../../../packages/studio-workbench-react/src/index.js";
import { generateCommerceStudioAiDraft } from "./ai-authoring.js";
import { MemoryStudioLifecycleStore } from "./lifecycle-store.js";
import {
  deprecateStudioApplicationStaging,
  publishStudioApplicationToStaging,
  type StudioStagingDeploymentValue,
} from "./staging-deployment.js";
import "./studio.css";

const brandResult = createStudioBrandPackage(COMMERCE_BRAND_PACKAGE_INPUT);
if (!brandResult.ok) throw new Error(`brand rejected: ${brandResult.issue.code}`);
const brand = brandResult.value;
const template = brand.templates[0];
if (!template) throw new Error("commerce brand requires one template");

let nextNodeId = 1;
const workbenchResult = createStudioWorkbenchSession({
  document: template.document,
  componentCatalog: brand.components,
  bindingSourceCatalog: brand.dataSources,
  actionAdapter: brand.actions,
  allocateNodeId: () => `demo-${nextNodeId++}`,
});
if (!workbenchResult.ok) throw new Error(`workbench rejected: ${workbenchResult.issue.code}`);
const workbench = workbenchResult.value;

type DemoDocument = ReturnType<typeof workbench.currentDocument>;

const WORKSPACE_ID = "experience-studio-demo";
const EXPERIENCE_ID = template.document.id;
const EXPERIENCE_NAME = template.label;
const DEFAULT_AI_PROMPT = "Make the add to cart action clearer.";
const APPLICATION_ID = "commerce.application.product-card";
const EXPERIENCE_PACK_ID = "commerce/product-card";
const PUBLICATION_ARTIFACT_ID = "studio";

function lifecycleIssue(result: { readonly issue: { readonly code: string; readonly message: string } }): string {
  return `${result.issue.code}: ${result.issue.message}`;
}

function ProductStudio(props: {
  readonly lifecycle: StudioLifecycleService;
  readonly initialRecord: StudioLifecycleRecord;
  readonly initialHistory: readonly StudioLifecycleRevision[];
}): ReactElement {
  const [record, setRecord] = useState(props.initialRecord);
  const [history, setHistory] = useState(props.initialHistory);
  const [document, setDocument] = useState<DemoDocument>(workbench.currentDocument());
  const [status, setStatus] = useState(`Draft saved · r${props.initialRecord.draftRevision}`);
  const [diffSummary, setDiffSummary] = useState("Select a revision comparison to inspect changes.");
  const [surfaceRevision, setSurfaceRevision] = useState(0);
  const [aiPrompt, setAiPrompt] = useState(DEFAULT_AI_PROMPT);
  const [aiStatus, setAiStatus] = useState("Ready · canonical Studio AI v2 policy gate");
  const [aiBusy, setAiBusy] = useState(false);
  const [applicationRelease, setApplicationRelease] = useState("Not prepared");
  const [experiencePackRelease, setExperiencePackRelease] = useState("Not prepared");
  const [stagingState, setStagingState] = useState("Not staged");

  const recordRef = useRef(props.initialRecord);
  const documentRef = useRef<DemoDocument>(document);
  const editSequenceRef = useRef(0);
  const lastSavedSequenceRef = useRef(0);
  const autosaveTimerRef = useRef<number | undefined>(undefined);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const stagedReleaseRef = useRef<StudioStagingDeploymentValue | null>(null);

  const applyRecord = (next: StudioLifecycleRecord) => {
    recordRef.current = next;
    setRecord(next);
  };

  const refreshHistory = async () => {
    const result = await props.lifecycle.history(WORKSPACE_ID, EXPERIENCE_ID);
    if (!result.ok) {
      setStatus(`History failed · ${lifecycleIssue(result)}`);
      return;
    }
    setHistory(result.value);
  };

  const queueSave = (snapshot: DemoDocument, sequence: number): Promise<void> => {
    const operation = saveQueueRef.current.then(async () => {
      const current = recordRef.current;
      const saved = await props.lifecycle.save({
        workspaceId: WORKSPACE_ID,
        id: EXPERIENCE_ID,
        name: EXPERIENCE_NAME,
        expectedRecordVersion: current.recordVersion,
        document: snapshot,
      });
      if (!saved.ok) {
        setStatus(`Autosave failed · ${lifecycleIssue(saved)}`);
        return;
      }
      applyRecord(saved.value);
      lastSavedSequenceRef.current = Math.max(lastSavedSequenceRef.current, sequence);
      setStatus(`Draft saved · r${saved.value.draftRevision}`);
      await refreshHistory();
    });
    saveQueueRef.current = operation.catch(() => {
      setStatus("Autosave failed · unexpected store error");
    });
    return operation;
  };

  const scheduleAutosave = (nextDocument: DemoDocument) => {
    documentRef.current = nextDocument;
    setDocument(nextDocument);
    editSequenceRef.current += 1;
    const sequence = editSequenceRef.current;
    if (autosaveTimerRef.current !== undefined) window.clearTimeout(autosaveTimerRef.current);
    setStatus("Autosave pending…");
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = undefined;
      void queueSave(documentRef.current, sequence);
    }, 180);
  };

  const flushDraft = async (): Promise<StudioLifecycleRecord> => {
    if (autosaveTimerRef.current !== undefined) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = undefined;
    }
    await saveQueueRef.current;
    if (lastSavedSequenceRef.current < editSequenceRef.current) {
      await queueSave(documentRef.current, editSequenceRef.current);
    }
    return recordRef.current;
  };

  const prepareCanonicalRelease = async (current: StudioLifecycleRecord) => {
    const version = `0.0.${current.draftRevision}`;
    return prepareStudioApplicationPackageV2({
      studio: {
        document: current.document,
        componentCatalog: brand.components,
        bindingSourceCatalog: brand.dataSources,
        actionAdapter: brand.actions,
      },
      application: {
        id: APPLICATION_ID,
        version,
        packId: EXPERIENCE_PACK_ID,
        publicationArtifactId: PUBLICATION_ARTIFACT_ID,
        publisher: { id: "commerce", name: "Commerce Reference" },
        capabilities: [],
        contextTypes: [],
        actions: [{ id: "commerce.cart.add", versionRef: "1.0.0" }],
        flows: [],
        brandRef: { id: brand.brand.id, versionRef: brand.brand.version },
        governanceRequirements: [],
        hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
        protocolProjections: [],
        triggers: [],
        distribution: {
          name: EXPERIENCE_NAME,
          description: "Governed Application generated by Vira Experience Studio.",
          tags: ["commerce", "studio"],
          visibility: "private",
          discoverable: false,
        },
        commercial: {
          entitlementRefs: [],
          meteringRefs: [],
          pricingRefs: [],
          settlementRefs: [],
        },
      },
    });
  };

  const publish = async () => {
    let current = await flushDraft();
    const release = await prepareCanonicalRelease(current);
    if (!release.ok) {
      setStatus(`Publish blocked · ${release.issue.code}: ${release.issue.message}`);
      return;
    }

    if (current.publishedDraftRevision !== current.draftRevision) {
      const published = await props.lifecycle.publish({
        workspaceId: WORKSPACE_ID,
        id: EXPERIENCE_ID,
        expectedRecordVersion: current.recordVersion,
      });
      if (!published.ok) {
        setStatus(`Publish failed · ${lifecycleIssue(published)}`);
        return;
      }
      applyRecord(published.value);
      current = published.value;
      await refreshHistory();
    }

    const staged = await publishStudioApplicationToStaging(release.value.application);
    if (!staged.ok) {
      const active = stagedReleaseRef.current;
      const suffix = active === null
        ? "no Application release is active in staging"
        : `active staging release remains ${active.release.id}@${active.release.version}`;
      setStatus(`Studio published r${current.draftRevision} · staging failed · ${staged.issue.code}: ${staged.issue.message} · ${suffix}`);
      return;
    }

    stagedReleaseRef.current = staged.value;
    setApplicationRelease(`${staged.value.release.id}@${staged.value.release.version}`);
    setExperiencePackRelease(`${release.value.experiencePack.id}@${release.value.experiencePack.version}`);
    setStagingState("Active · staging");
    setStatus(`Published · draft r${current.publishedDraftRevision ?? current.draftRevision} · Application staged`);
  };

  const unpublish = async () => {
    const current = await flushDraft();
    const staged = stagedReleaseRef.current;
    if (staged !== null) {
      const deprecated = await deprecateStudioApplicationStaging(staged);
      if (!deprecated.ok) {
        setStatus(`Unpublish blocked · staging deprecation failed · ${deprecated.issue.code}: ${deprecated.issue.message}`);
        return;
      }
      stagedReleaseRef.current = null;
      setStagingState("Deprecated · staging");
    }

    const unpublished = await props.lifecycle.unpublish({
      workspaceId: WORKSPACE_ID,
      id: EXPERIENCE_ID,
      expectedRecordVersion: current.recordVersion,
    });
    if (!unpublished.ok) {
      setStatus(`Staging release deprecated · Studio unpublish failed · ${lifecycleIssue(unpublished)}`);
      return;
    }
    applyRecord(unpublished.value);
    setApplicationRelease("Not prepared");
    setExperiencePackRelease("Not prepared");
    setStagingState("Not staged");
    setStatus("Publication removed · staged Application deprecated · draft retained");
  };

  const restore = async (draftRevision: number) => {
    if (autosaveTimerRef.current !== undefined) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = undefined;
    }
    await saveQueueRef.current;
    const restored = await props.lifecycle.restore({
      workspaceId: WORKSPACE_ID,
      id: EXPERIENCE_ID,
      expectedRecordVersion: recordRef.current.recordVersion,
      draftRevision,
    });
    if (!restored.ok) {
      setStatus(`Restore failed · ${lifecycleIssue(restored)}`);
      return;
    }
    const replaced = workbench.replaceDocument(restored.value.document);
    if (!replaced.ok) {
      setStatus(`Restore rejected by Workbench · ${replaced.issue.code}`);
      return;
    }
    applyRecord(restored.value);
    documentRef.current = replaced.value;
    setDocument(replaced.value);
    editSequenceRef.current += 1;
    lastSavedSequenceRef.current = editSequenceRef.current;
    setSurfaceRevision((value) => value + 1);
    setStatus(`Restored r${draftRevision} as new draft r${restored.value.draftRevision}`);
    await refreshHistory();
  };

  const compareRevision = async (draftRevision: number) => {
    if (draftRevision <= 1) return;
    const diff = await props.lifecycle.diff({
      workspaceId: WORKSPACE_ID,
      id: EXPERIENCE_ID,
      fromDraftRevision: draftRevision - 1,
      toDraftRevision: draftRevision,
    });
    if (!diff.ok) {
      setDiffSummary(`Diff failed · ${lifecycleIssue(diff)}`);
      return;
    }
    const paths = diff.value.changes.slice(0, 4).map((change) => `${change.kind} ${change.path}`).join(" · ");
    setDiffSummary(`r${draftRevision - 1} → r${draftRevision}: ${diff.value.changes.length} change(s)${paths ? ` · ${paths}` : ""}`);
  };

  const applyAiProposal = async () => {
    if (aiBusy || aiPrompt.trim().length === 0) return;
    setAiBusy(true);
    setAiStatus("Generating · deterministic demo provider, canonical validation active");
    try {
      await flushDraft();
      const baselineSequence = editSequenceRef.current;
      const baseline = documentRef.current;
      const generated = await generateCommerceStudioAiDraft(baseline, aiPrompt);
      if (!generated.ok) {
        setAiStatus(`Rejected · ${generated.issue.code}: ${generated.issue.message}`);
        return;
      }
      if (editSequenceRef.current !== baselineSequence || documentRef.current !== baseline) {
        setAiStatus("Rejected · draft changed while AI proposal was being generated");
        return;
      }
      let preflightNodeId = 1;
      const preflight = createStudioWorkbenchSession({
        document: generated.value,
        componentCatalog: brand.components,
        bindingSourceCatalog: brand.dataSources,
        actionAdapter: brand.actions,
        allocateNodeId: () => `ai-preflight-${preflightNodeId++}`,
      });
      if (!preflight.ok) {
        setAiStatus(`Rejected · Workbench preflight ${preflight.issue.code}`);
        return;
      }

      const sequence = baselineSequence + 1;
      setStatus("AI proposal accepted · saving canonical draft…");
      await queueSave(generated.value, sequence);
      if (lastSavedSequenceRef.current < sequence) {
        setAiStatus("Rejected · lifecycle save failed; editor document was not replaced");
        return;
      }

      const replaced = workbench.replaceDocument(generated.value);
      if (!replaced.ok) {
        setAiStatus(`Apply failed · Workbench ${replaced.issue.code}`);
        return;
      }
      editSequenceRef.current = sequence;
      documentRef.current = replaced.value;
      setDocument(replaced.value);
      setSurfaceRevision((value) => value + 1);
      setAiStatus("Applied · canonical Studio AI v2");
    } catch {
      setAiStatus("Rejected · unexpected AI authoring error");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <main className="product-shell">
      <header className="product-header">
        <div>
          <div className="eyebrow">PROD-06 · governed authoring</div>
          <h1>Vira Experience Studio</h1>
          <p>Create, preview, version and publish an experience without editing code.</p>
        </div>
        <div className="identity-grid" aria-label="Studio identity">
          <span>Brand<strong data-testid="brand-id">{brand.brand.id}</strong></span>
          <span>Template<strong data-testid="template-id">{template.id}</strong></span>
          <span>Experience<strong data-testid="experience-id">{document.id}</strong></span>
          <span>Views<strong data-testid="view-count">{document.views.length}</strong></span>
        </div>
      </header>

      <section className="lifecycle-strip" aria-label="Draft lifecycle">
        <div className="lifecycle-state">
          <span className="eyebrow">Lifecycle</span>
          <strong data-testid="status">{status}</strong>
          <span data-testid="published-state">
            {record.publishedDraftRevision === null ? "Not published" : `Published r${record.publishedDraftRevision}`}
          </span>
          <div className="canonical-release-grid" aria-label="Canonical release artifacts">
            <span>Application<strong data-testid="application-release">{applicationRelease}</strong></span>
            <span>Experience Pack<strong data-testid="experience-pack-release">{experiencePackRelease}</strong></span>
            <span>Deployment<strong data-testid="staging-state">{stagingState}</strong></span>
          </div>
          <button type="button" onClick={() => { void unpublish(); }} disabled={record.publication === null}>Unpublish</button>
        </div>
        <div className="history" data-testid="revision-history">
          <div className="history-heading">
            <strong>Revision history</strong>
            <span data-testid="revision-count">{history.length}</span>
          </div>
          <div className="revision-list">
            {history.map((revision) => (
              <div className="revision-row" key={revision.draftRevision}>
                <span>r{revision.draftRevision}</span>
                {revision.draftRevision > 1 ? (
                  <button type="button" data-testid={`revision-diff-${revision.draftRevision}`} onClick={() => { void compareRevision(revision.draftRevision); }}>Diff</button>
                ) : null}
                <button type="button" data-testid={`revision-restore-${revision.draftRevision}`} onClick={() => { void restore(revision.draftRevision); }}>Restore</button>
              </div>
            ))}
          </div>
        </div>
        <div className="diff-card" data-testid="revision-diff-summary">{diffSummary}</div>
      </section>

      <section className="ai-strip" aria-label="AI assisted authoring">
        <div>
          <span className="eyebrow">AI-assisted authoring</span>
          <strong>Provider proposes. Canonical Studio AI v2 validates.</strong>
          <small>Demo generation is deterministic; binding, flow, universal Host support and immutable identity are enforced by the real Studio AI boundary.</small>
        </div>
        <label>
          Prompt
          <input
            data-testid="ai-prompt"
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            disabled={aiBusy}
          />
        </label>
        <button data-testid="ai-apply" type="button" onClick={() => { void applyAiProposal(); }} disabled={aiBusy || aiPrompt.trim().length === 0}>
          {aiBusy ? "Validating…" : "Apply AI proposal"}
        </button>
        <span className="ai-status" data-testid="ai-status">{aiStatus}</span>
      </section>

      <div className={aiBusy ? "workbench-lock" : undefined} aria-busy={aiBusy}>
        <ViraStudioWorkbench
          key={surfaceRevision}
          session={workbench}
          renderers={commerceAuthoringRenderers}
          title="Commerce · Product card"
          height="720px"
          onDocumentChange={scheduleAutosave}
          onPublish={publish}
          onError={(issue) => setStatus(`Workbench error · ${issue.code}: ${issue.message}`)}
        />
      </div>
    </main>
  );
}

async function bootstrap(): Promise<void> {
  const store = new MemoryStudioLifecycleStore();
  let now = Date.UTC(2026, 8, 6, 1, 30, 0, 0);
  const lifecycle = createStudioLifecycleService({
    store,
    componentCatalog: brand.components,
    bindingSourceCatalog: brand.dataSources,
    actionAdapter: brand.actions,
    nowUnixMs: () => now++,
  });
  const created = await lifecycle.create({
    workspaceId: WORKSPACE_ID,
    id: EXPERIENCE_ID,
    name: EXPERIENCE_NAME,
    document: workbench.currentDocument(),
  });
  if (!created.ok) throw new Error(`lifecycle create rejected: ${lifecycleIssue(created)}`);
  const history = await lifecycle.history(WORKSPACE_ID, EXPERIENCE_ID);
  if (!history.ok) throw new Error(`lifecycle history rejected: ${lifecycleIssue(history)}`);

  const root = document.querySelector<HTMLDivElement>("#root");
  if (!root) throw new Error("missing root");
  createRoot(root).render(
    <StrictMode>
      <ProductStudio lifecycle={lifecycle} initialRecord={created.value} initialHistory={history.value} />
    </StrictMode>,
  );
}

void bootstrap();
