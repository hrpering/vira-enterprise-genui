export { VIRA_APPLICATION_AI_HOST_SDK_VERSION } from "./types.js";
export type {
  ViraApplicationAiHostCompatibilityPlan,
  ViraApplicationAiHostDescriptor,
  ViraApplicationAiHostIssue,
  ViraApplicationAiHostIssueCode,
  ViraApplicationAiHostResult,
} from "./types.js";
export { evaluateViraApplicationForAiHost } from "./evaluate.js";

export { VIRA_APPLICATION_AI_HOST_SDK_V2_VERSION } from "./v2-types.js";
export type {
  ViraApplicationAiHostCompatibilityPlanV2,
  ViraApplicationAiHostV2Issue,
  ViraApplicationAiHostV2Result,
} from "./v2-types.js";
export { evaluateViraApplicationForAiHostV2 } from "./v2-evaluate.js";

export {
  VIRA_EXTERNAL_AI_HOST_ADAPTER_VERSION,
  VIRA_EXTERNAL_AI_HOST_FAMILIES,
  VIRA_EXTERNAL_AI_HOST_FEATURES,
  planViraExternalAiHostAdapter,
} from "./external-adapter.js";
export type {
  ViraExternalAiHostAdapterIssue,
  ViraExternalAiHostAdapterIssueCode,
  ViraExternalAiHostAdapterPlan,
  ViraExternalAiHostAdapterProfile,
  ViraExternalAiHostAdapterResult,
  ViraExternalAiHostFamily,
  ViraExternalAiHostFeature,
} from "./external-adapter.js";
