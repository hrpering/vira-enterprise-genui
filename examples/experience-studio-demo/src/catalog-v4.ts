import type { StudioComponentCatalog } from "@vira-enterprise-genui/studio-catalog";
import { createStudioDesignCatalog } from "@vira-enterprise-genui/studio-design";
import type { StudioRuntimeReactRenderer } from "@vira-enterprise-genui/studio-runtime-react";
import {
  actionAdapter,
  bindingSourceCatalog,
  componentCatalog as baseComponentCatalog,
  createStarterDocument as createBaseStarterDocument,
  runtimePermissionPolicy,
  runtimeRenderers as baseRuntimeRenderers,
  starterPreview as baseStarterPreview,
  starterTemplates as baseStarterTemplates,
  workbenchRenderers as baseWorkbenchRenderers,
} from "./catalog-v3.js";
import type { StarterTemplateId as BaseStarterTemplateId } from "./catalog-v3.js";
import {
  FORM_PRIMITIVE_COMPONENTS,
  FORM_PRIMITIVE_RUNTIME_RENDERERS,
  FORM_PRIMITIVE_WORKBENCH_RENDERERS,
} from "./form-primitives-v4.js";
import { createGoldenAirlineExperience } from "./golden-airline-experience.js";

export {
  actionAdapter,
  bindingSourceCatalog,
  runtimePermissionPolicy,
};

export const BOOKING_JOURNEY_TEMPLATE_ID = "booking-journey" as const;
export type StarterTemplateId = BaseStarterTemplateId | typeof BOOKING_JOURNEY_TEMPLATE_ID;

export const starterTemplates = Object.freeze([
  ...baseStarterTemplates,
  Object.freeze({
    id: BOOKING_JOURNEY_TEMPLATE_ID,
    label: "Full booking journey",
    description: "Editable nine-view flight booking journey from search through confirmation.",
    component: "airline.layout.stack",
  }),
] as const);

export function createStarterDocument(experienceId: string, template: StarterTemplateId) {
  return template === BOOKING_JOURNEY_TEMPLATE_ID
    ? createGoldenAirlineExperience(experienceId)
    : createBaseStarterDocument(experienceId, template);
}

export function starterPreview(template: StarterTemplateId) {
  return baseStarterPreview(template === BOOKING_JOURNEY_TEMPLATE_ID ? "flight-search" : template);
}

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
