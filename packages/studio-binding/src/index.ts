export {
  clearStudioActionPayloadBinding,
  clearStudioBinding,
  clearStudioRepeat,
  createStudioBindingSourceCatalog,
  getStudioActionPayloadTargets,
  getStudioBindingTargets,
  getStudioRepeatTargets,
  setStudioActionPayloadBinding,
  setStudioBinding,
  setStudioRepeat,
  validateStudioDocumentBindings,
} from "./validate-v2.js";
export { STUDIO_BINDING_LABEL_MAX_LENGTH, STUDIO_BINDING_MAX_SOURCES, STUDIO_BINDING_SOURCE_CATALOG_VERSION } from "./types.js";
export type {
  StudioActionPayloadTargetOption, StudioActionPayloadTargetsResult, StudioBindingDocumentResult, StudioBindingSourceCatalog,
  StudioBindingSourceCatalogResult, StudioBindingSourceDefinition, StudioBindingTargetOption, StudioBindingTargetsResult,
  StudioBindingValidationCode, StudioBindingValueType, StudioRepeatTargetOptions, StudioRepeatTargetsResult,
} from "./types.js";
