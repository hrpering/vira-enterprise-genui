import { createStudioDesignCatalog } from "@vira-enterprise-genui/studio-design";
import { createStudioWorkbenchSession } from "@vira-enterprise-genui/studio-workbench";
import { ViraStudioWorkbench } from "@vira-enterprise-genui/studio-workbench-react";
import { createElement, useState } from "react";
import type { ComponentType, ReactElement } from "react";
import { createRoot } from "react-dom/client";

const baseCatalog = {
  version: "1",
  id: "pegasus.demo.components",
  brandId: "pegasus.demo",
  components: [
    { ref: "demo.layout.stack", label: "Stack", category: "layout", kind: "layout", props: [], slots: [{ name: "content", label: "Content" }], events: [] },
    { ref: "demo.component.heading", label: "Heading", category: "content", kind: "content", props: [{ key: "text", type: "string", required: true, bindable: false }], slots: [], events: [] },
    { ref: "demo.component.text", label: "Text", category: "content", kind: "content", props: [{ key: "text", type: "string", required: true, bindable: false }], slots: [], events: [] },
    { ref: "demo.component.airport", label: "Airport picker", category: "flight", kind: "input", props: [{ key: "label", type: "string", required: true, bindable: false }, { key: "value", type: "string", required: true, bindable: false }], slots: [], events: [] },
    { ref: "demo.component.date", label: "Date picker", category: "flight", kind: "input", props: [{ key: "label", type: "string", required: true, bindable: false }, { key: "value", type: "string", required: true, bindable: false }], slots: [], events: [] },
    { ref: "demo.component.button", label: "Button", category: "action", kind: "action", props: [{ key: "label", type: "string", required: true, bindable: false }], slots: [], events: [{ name: "press", label: "Press" }] },
    { ref: "demo.component.flight-list", label: "Flight list", category: "flight", kind: "content", props: [{ key: "items", type: "string", required: true, bindable: true }], slots: [], events: [] }
  ]
};

const styled = createStudioDesignCatalog(baseCatalog, {
  colorMode: "any",
  fonts: ["Inter", "Arial", "Georgia"],
  allowGradient: true,
  shadows: ["none", "sm", "md", "lg", "xl"],
  layouts: ["block", "row", "column", "grid2", "grid3"]
});
if (!styled.ok) throw new Error(styled.issue.message);
const componentCatalog = styled.value;

const bindingSourceCatalog = {
  version: "1",
  id: "pegasus.demo.data",
  sources: [{ kind: "domain", path: "travel.flight.results", label: "Flight search results", valueType: "string" }]
};

const actionAdapter = {
  version: "1",
  id: "pegasus.demo.actions",
  mappings: [{ event: "flight.search.submit", actionType: "travel.flight.search.submit" }]
};

