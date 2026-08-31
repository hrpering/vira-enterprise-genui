import {
  actionAdapter,
  bindingSourceCatalog,
  componentCatalog,
  createStarterDocument,
  starterTemplates,
  workbenchRenderers,
  runtimeRenderers,
} from "./catalog.js";

export const AIRLINE_BRAND_PACKAGE_INPUT = Object.freeze({
  version: "1",
  id: "airline.reference.package",
  brand: {
    version: "1",
    id: "airline.brand",
    displayName: "Vira Demo Air",
    tokenRefs: {},
  },
  components: componentCatalog,
  dataSources: bindingSourceCatalog,
  actions: actionAdapter,
  templates: starterTemplates.map((template) => Object.freeze({
    id: template.id,
    label: template.label,
    description: template.description,
    document: createStarterDocument(`airline.template.${template.id}`, template.id),
  })),
});

export const airlineAuthoringRenderers = workbenchRenderers;
export const airlineRuntimeRenderers = runtimeRenderers;
