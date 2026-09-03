import type { JsonObject } from "@vira-enterprise-genui/protocol";
import type {
  RuntimeAction,
  RuntimePermissionEffect,
} from "@vira-enterprise-genui/runtime-core";

export const VIRA_ACTION_BOUNDARY_VERSION = "1" as const;
export const VIRA_ACTION_BOUNDARY_MAX_CATALOG = 512 as const;

export type ViraActionEffect = "read" | "write" | "irreversible";
export type ViraActionIdempotency = "none" | "action-id";

export interface ViraActionDefinition {
  readonly actionType: string;
  readonly effect: ViraActionEffect;
  readonly idempotency: ViraActionIdempotency;
}

export interface ViraActionBoundaryProposal {
  readonly version: typeof VIRA_ACTION_BOUNDARY_VERSION;
  readonly instanceId: string;
  readonly action: RuntimeAction;
}

export interface ViraActionConfirmationGrant {
  readonly version: typeof VIRA_ACTION_BOUNDARY_VERSION;
  readonly instanceId: string;
  readonly actionId: string;
  readonly actionType: string;
}

export interface ViraActionExecutionPermit {
  readonly version: typeof VIRA_ACTION_BOUNDARY_VERSION;
  readonly instanceId: string;
  readonly actionId: string;
  readonly actionType: string;
  readonly effect: ViraActionEffect;
  readonly idempotency: ViraActionIdempotency;
}

export interface ViraActionConfirmationChallenge {
  readonly version: typeof VIRA_ACTION_BOUNDARY_VERSION;
  readonly instanceId: string;
  readonly actionId: string;
  readonly actionType: string;
  readonly effect: ViraActionEffect;
}

export interface ViraActionExecutorInput {
  readonly permit: ViraActionExecutionPermit;
  readonly definition: ViraActionDefinition;
  readonly action: RuntimeAction;
}

export type ViraActionExecutor = (input: ViraActionExecutorInput) => Promise<unknown> | unknown;

export type ViraActionBoundaryIssueCode =
  | "INVALID_BOUNDARY"
  | "INVALID_CATALOG"
  | "INVALID_PERMISSION_POLICY"
  | "INVALID_PROPOSAL"
  | "INSTANCE_MISMATCH"
  | "ACTION_NOT_REGISTERED"
  | "PERMISSION_DENIED"
  | "CONFIRMATION_REQUIRED"
  | "INVALID_CONFIRMATION"
  | "DUPLICATE_ACTION"
  | "EXECUTOR_FAILED"
  | "DISPOSED";

export interface ViraActionBoundaryIssue {
  readonly code: ViraActionBoundaryIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface ViraActionBoundaryExecutionSuccess {
  readonly permit: ViraActionExecutionPermit;
  readonly permission: RuntimePermissionEffect;
  readonly result: unknown;
}

export type ViraActionBoundaryExecutionResult =
  | { readonly ok: true; readonly value: ViraActionBoundaryExecutionSuccess }
  | {
      readonly ok: false;
      readonly issue: ViraActionBoundaryIssue;
      readonly challenge?: ViraActionConfirmationChallenge;
    };

export interface ViraActionBoundaryInput {
  readonly instanceId: string;
  readonly catalog: readonly ViraActionDefinition[];
  readonly permissionPolicy: unknown;
}

export interface ViraActionBoundary {
  readonly version: typeof VIRA_ACTION_BOUNDARY_VERSION;
  readonly instanceId: string;
  readonly definition: (actionType: string) => ViraActionDefinition | undefined;
  readonly execute: (
    proposal: ViraActionBoundaryProposal,
    executor: ViraActionExecutor,
    confirmation?: ViraActionConfirmationGrant,
  ) => Promise<ViraActionBoundaryExecutionResult>;
  readonly consumed: (actionId: string) => boolean;
  readonly dispose: () => void;
}

export type ViraActionBoundaryCreateResult =
  | { readonly ok: true; readonly value: ViraActionBoundary }
  | { readonly ok: false; readonly issue: ViraActionBoundaryIssue };

export type ViraActionPayload = JsonObject;
