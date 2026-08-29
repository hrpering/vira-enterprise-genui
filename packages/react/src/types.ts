import type {
  ViraGenUI,
  ViraGenUIEventMap,
  ViraGenUIMountResult,
  ViraGenUISubscriptionValidationIssue,
  WebSdkConfigurationValidationIssue,
} from "@vira-enterprise-genui/runtime-web";
import type { ForwardRefExoticComponent, RefAttributes } from "react";

export interface ViraReactWrapperIssue {
  readonly code: "SUBSCRIPTION_FAILED";
  readonly path: string;
  readonly message: string;
  readonly cause: ViraGenUISubscriptionValidationIssue;
}

export interface ViraExperienceHandle {
  getSdk(): ViraGenUI | undefined;
}

export interface ViraExperienceProps {
  readonly configuration: unknown;
  readonly experience: unknown;
  readonly onReady?: (sdk: ViraGenUI) => void;
  readonly onConfigurationError?: (issue: WebSdkConfigurationValidationIssue) => void;
  readonly onMountResult?: (result: ViraGenUIMountResult) => void;
  readonly onWrapperError?: (issue: ViraReactWrapperIssue) => void;
  readonly onAction?: (action: ViraGenUIEventMap["action"]) => void;
  readonly onEffect?: (effect: ViraGenUIEventMap["effect"]) => void;
  readonly onStateChange?: (state: ViraGenUIEventMap["statechange"]) => void;
  readonly onError?: (failure: ViraGenUIEventMap["error"]) => void;
}

export type ViraExperienceComponent = ForwardRefExoticComponent<
  ViraExperienceProps & RefAttributes<ViraExperienceHandle>
>;
