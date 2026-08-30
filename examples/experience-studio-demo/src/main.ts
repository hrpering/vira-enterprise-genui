import "../../airline-brand-kit/styles/base.css";
import "../../airline-brand-kit/styles/booking-flow.css";
import "./brand-gallery.css";
import { planExperience } from "@vira-enterprise-genui/planner";
import { createRuntimeState } from "@vira-enterprise-genui/runtime-core";
import { createStudioRuntimeSession } from "@vira-enterprise-genui/studio-runtime";
import { renderStudioRuntimeReactView } from "@vira-enterprise-genui/studio-runtime-react";
import { createStudioWorkbenchSession } from "@vira-enterprise-genui/studio-workbench";
import { ViraStudioWorkbench } from "@vira-enterprise-genui/studio-workbench-react";
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import {
  actionAdapter,
  bindingSourceCatalog,
  componentCatalog,
  createStarterDocument,
  runtimePermissionPolicy,
  runtimeRenderers,
  starterPreview,
  starterTemplates,
  workbenchRenderers,
} from "./catalog.js";
import type { StarterTemplateId } from "./catalog.js";
import {
  createExperience,
  deleteExperience,
  listExperiences,
  publishExperience,
  readExperience,
  readPublicExperience,
  saveExperienceDraft,
  unpublishExperience,
} from "./api.js";
import type { ExperienceRecord, ExperienceSummary, PublicExperience } from "./api.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected Studio error";
}

function semanticIdFromName(name: string): string {
  let slug = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!/^[a-z]/.test(slug)) slug = `experience-${slug || "new"}`;
  return `demo.${slug}`;
}

function navigateToExperience(id?: string): void {
  const url = id ? `/?experience=${encodeURIComponent(id)}` : "/";
  window.history.pushState({}, "", url);
}

interface CreateDialogProps {
  readonly initialTemplate: StarterTemplateId;
  readonly onCancel: () => void;
  readonly onCreated: (record: ExperienceRecord) => void;
}

function CreateDialog({ initialTemplate, onCancel, onCreated }: CreateDialogProps): ReactElement {
  const templateDefinition = starterTemplates.find((candidate) => candidate.id === initialTemplate);
  if (!templateDefinition) throw new Error(`Unknown starter template: ${initialTemplate}`);
  const [name, setName] = useState(templateDefinition.label);
  const [id, setId] = useState(semanticIdFromName(templateDefinition.label));
  const [template, setTemplate] = useState<StarterTemplateId>(initialTemplate);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string>();
  const customId = useRef(false);

  async function submit(): Promise<void> {
    setBusy(true);
    setIssue(undefined);
    try {
      const record = await createExperience({ id, name: name.trim(), document: createStarterDocument(id, template) });
      onCreated(record);
    } catch (error) {
      setIssue(errorMessage(error));
      setBusy(false);
    }
  }

  return createElement(
    "div",
    { className: "dialog-backdrop", role: "presentation" },
    createElement(
      "section",
      { className: "create-dialog", role: "dialog", "aria-modal": true, "aria-labelledby": "create-title" },
      createElement("div", { className: "dialog-kicker" }, "Create a persisted Studio draft"),
      createElement("h2", { id: "create-title" }, "New experience"),
      createElement("p", null, "Start from the same brand component library used by the Vira airline integration. Publish creates a separate live artifact."),
      createElement("div", { className: "dialog-selected-preview" }, starterPreview(template)),
      createElement(
        "label",
        { className: "dialog-field" },
        createElement("span", null, "Name"),
        createElement("input", {
          value: name,
          "data-testid": "new-experience-name",
          onChange: (event: { target: { value: string } }) => {
            const next = event.target.value;
            setName(next);
            if (!customId.current) setId(semanticIdFromName(next));
          },
        }),
      ),
      createElement(
        "label",
        { className: "dialog-field" },
        createElement("span", null, "Experience ID"),
        createElement("input", {
          value: id,
          "data-testid": "new-experience-id",
          onChange: (event: { target: { value: string } }) => {
            customId.current = true;
            setId(event.target.value);
          },
        }),
      ),
      createElement(
        "label",
        { className: "dialog-field" },
        createElement("span", null, "Starter"),
        createElement(
          "select",
          {
            value: template,
            "data-testid": "new-experience-template",
            onChange: (event: { target: { value: string } }) => setTemplate(event.target.value as StarterTemplateId),
          },
          ...starterTemplates.map((item) => createElement("option", { key: item.id, value: item.id }, item.label)),
        ),
      ),
      issue ? createElement("div", { className: "dialog-error", role: "alert" }, issue) : null,
      createElement(
        "div",
        { className: "dialog-actions" },
        createElement("button", { type: "button", className: "secondary-button", onClick: onCancel, disabled: busy }, "Cancel"),
        createElement("button", { type: "button", className: "primary-button", onClick: () => void submit(), disabled: busy || name.trim().length === 0 || id.trim().length === 0, "data-testid": "create-experience" }, busy ? "Creating…" : "Create experience"),
      ),
    ),
  );
}

