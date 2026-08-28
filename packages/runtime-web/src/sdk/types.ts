import type {
  ActionAdapterContract,
  ComponentAdapterContract,
} from "@vira-enterprise-genui/adapter-sdk";
import type { RuntimePermissionPolicy, RuntimeState } from "@vira-enterprise-genui/runtime-core";
import type { AccessibilityPolicy } from "../accessibility/index.js";
import type { RuntimeWebDomPort } from "../dom-lifecycle/index.js";
import type { RuntimeWebActionIdFactory } from "../events/index.js";
import type { ResponsivePolicy } from "../responsive/index.js";
import type { StateBindingProcessResult } from "../state-bindings/index.js";

export interface WebSdkConfiguration {
  readonly componentAdapter: ComponentAdapterContract;
  readonly actionAdapter: ActionAdapterContract;
  readonly permissionPolicy: RuntimePermissionPolicy;
  readonly accessibility: AccessibilityPolicy;
  readonly responsive: ResponsivePolicy;
  readonly domPort: RuntimeWebDomPort;
  readonly idFactory: RuntimeWebActionIdFactory;
}

export type WebSdkConfigurationValidationCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_COMPONENT_ADAPTER"
  | "INVALID_ACTION_ADAPTER"
  | "INVALID_PERMISSION_POLICY"
  | "INVALID_ACCESSIBILITY_POLICY"
  | "INVALID_RESPONSIVE_POLICY"
  | "INVALID_DOM_PORT"
  | "INVALID_ID_FACTORY";

export interface WebSdkConfigurationValidationIssue {
  readonly code: WebSdkConfigurationValidationCode;
  readonly path: string;
  readonly message: string;
}

export type WebSdkConfigurationResult =
  | { readonly ok: true; readonly value: WebSdkConfiguration }
  | { readonly ok: false; readonly issue: WebSdkConfigurationValidationIssue };

export type ViraGenUIMountValidationCode =
  | "INVALID_MOUNT_INPUT"
  | "SDK_DISPOSED"
  | "ALREADY_MOUNTED"
  | "INVALID_RUNTIME_STATE"
  | "STATE_BINDING_FAILED"
  | "INVALID_RENDER_INPUT"
  | "DOM_MOUNT_FAILED";

export interface ViraGenUIMountValidationIssue {
  readonly code: ViraGenUIMountValidationCode;
  readonly path: string;
  readonly message: string;
}

export interface ViraGenUIMountedExperience {
  readonly experienceId: string;
  readonly planId: string;
}

export type ViraGenUIMountResult =
  | { readonly ok: true; readonly value: ViraGenUIMountedExperience }
  | { readonly ok: false; readonly issue: ViraGenUIMountValidationIssue };

export type ViraGenUIDispatchValidationCode = "SDK_DISPOSED" | "NOT_MOUNTED";

export interface ViraGenUIDispatchValidationIssue {
  readonly code: ViraGenUIDispatchValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ViraGenUIDispatchResult =
  | StateBindingProcessResult
  | { readonly ok: false; readonly stage: "sdk"; readonly issue: ViraGenUIDispatchValidationIssue };

export interface ViraGenUI {
  mount(input: unknown): ViraGenUIMountResult;
  dispatch(event: unknown): ViraGenUIDispatchResult;
  currentState(): RuntimeState | undefined;
  isMounted(): boolean;
  unmount(): void;
  isDisposed(): boolean;
  dispose(): void;
}

export type CreateViraGenUIResult =
  | { readonly ok: true; readonly value: ViraGenUI }
  | { readonly ok: false; readonly issue: WebSdkConfigurationValidationIssue };
