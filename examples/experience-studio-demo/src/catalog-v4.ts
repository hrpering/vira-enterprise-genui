import type { StudioComponentCatalog } from "@vira-enterprise-genui/studio-catalog";
import type { StudioRuntimeReactRenderer } from "@vira-enterprise-genui/studio-runtime-react";
import {
  actionAdapter,
  bindingSourceCatalog,
  componentCatalog as baseComponentCatalog,
  createStarterDocument,
  runtimePermissionPolicy,
  runtimeRenderers as baseRuntimeRenderers,
  starterPreview,
  starterTemplates,
  workbenchRenderers as baseWorkbenchRenderers,
} from "./catalog-v3.js";
import type { StarterTemplateId } from "./catalog-v3.js";
import {
  FORM_PRIMITIVE_COMPONENTS,
  FORM_PRIMITIVE_RUNTIME_RENDERERS,
  FORM_PRIMITIVE_WORKBENCH_RENDERERS,
} from "./form-primitives-v4.js";

export {
  actionAdapter,
  bindingSourceCatalog,
  createStarterDocument,
  runtimePermissionPolicy,
  starterPreview,
  starterTemplates,
};
export type { StarterTemplateId };

export const componentCatalog: StudioComponentCatalog = Object.freeze({
  ...baseComponentCatalog,
  components: Object.freeze([
    ...baseComponentCatalog.components,
    ...FORM_PRIMITIVE_COMPONENTS,
  ]),
});

export const workbenchRenderers: Readonly<Record<string, unknown>> = Object.freeze({
  ...baseWorkbenchRenderers,
  ...FORM_PRIMITIVE_WORKBENCH_RENDERERS,
});

export const runtimeRenderers: Readonly<Record<string, StudioRuntimeReactRenderer>> = Object.freeze({
  ...baseRuntimeRenderers,
  ...FORM_PRIMITIVE_RUNTIME_RENDERERS,
});
