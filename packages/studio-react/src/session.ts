import type { Config } from "@puckeditor/core";
import {
  createStudioPuckEditorMetadata,
  studioViewToPuckData,
} from "@vira-enterprise-genui/studio-puck-adapter";
import type {
  StudioPuckComponentEditorDefinition,
  StudioPuckField,
} from "@vira-enterprise-genui/studio-puck-adapter";
import { createElement } from "react";
import type { ReactNode } from "react";
import { createStudioColorPuckField } from "./color-field.js";
import { createStudioReactDesignState } from "@vira-enterprise-genui/studio-design-react";
import type {
  StudioPuckShellSessionResult,
  StudioPuckShellValidationCode,
  StudioTrustedRenderContext,
  StudioTrustedRenderer,
} from "./types.js";

function failure(
  code: StudioPuckShellValidationCode,
  path: string,
  message: string,
): StudioPuckShellSessionResult {
  return { ok: false, issue: { code, path, message } };
}

type RendererRegistryResult =
  | { readonly ok: true; readonly value: ReadonlyMap<string, StudioTrustedRenderer> }
  | { readonly ok: false; readonly result: StudioPuckShellSessionResult };

function readRendererRegistry(
  input: unknown,
  componentRefs: readonly string[],
): RendererRegistryResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, result: failure("INVALID_RENDERER_REGISTRY", "$.renderers", "renderer registry must be a plain object") };
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    return { ok: false, result: failure("INVALID_RENDERER_REGISTRY", "$.renderers", "renderer registry must be a plain object") };
  }
  if (Object.getOwnPropertySymbols(input).length > 0 || Object.getOwnPropertyNames(input).length !== Object.keys(input).length) {
    return { ok: false, result: failure("INVALID_RENDERER_REGISTRY", "$.renderers", "renderer registry must use enumerable string data properties only") };
  }

  const expected = new Set(componentRefs);
  const actual = Object.keys(input);
  const extra = actual.sort().find((key) => !expected.has(key));
  if (extra) return { ok: false, result: failure("EXTRA_RENDERER", `$.renderers.${extra}`, "renderer registry contains a component not present in the active Studio catalog") };

  const renderers = new Map<string, StudioTrustedRenderer>();
  for (const componentRef of componentRefs) {
    const descriptor = Object.getOwnPropertyDescriptor(input, componentRef);
    if (!descriptor || !("value" in descriptor)) {
      return { ok: false, result: failure("MISSING_RENDERER", `$.renderers.${componentRef}`, "active Studio component is missing a trusted editor renderer") };
    }
    if (typeof descriptor.value !== "function") {
      return { ok: false, result: failure("INVALID_RENDERER_REGISTRY", `$.renderers.${componentRef}`, "trusted editor renderer must be a function") };
    }
    renderers.set(componentRef, descriptor.value as StudioTrustedRenderer);
  }
  return { ok: true, value: renderers };
}

function clonePuckFields(fields: Readonly<Record<string, StudioPuckField>>): Record<string, unknown> {
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, field] of Object.entries(fields)) {
    switch (field.type) {
      case "color":
        output[key] = createStudioColorPuckField(field.label);
        break;
      case "select":
        output[key] = { ...field, options: field.options.map((option) => ({ ...option })) };
        break;
      case "radio":
        output[key] = { ...field, options: field.options.map((option) => ({ ...option })) };
        break;
      default:
        output[key] = { ...field };
    }
  }
  return output;
}

function createRender(
  definition: StudioPuckComponentEditorDefinition,
  renderer: StudioTrustedRenderer,
): (props: Record<string, unknown>) => ReactNode {
  return (renderProps) => {
    const nodeId = typeof renderProps.id === "string" ? renderProps.id : "";
    const design = createStudioReactDesignState(renderProps);
    const context: StudioTrustedRenderContext = Object.freeze({
      component: definition.type,
      nodeId,
      props: design.props,
    });
    const rendered = renderer(context);
    return design.style === undefined ? rendered : createElement("div", { style: design.style }, rendered);
  };
}

type DynamicComponentConfig = {
  readonly label: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly defaultProps: Readonly<Record<string, string | number | boolean>>;
  readonly render: (props: Record<string, unknown>) => ReactNode;
};

type DynamicCategoryConfig = {
  readonly title: string;
  readonly components: readonly string[];
};

function createConfig(
  metadata: ReturnType<typeof createStudioPuckEditorMetadata> & { readonly ok: true },
  renderers: ReadonlyMap<string, StudioTrustedRenderer>,
): Config {
  const components: Record<string, DynamicComponentConfig> = Object.create(null) as Record<string, DynamicComponentConfig>;
  for (const definition of metadata.value.components) {
    const renderer = renderers.get(definition.type);
    if (!renderer) throw new Error("validated Studio renderer registry invariant failed");
    components[definition.type] = {
      label: definition.label,
      fields: clonePuckFields(definition.fields),
      defaultProps: { ...definition.defaultProps },
      render: createRender(definition, renderer),
    };
  }

  const categories: Record<string, DynamicCategoryConfig> = Object.create(null) as Record<string, DynamicCategoryConfig>;
  for (const [category, definition] of Object.entries(metadata.value.categories)) {
    categories[category] = {
      title: definition.title,
      components: [...definition.components],
    };
  }
  return { components, categories } as unknown as Config;
}

export function createStudioPuckShellSession(input: {
  readonly document: unknown;
  readonly catalog: unknown;
  readonly viewId: string;
  readonly renderers: unknown;
}): StudioPuckShellSessionResult {
  const metadata = createStudioPuckEditorMetadata(input.catalog);
  if (!metadata.ok) return failure("INVALID_STUDIO_INPUT", metadata.issue.path, metadata.issue.message);
  const data = studioViewToPuckData(input.document, input.catalog, input.viewId);
  if (!data.ok) return failure("INVALID_STUDIO_INPUT", data.issue.path, data.issue.message);
  const registry = readRendererRegistry(input.renderers, metadata.value.components.map((component) => component.type));
  if (!registry.ok) return registry.result;

  return {
    ok: true,
    value: Object.freeze({
      config: createConfig(metadata, registry.value),
      data: data.value,
    }),
  };
}