interface DashboardProps {
  readonly onOpen: (id: string) => void;
}

function Dashboard({ onOpen }: DashboardProps): ReactElement {
  const [experiences, setExperiences] = useState<readonly ExperienceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [issue, setIssue] = useState<string>();
  const [dialogTemplate, setDialogTemplate] = useState<StarterTemplateId>();

  async function refresh(): Promise<void> {
    setLoading(true);
    try {
      setExperiences(await listExperiences());
      setIssue(undefined);
    } catch (error) {
      setIssue(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  return createElement(
    "main",
    { className: "studio-home" },
    createElement(
      "header",
      { className: "home-header" },
      createElement("div", null, createElement("strong", null, "Vira Experience Studio"), createElement("span", null, "Author with the same brand components Vira renders at runtime")),
      createElement("button", { type: "button", className: "primary-button", onClick: () => setDialogTemplate("blank"), "data-testid": "new-experience" }, "+ New experience"),
    ),
    createElement(
      "section",
      { className: "home-section" },
      createElement("div", { className: "section-heading" }, createElement("div", null, createElement("span", null, "Persisted"), createElement("h1", null, "Your experiences")), createElement("button", { type: "button", className: "text-button", onClick: () => void refresh() }, "Refresh")),
      issue ? createElement("div", { className: "home-error", role: "alert" }, issue) : null,
      loading
        ? createElement("div", { className: "empty-card" }, "Loading persisted drafts…")
        : experiences.length === 0
          ? createElement("div", { className: "empty-card" }, createElement("strong", null, "No experiences yet"), createElement("span", null, "Choose a visual starter below, edit it, publish it, and open the separate live runtime URL."))
          : createElement(
              "div",
              { className: "experience-grid", "data-testid": "experience-list" },
              ...experiences.map((experience) => createElement(
                "button",
                { key: experience.id, type: "button", className: "experience-card", onClick: () => onOpen(experience.id), "data-testid": `experience-${experience.id}` },
                createElement("div", { className: "experience-card-top" }, createElement("strong", null, experience.name), createElement("span", { className: experience.published ? "status published" : "status draft" }, experience.published ? "Published" : "Draft")),
                createElement("code", null, experience.id),
                createElement("span", null, experience.published ? "Live publication available" : "Not live yet"),
              )),
            ),
    ),
    createElement(
      "section",
      { className: "home-section starter-library" },
      createElement("div", { className: "section-heading" }, createElement("div", null, createElement("span", null, "Shared brand component library"), createElement("h2", null, "Start from a real GenUI surface"), createElement("p", { className: "section-copy" }, "These thumbnails are rendered by the same airline brand renderer used by the Vira integration, not screenshots or placeholder cards."))),
      createElement(
        "div",
        { className: "template-grid visual-template-grid", "data-testid": "starter-gallery" },
        ...starterTemplates.map((template) => createElement(
          "article",
          { key: template.id, className: "template-card visual-template-card", "data-template": template.id },
          createElement("div", { className: "template-preview", "aria-hidden": true }, starterPreview(template.id)),
          createElement("div", { className: "template-card-copy" },
            createElement("strong", null, template.label),
            createElement("p", null, template.description),
            createElement("button", { type: "button", className: "secondary-button", onClick: () => setDialogTemplate(template.id), "data-testid": `create-template-${template.id}` }, "Create from starter")),
        )),
      ),
    ),
    dialogTemplate ? createElement(CreateDialog, {
      initialTemplate: dialogTemplate,
      onCancel: () => setDialogTemplate(undefined),
      onCreated: (record) => {
        setDialogTemplate(undefined);
        onOpen(record.id);
      },
    }) : null,
  );
}

interface EditorProps {
  readonly record: ExperienceRecord;
  readonly onBack: () => void;
  readonly onDeleted: () => void;
}

function Editor({ record, onBack, onDeleted }: EditorProps): ReactElement {
  const [published, setPublished] = useState(record.publication !== null);
  const [saveState, setSaveState] = useState("Saved");
  const [issue, setIssue] = useState<string>();
  const nodeSequence = useRef(0);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  const sessionResult = useMemo(() => createStudioWorkbenchSession({
    document: record.document,
    componentCatalog,
    bindingSourceCatalog,
    actionAdapter,
    allocateNodeId: ({ component }) => `${component.split(".").at(-1) ?? "node"}-${++nodeSequence.current}`.toLowerCase(),
  }), [record.id]);

  if (!sessionResult.ok) {
    return createElement("main", { className: "fatal-page" }, createElement("h1", null, "Studio draft could not be opened"), createElement("pre", null, sessionResult.issue.message), createElement("button", { onClick: onBack }, "Back"));
  }
  const session = sessionResult.value;

  function persistDraft(document: ExperienceRecord["document"]): void {
    setSaveState("Saving…");
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => saveExperienceDraft(record.id, record.name, document))
      .then(() => { setSaveState("Saved"); setIssue(undefined); })
      .catch((error: unknown) => { setSaveState("Save failed"); setIssue(errorMessage(error)); });
  }

  async function unpublish(): Promise<void> {
    if (!window.confirm("Unpublish this experience? Its live URL will stop resolving immediately.")) return;
    try {
      await unpublishExperience(record.id);
      setPublished(false);
      setIssue(undefined);
    } catch (error) {
      setIssue(errorMessage(error));
    }
  }

  async function remove(): Promise<void> {
    if (!window.confirm("Delete this experience draft and any live publication? This cannot be undone.")) return;
    try {
      await deleteExperience(record.id);
      onDeleted();
    } catch (error) {
      setIssue(errorMessage(error));
    }
  }

  return createElement(
    "main",
    { className: "editor-page" },
    createElement(
      "div",
      { className: "app-intro" },
      createElement("div", { className: "intro-left" }, createElement("button", { type: "button", className: "back-button", onClick: onBack }, "← Experiences"), createElement("div", null, createElement("strong", null, record.name), createElement("code", null, record.id))),
      createElement(
        "div",
        { className: "lifecycle-actions" },
        createElement("span", { className: "save-state" }, saveState),
        createElement("span", { className: published ? "status published" : "status draft", "data-testid": "publication-status" }, published ? "Published live" : "Draft only"),
        published ? createElement("a", { className: "secondary-button link-button", href: `/live/${encodeURIComponent(record.id)}`, target: "_blank", rel: "noreferrer", "data-testid": "open-live" }, "Open live ↗") : null,
        published ? createElement("button", { type: "button", className: "secondary-button", onClick: () => void unpublish(), "data-testid": "unpublish-experience" }, "Unpublish") : null,
        createElement("button", { type: "button", className: "danger-button", onClick: () => void remove(), "data-testid": "delete-experience" }, "Delete"),
      ),
    ),
    issue ? createElement("div", { className: "editor-error", role: "alert" }, issue) : null,
    createElement(ViraStudioWorkbench, {
      session,
      renderers: workbenchRenderers,
      title: record.name,
      height: "calc(100vh - 74px)",
      onDocumentChange: (document) => persistDraft(document),
      onPublish: async (publication) => {
        await publishExperience(record.id, publication);
        setPublished(true);
        setIssue(undefined);
      },
      onError: (workbenchIssue) => setIssue(workbenchIssue.message),
    }),
  );
}

function StudioApp(): ReactElement {
  const initialId = new URLSearchParams(window.location.search).get("experience") ?? undefined;
  const [selectedId, setSelectedId] = useState<string | undefined>(initialId);
  const [record, setRecord] = useState<ExperienceRecord>();
  const [loading, setLoading] = useState(Boolean(initialId));
  const [issue, setIssue] = useState<string>();

  useEffect(() => {
    if (!selectedId) {
      setRecord(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    void readExperience(selectedId)
      .then((value) => { setRecord(value); setIssue(undefined); })
      .catch((error: unknown) => setIssue(errorMessage(error)))
      .finally(() => setLoading(false));
  }, [selectedId]);

  function open(id: string): void {
    navigateToExperience(id);
    setSelectedId(id);
  }

  function back(): void {
    navigateToExperience();
    setSelectedId(undefined);
    setRecord(undefined);
    setIssue(undefined);
  }

  if (!selectedId) return createElement(Dashboard, { onOpen: open });
  if (loading) return createElement("main", { className: "fatal-page" }, "Loading persisted Studio draft…");
  if (issue || !record) return createElement("main", { className: "fatal-page" }, createElement("h1", null, "Experience unavailable"), createElement("p", null, issue ?? "Draft not found"), createElement("button", { onClick: back }, "Back to experiences"));
  return createElement(Editor, { record, onBack: back, onDeleted: back });
}

function buildRuntime(publicExperience: PublicExperience) {
  const planned = planExperience({
    id: `live-${publicExperience.id.replaceAll(".", "-")}`,
    intent: { version: "1", namespace: "studio.live", name: "published" },
    state: {},
    requiredState: [],
    capabilityRequirements: [],
    availableCapabilities: [],
    futureCapabilities: [],
  });
  if (!planned.ok) throw new Error(planned.issue.message);
  const runtimeState = createRuntimeState(`live-${publicExperience.id.replaceAll(".", "-")}`, planned.value);
  if (!runtimeState.ok) throw new Error(runtimeState.issue.message);
  let actionSequence = 0;
  const runtime = createStudioRuntimeSession({
    publication: publicExperience.publication,
    componentCatalog,
    bindingSourceCatalog,
    actionAdapter,
    runtimeState: runtimeState.value,
    permissionPolicy: runtimePermissionPolicy,
  }, {
    data: { read: () => undefined },
    actionIds: { nextId: () => `live-action-${++actionSequence}` },
  });
  if (!runtime.ok) throw new Error(runtime.issue.message);
  return runtime.value;
}

function PublishedExperience({ value }: { readonly value: PublicExperience }): ReactElement {
  const runtime = useMemo(() => buildRuntime(value), [value.id, value.publishedAt]);
  useEffect(() => () => runtime.dispose(), [runtime]);
  const rendered = renderStudioRuntimeReactView({ session: runtime, componentCatalog, renderers: runtimeRenderers });
  if (!rendered.ok) return createElement("main", { className: "fatal-page" }, createElement("h1", null, "Published runtime failed"), createElement("p", null, rendered.issue.message));
  return createElement(
    "main",
    { className: "live-page", "data-testid": "live-experience" },
    createElement("header", { className: "live-header" }, createElement("div", null, createElement("span", { className: "live-dot" }), createElement("strong", null, value.name), createElement("code", null, value.id)), createElement("span", null, "Published Vira runtime")),
    createElement("section", { className: "live-canvas" }, rendered.value),
  );
}

function LiveApp({ id }: { readonly id: string }): ReactElement {
  const [value, setValue] = useState<PublicExperience>();
  const [notPublished, setNotPublished] = useState(false);
  const [issue, setIssue] = useState<string>();
  useEffect(() => {
    void readPublicExperience(id)
      .then((result) => { setValue(result); setNotPublished(false); setIssue(undefined); })
      .catch((error: unknown) => {
        const message = errorMessage(error);
        if (message.includes("not published")) setNotPublished(true); else setIssue(message);
      });
  }, [id]);
  if (notPublished) return createElement("main", { className: "live-missing", "data-testid": "live-not-published" }, createElement("span", null, "404"), createElement("h1", null, "This experience is not published"), createElement("p", null, "The live publication was removed. The Studio draft may still exist."), createElement("a", { href: "/" }, "Open Experience Studio"));
  if (issue) return createElement("main", { className: "live-missing" }, createElement("h1", null, "Live experience failed"), createElement("p", null, issue));
  if (!value) return createElement("main", { className: "live-missing" }, "Loading published experience…");
  return createElement(PublishedExperience, { value });
}

const root = document.getElementById("root");
if (!root) throw new Error("demo root element missing");
const liveMatch = window.location.pathname.match(/^\/live\/([^/]+)$/);
createRoot(root).render(liveMatch ? createElement(LiveApp, { id: decodeURIComponent(liveMatch[1] ?? "") }) : createElement(StudioApp));
