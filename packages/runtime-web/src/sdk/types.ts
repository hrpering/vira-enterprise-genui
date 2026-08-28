import type {
  ActionAdapterContract,
  ComponentAdapterContract,
} from "@vira-enterprise-genui/adapter-sdk";
import type { RuntimePermissionPolicy } from "@vira-enterprise-genui/runtime-core";
import type { AccessibilityPolicy } from "../accessibility/index.js";
import type { RuntimeWebDomPort } from "../dom-lifecycle/index.js";
import type { RuntimeWebActionIdFactory } from "../events/index.js";
import type { ResponsivePolicy } from "../responsive/index.js";

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
