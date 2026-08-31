import type { StudioRuntimeReactRenderer } from "@vira-enterprise-genui/studio-runtime-react";
import { createElement } from "react";
import type { ComponentType, ReactNode } from "react";

export const COMMERCE_COMPONENTS = Object.freeze({
  stack: "commerce.layout.stack",
  title: "commerce.component.product-title",
  price: "commerce.component.product-price",
  addButton: "commerce.component.add-button",
} as const);

export const COMMERCE_BRAND_PACKAGE_INPUT = Object.freeze({
  version: "1",
  id: "commerce.reference.package",
  brand: {
    version: "1",
    id: "commerce.brand",
    displayName: "Commerce Reference",
    tokenRefs: {
      accent: "commerce.tokens.accent",
      surface: "commerce.tokens.surface",
      text: "commerce.tokens.text",
    },
  },
  components: {
    version: "1",
    id: "commerce.studio.components",
    brandId: "commerce.brand",
    components: [
      {
        ref: COMMERCE_COMPONENTS.stack,
        label: "Product stack",
        category: "commerce.layout",
        kind: "layout",
        props: [],
        slots: [{ name: "content", label: "Content" }],
        events: [],
      },
      {
        ref: COMMERCE_COMPONENTS.title,
        label: "Product title",
        category: "commerce.content",
        kind: "content",
        props: [{ key: "text", type: "string", required: true, bindable: true }],
        slots: [],
        events: [],
      },
      {
        ref: COMMERCE_COMPONENTS.price,
        label: "Product price",
        category: "commerce.content",
        kind: "content",
        props: [
          { key: "amount", type: "number", required: true, bindable: true },
          { key: "currency", type: "string", required: true, bindable: false },
        ],
        slots: [],
        events: [],
      },
      {
        ref: COMMERCE_COMPONENTS.addButton,
        label: "Add to cart",
        category: "commerce.action",
        kind: "action",
        props: [{ key: "label", type: "string", required: true, bindable: false }],
        slots: [],
        events: [{ name: "press", label: "Add product" }],
      },
    ],
  },
  dataSources: {
    version: "1",
    id: "commerce.studio.data",
    sources: [
      { kind: "domain", path: "product.title", label: "Product · title", valueType: "string" },
      { kind: "domain", path: "product.price", label: "Product · price", valueType: "number" },
    ],
  },
  actions: {
    version: "1",
    id: "commerce.studio.actions",
    mappings: [{ event: "product.add", actionType: "commerce.cart.add" }],
  },
  templates: [{
    id: "product-card",
    label: "Product card",
    description: "Minimal non-airline template used to prove generic Studio brand loading.",
    document: {
      version: "1",
      id: "commerce.template.product-card",
      recipeId: "commerce.product-card",
      entryView: "main",
      views: [{
        id: "main",
        nodes: [
          { id: "root", component: COMMERCE_COMPONENTS.stack, order: 0, props: {} },
          { id: "title", component: COMMERCE_COMPONENTS.title, parentId: "root", slot: "content", order: 0, props: {} },
          { id: "price", component: COMMERCE_COMPONENTS.price, parentId: "root", slot: "content", order: 1, props: { currency: "EUR" } },
          { id: "add", component: COMMERCE_COMPONENTS.addButton, parentId: "root", slot: "content", order: 2, props: { label: "Add to cart" } },
        ],
      }],
      bindings: [
        { viewId: "main", nodeId: "title", prop: "text", source: { kind: "domain", path: "product.title" } },
        { viewId: "main", nodeId: "price", prop: "amount", source: { kind: "domain", path: "product.price" } },
      ],
      interactions: [{
        viewId: "main",
        nodeId: "add",
        event: "press",
        actionEvent: "product.add",
        routes: [],
      }],
    },
  }],
} as const);

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

type SlotComponent = ComponentType<{ minEmptyHeight?: number }>;

export const commerceAuthoringRenderers = Object.freeze({
  [COMMERCE_COMPONENTS.stack]: ({ props }: { readonly props: Readonly<Record<string, unknown>> }) => {
    const Content = props.content as SlotComponent | undefined;
    return createElement("section", {
      style: { display: "grid", gap: 12, padding: 18, border: "1px solid #d1d5db", borderRadius: 14 },
    }, Content ? createElement(Content, { minEmptyHeight: 80 }) : null);
  },
  [COMMERCE_COMPONENTS.title]: ({ props }: { readonly props: Readonly<Record<string, unknown>> }) => (
    createElement("h2", { style: { margin: 0 } }, text(props.text, "Product title"))
  ),
  [COMMERCE_COMPONENTS.price]: ({ props }: { readonly props: Readonly<Record<string, unknown>> }) => (
    createElement("strong", null, `${text(props.currency, "EUR")} ${number(props.amount, 0).toFixed(2)}`)
  ),
  [COMMERCE_COMPONENTS.addButton]: ({ props }: { readonly props: Readonly<Record<string, unknown>> }) => (
    createElement("button", { type: "button" }, text(props.label, "Add to cart"))
  ),
});

const runtimeStack: StudioRuntimeReactRenderer = ({ slots }) => createElement(
  "section",
  { style: { display: "grid", gap: 12, padding: 18, border: "1px solid #d1d5db", borderRadius: 14 } },
  ...(slots.content ?? []),
);
const runtimeTitle: StudioRuntimeReactRenderer = ({ props }) => (
  createElement("h2", { style: { margin: 0 } }, text(props.text, "Product title"))
);
const runtimePrice: StudioRuntimeReactRenderer = ({ props }) => (
  createElement("strong", null, `${text(props.currency, "EUR")} ${number(props.amount, 0).toFixed(2)}`)
);
const runtimeButton: StudioRuntimeReactRenderer = ({ props, emit }) => createElement(
  "button",
  { type: "button", onClick: () => { emit("press", {}); } },
  text(props.label, "Add to cart"),
);

export const commerceRuntimeRenderers: Readonly<Record<string, StudioRuntimeReactRenderer>> = Object.freeze({
  [COMMERCE_COMPONENTS.stack]: runtimeStack,
  [COMMERCE_COMPONENTS.title]: runtimeTitle,
  [COMMERCE_COMPONENTS.price]: runtimePrice,
  [COMMERCE_COMPONENTS.addButton]: runtimeButton,
});

export type CommercePreview = Readonly<{
  title: string;
  price: number;
  currency: string;
}>;

export function commercePreviewData(): CommercePreview {
  return Object.freeze({ title: "Canvas v2 Backpack", price: 89, currency: "EUR" });
}

export type CommerceRendererOutput = ReactNode;
