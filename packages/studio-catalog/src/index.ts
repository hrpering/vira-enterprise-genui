export {
  createStudioComponentCatalog,
  resolveStudioCatalogComponent,
  validateStudioDocumentAgainstCatalog,
  validateStudioDocumentPayloadCompleteness,
} from "./validate-v2.js";
export {
  STUDIO_CATALOG_LABEL_MAX_LENGTH,
  STUDIO_CATALOG_MAX_COMPONENTS,
  STUDIO_CATALOG_MAX_ENUM_OPTIONS,
  STUDIO_CATALOG_MAX_EVENTS_PER_COMPONENT,
  STUDIO_CATALOG_MAX_EVENT_PAYLOAD_FIELDS,
  STUDIO_CATALOG_MAX_PROPS_PER_COMPONENT,
  STUDIO_CATALOG_MAX_SLOTS_PER_COMPONENT,
  STUDIO_COMPONENT_CATALOG_VERSION,
} from "./types.js";
export type {
  ResolveStudioCatalogComponentResult,
  StudioCatalogComponentDefinition,
  StudioCatalogComponentKind,
  StudioCatalogDocumentValidationCode,
  StudioCatalogDocumentValidationIssue,
  StudioCatalogDocumentValidationResult,
  StudioCatalogEventDefinition,
  StudioCatalogEventPayloadDefinition,
  StudioCatalogPropDefinition,
  StudioCatalogPropType,
  StudioCatalogSlotDefinition,
  StudioComponentCatalog,
  StudioComponentCatalogResult,
  StudioComponentCatalogValidationCode,
  StudioComponentCatalogValidationIssue,
} from "./types.js";
