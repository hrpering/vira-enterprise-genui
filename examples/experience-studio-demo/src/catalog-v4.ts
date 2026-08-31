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

export const componentCatalog = Object.freeze({
  ...baseComponentCatalog,
  components: Object.freeze([
    ...baseComponentCatalog.components,
    ...FORM_PRIMITIVE_COMPONENTS,
  ]),
});

export const workbenchRenderers = Object.freeze({
  ...baseWorkbenchRenderers,
  ...FORM_PRIMITIVE_WORKBENCH_RENDERERS,
});

export const runtimeRenderers = Object.freeze({
  ...baseRuntimeRenderers,
  ...FORM_PRIMITIVE_RUNTIME_RENDERERS,
});
