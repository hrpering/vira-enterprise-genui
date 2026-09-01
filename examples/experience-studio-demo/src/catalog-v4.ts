import type { StudioComponentCatalog } from "@vira-enterprise-genui/studio-catalog";
import { createStudioDesignCatalog } from "@vira-enterprise-genui/studio-design";
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

const v4Catalog = createStudioDesignCatalog({
  version: baseComponentCatalog.version,
  id: baseComponentCatalog.id,
  brandId: baseComponentCatalog.brandId,
  components: [
    ...baseComponentCatalog.components,
    ...FORM_PRIMITIVE_COMPONENTS,
  ],
}, {
  colorMode: "any",
  fonts: ["Inter", "Arial", "Georgia"],
  allowGradient: true,
  shadows: ["none", "sm", "md", "lg", "xl"],
  layouts: ["block", "row", "column", "grid2", "grid3"],
});
if (!v4Catalog.ok) throw new Error(v4Catalog.issue.message);
export const componentCatalog: StudioComponentCatalog = v4Catalog.value;

export const workbenchRenderers: Readonly<Record<string, unknown>> = Object.freeze({
  ...baseWorkbenchRenderers,
  ...FORM_PRIMITIVE_WORKBENCH_RENDERERS,
});

export const runtimeRenderers: Readonly<Record<string, StudioRuntimeReactRenderer>> = Object.freeze({
  ...baseRuntimeRenderers,
  ...FORM_PRIMITIVE_RUNTIME_RENDERERS,
});
