export {
  actionAdapter,
  bindingSourceCatalog,
  componentCatalog,
  runtimePermissionPolicy,
  runtimeRenderers,
  starterTemplates,
  workbenchRenderers,
} from "./catalog-v2.js";
export type { StarterTemplateId } from "./catalog-v2.js";

import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import type { ReactElement } from "react";
import {
  createStarterDocument as createBaseStarterDocument,
  starterPreview as baseStarterPreview,
} from "./catalog-v2.js";
import type { StarterTemplateId } from "./catalog-v2.js";
import {
  createHybridAirlineDocument,
  isHybridAirlineTemplate,
} from "./airline-hybrid-templates.js";

export function createStarterDocument(
  experienceId: string,
  template: StarterTemplateId,
): StudioExperienceDocument {
  return isHybridAirlineTemplate(template)
    ? createHybridAirlineDocument(experienceId, template)
    : createBaseStarterDocument(experienceId, template);
}

export function starterPreview(template: StarterTemplateId): ReactElement {
  return baseStarterPreview(template);
}
