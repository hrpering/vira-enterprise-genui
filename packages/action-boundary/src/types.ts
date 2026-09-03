import type { JsonObject } from "@vira-enterprise-genui/protocol";
import type {
  RuntimeAction,
  RuntimePermissionEffect,
} from "@vira-enterprise-genui/runtime-core";

export const VIRA_ACTION_BOUNDARY_VERSION = "1" as const;
export const VIRA_ACTION_BOUNDARY_MAX_CATALOG = 512 as const;
export const VIRA_ACTION_BOUNDARY_MAX_IDEMPOTENCY_KEY_LENGTH = 256 as const;
export const VIRA_ACTION_BOUNDARY_MAX_SAFE_INTEGER = 9_007_199_254_740_991 as const;

export type ViraActionEffect = "read" | "write" | "irreversible";
export type ViraActionIdempotency = "none" | "action-id";
export type ViraActionReceiptOutcome = "success" | "empty" | "error";

export interface ViraActionDefinition {
  readonly actionType: string;
  readonly effect: ViraActionEffect;
  readonly idempotency: ViraActionIdempotency;
}

export interface ViraActionIntent {
  readonly version: typeof VIRA_ACTION_BOUNDARY_VERSION;
  readonly instanceId: string;
  readonly expectedStateRevision: number;
  readonly idempotencyKey: string;
  readonly action: RuntimeAction;
}

/** Compatibility alias for the initial MASTER-08 branch name. */
export type ViraActionBoundaryProposal = ViraActionIntent;

export interface ViraActionConfirmationGrant {
  readonly version: typeof VIRA_ACTION_BOUNDARY_VERSION;
  readonly instanceId: string;
  readonly actionId: string;
  readonly actionType: string;
  readonly expectedStateRevision: number;
  readonly idempotencyKey: string;
}

export interface ViraActionExecutionPermit {
  readonly version: typeof VIRA_ACTION_BOUNDARY_VERSION;
  readonly instanceId: string;
  readonly actionId: string;
  readonly actionType: string;
  readonly effect: ViraActionEffect;
  readonly idempotency: ViraActionIdempotency;
  readonly expectedStateRevision: number;
  readonly idempotencyKey: string;
}

export interface ViraActionConfirmationChallenge {
  readonly version: typeof VIRA_ACTION_BOUNDARY_VERSION;
  readonly instanceId: string;
  readonly actionId: string;
  readonly actionType: string;
  readonly effect: ViraActionEffect;
  readonly expectedStateRevision: number;
  readonly idempotencyKey: string;
}

export interface ViraTrustedActionAdapterResult {
  readonly outcome: ViraActionReceiptOutcome;
  readonly stateRevision: number;
  readonly data?: JsonObject;
}

export interface ViraActionReceipt {
  readonly version: typeof VIRA_ACTION_BOUNDARY_VERSION;
  readonly instanceId: string;
  readonly actionId: string;
  readonly actionType: string;
  readonly effect: ViraActionEffect;
  readonly idempotencyKey: string;
  readonly expectedStateRevision: number;
  readonly observedStateRevision: number;
  readonly outcome: ViraActionReceiptOutcome;
  readonly data?: JsonObject;
}

export interface ViraActionExecutorInput {
  readonly permit: ViraActionExecutionPermit;
  readonly definition: ViraActionDefinition;
  readonly intent: ViraActionIntent;
  readonly action: RuntimeAction;
}

export type ViraActionExecutor = (
  input: ViraActionExecutorInput,
) => Promise<ViraTrustedActionAdapterResult> | ViraTrustedActionAdapterResult;

export type ViraActionBoundaryIssueCode =
  | "INVALID_BOUNDARY"
  | "INVALID_CATALOG"
  | "INVALID_PERMISSION_POLICY"
  | "INVALID_INTENT"
  | "INSTANCE_MISMATCH"
  | "ACTION_NOT_REGISTERED"
  | "PERMISSION_DENIED"
  | "CONFIRMATION_REQUIRED"
  | "INVALID_CONFIRMATION"
  | "INVALID_REVISION"
  | "STALE_REVISION"
  | "DUPLICATE_ACTION"
  | "DUPLICATE_IDEMPOTENCY_KEY"
  | "INVALID_ADAPTER_RESULT"
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
  readonly receipt: ViraActionReceipt;
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
  readonly revisionProvider: () => number;
}

export interface ViraActionBoundary {
  readonly version: typeof VIRA_ACTION_BOUNDARY_VERSION;
  readonly instanceId: string;
  readonly definition: (actionType: string) => ViraActionDefinition | undefined;
  readonly currentRevision: () => number;
  readonly execute: (
    intent: ViraActionIntent,
    executor: ViraActionExecutor,
    confirmation?: ViraActionConfirmationGrant,
  ) => Promise<ViraActionBoundaryExecutionResult>;
  readonly consumedAction: (actionId: string) => boolean;
  readonly consumedIdempotencyKey: (idempotencyKey: string) => boolean;
  readonly dispose: () => void;
}

export type ViraActionBoundaryCreateResult =
  | { readonly ok: true; readonly value: ViraActionBoundary }
  | { readonly ok: false; readonly issue: ViraActionBoundaryIssue };

export type ViraActionPayload = JsonObject;