const initialDocument = {
  version: "1",
  id: "pegasus.flight-discovery",
  recipeId: "travel.flight.search",
  entryView: "search",
  views: [
    {
      id: "search",
      nodes: [
        { id: "root", component: "demo.layout.stack", order: 0, props: { designbackgroundmode: "gradient", designgradientfrom: "#111827", designgradientto: "#312E81", designgradientangle: 135, designpadding: 36, designgap: 18, designradius: 28, designshadow: "xl", designlayout: "column" } },
        { id: "title", component: "demo.component.heading", parentId: "root", slot: "content", order: 0, props: { text: "Where do you want to fly?", designcolor: "#FFFFFF", designfont: "Inter", designfontsize: 42, designweight: "700", designlineheight: 1.08 } },
        { id: "origin", component: "demo.component.airport", parentId: "root", slot: "content", order: 1, props: { label: "From", value: "Istanbul (SAW)", designbackgroundmode: "solid", designbackground: "#FFFFFF", designcolor: "#111827", designpadding: 18, designradius: 18, designshadow: "md" } },
        { id: "destination", component: "demo.component.airport", parentId: "root", slot: "content", order: 2, props: { label: "To", value: "Berlin (BER)", designbackgroundmode: "solid", designbackground: "#FFFFFF", designcolor: "#111827", designpadding: 18, designradius: 18, designshadow: "md" } },
        { id: "date", component: "demo.component.date", parentId: "root", slot: "content", order: 3, props: { label: "Departure", value: "15 Sep 2026", designbackgroundmode: "solid", designbackground: "#FFFFFF", designcolor: "#111827", designpadding: 18, designradius: 18 } },
        { id: "submit", component: "demo.component.button", parentId: "root", slot: "content", order: 4, props: { label: "Find the best flights", designbackgroundmode: "solid", designbackground: "#FACC15", designcolor: "#111827", designpadding: 16, designradius: 16, designweight: "700", designshadow: "lg", designwidth: "full" } }
      ]
    },
    {
      id: "results",
      nodes: [
        { id: "root", component: "demo.layout.stack", order: 0, props: { designpadding: 28, designgap: 14, designlayout: "column" } },
        { id: "results-title", component: "demo.component.heading", parentId: "root", slot: "content", order: 0, props: { text: "Best flights", designfontsize: 34, designweight: "700" } },
        { id: "flights", component: "demo.component.flight-list", parentId: "root", slot: "content", order: 1, props: {} }
      ]
    }
  ],
  bindings: [{ viewId: "results", nodeId: "flights", prop: "items", source: { kind: "domain", path: "travel.flight.results" } }],
  interactions: [{ viewId: "search", nodeId: "submit", event: "press", actionEvent: "flight.search.submit", routes: [{ outcome: "success", viewId: "results" }] }]
};

let nodeSequence = 0;
const sessionResult = createStudioWorkbenchSession({
  document: initialDocument,
  componentCatalog,
  bindingSourceCatalog,
  actionAdapter,
  allocateNodeId: ({ component }) => `${component.split(".").at(-1) ?? "node"}-${++nodeSequence}`.toLowerCase()
});
if (!sessionResult.ok) throw new Error(sessionResult.issue.message);
const session = sessionResult.value;

type SlotComponent = ComponentType<{ minEmptyHeight?: number }>;
const renderers = {
  "demo.layout.stack": ({ props }: { props: Readonly<Record<string, unknown>> }) => {
    const Content = props.content as SlotComponent | undefined;
    return createElement("section", { className: "demo-stack" }, Content ? createElement(Content, { minEmptyHeight: 120 }) : null);
  },
  "demo.component.heading": ({ props }: { props: Readonly<Record<string, unknown>> }) => createElement("h1", { className: "demo-heading" }, String(props.text ?? "Heading")),
  "demo.component.text": ({ props }: { props: Readonly<Record<string, unknown>> }) => createElement("p", { className: "demo-text" }, String(props.text ?? "Text")),
  "demo.component.airport": ({ props }: { props: Readonly<Record<string, unknown>> }) => createElement("div", { className: "demo-field" }, createElement("span", null, String(props.label ?? "Airport")), createElement("strong", null, String(props.value ?? "Choose airport"))),
  "demo.component.date": ({ props }: { props: Readonly<Record<string, unknown>> }) => createElement("div", { className: "demo-field" }, createElement("span", null, String(props.label ?? "Date")), createElement("strong", null, String(props.value ?? "Choose date"))),
  "demo.component.button": ({ props }: { props: Readonly<Record<string, unknown>> }) => createElement("button", { className: "demo-button", type: "button" }, String(props.label ?? "Button")),
  "demo.component.flight-list": ({ props }: { props: Readonly<Record<string, unknown>> }) => createElement("div", { className: "demo-flights" }, String(props.items ?? "Bind this component from the Data panel"))
};

function App(): ReactElement {
  const [publication, setPublication] = useState<string>("Not published yet");
  return createElement("main", { className: "app-shell" },
    createElement("div", { className: "app-intro" },
      createElement("div", null, createElement("strong", null, "Vira Experience Studio"), createElement("span", null, "Human Puck authoring demo")),
      createElement("code", null, publication),
    ),
    createElement(ViraStudioWorkbench, {
      session,
      renderers,
      title: "Pegasus · Flight Discovery",
      height: "calc(100vh - 74px)",
      onPublish: (value) => setPublication(`Published ${value.id}`)
    })
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("demo root element missing");
createRoot(root).render(createElement(App));
