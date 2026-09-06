import type { ViraCapabilityDefinition, ViraCapabilityExactReference } from "@vira-enterprise-genui/capability-contract";
import type { ViraEnterpriseScope } from "@vira-enterprise-genui/enterprise-context";
import type { ViraHostedCapabilityBinding, ViraHostedCapabilityProviderFailure, ViraHostedCapabilityValue } from "./types.js";

export const VIRA_HOSTED_CAPABILITY_JOB_VERSION = "1" as const;
export const VIRA_HOSTED_CAPABILITY_DELIVERY_MODES = Object.freeze(["inline", "async-job"] as const);
export const VIRA_HOSTED_CAPABILITY_JOB_STATUSES = Object.freeze([
  "running",
  "cancel-requested",
  "completed",
  "failed",
  "timed-out",
  "cancelled",
] as const);
export const VIRA_HOSTED_CAPABILITY_JOB_COMPLETION_MODES = Object.freeze(["poll", "webhook"] as const);
export const VIRA_HOSTED_CAPABILITY_JOB_COMPLETION_SOURCES = Object.freeze(["poll", "webhook"] as const);
export const VIRA_HOSTED_CAPABILITY_JOB_RETRY_POLICIES = Object.freeze(["never", "query-safe", "provider-declared"] as const);
export const VIRA_HOSTED_CAPABILITY_JOB_ID_MAX_LENGTH = 256 as const;
export const VIRA_HOSTED_CAPABILITY_PROVIDER_JOB_REF_MAX_LENGTH = 512 as const;
export const VIRA_HOSTED_CAPABILITY_COMPLETION_ID_MAX_LENGTH = 256 as const;

export type ViraHostedCapabilityDeliveryMode = (typeof VIRA_HOSTED_CAPABILITY_DELIVERY_MODES)[number];
export type ViraHostedCapabilityJobStatus = (typeof VIRA_HOSTED_CAPABILITY_JOB_STATUSES)[number];
export type ViraHostedCapabilityJobCompletionMode = (typeof VIRA_HOSTED_CAPABILITY_JOB_COMPLETION_MODES)[number];
export type ViraHostedCapabilityJobCompletionSource = (typeof VIRA_HOSTED_CAPABILITY_JOB_COMPLETION_SOURCES)[number];
export type ViraHostedCapabilityJobRetryPolicy = (typeof VIRA_HOSTED_CAPABILITY_JOB_RETRY_POLICIES)[number];

export interface ViraHostedCapabilityProviderAuthority {
  readonly version: typeof VIRA_HOSTED_CAPABILITY_JOB_VERSION;
  readonly connectionId: string;
  readonly trustEvidenceId: string;
  readonly trusted: true;
  readonly validUntilEpochMs: number;
}

export type ViraHostedCapabilityJobTerminalResult =
  | {
      readonly outcome: "success";
      readonly output: ViraHostedCapabilityValue;
      readonly resultDigest: string;
    }
  | {
      readonly outcome: "empty";
      readonly resultDigest: string;
    }
  | {
      readonly outcome: "error";
      readonly failure: ViraHostedCapabilityProviderFailure;
      readonly resultDigest: string;
    };

export interface ViraHostedCapabilityJobCompletion {
  readonly source: ViraHostedCapabilityJobCompletionSource;
  readonly completionId: string;
  readonly completedAtEpochMs: number;
  readonly result: ViraHostedCapabilityJobTerminalResult;
}

export interface ViraHostedCapabilityJob {
  readonly version: typeof VIRA_HOSTED_CAPABILITY_JOB_VERSION;
  readonly id: string;
  readonly scope: ViraEnterpriseScope;
  readonly revision: number;
  readonly status: ViraHostedCapabilityJobStatus;
  readonly invocationId: string;
  readonly capabilityRef: ViraCapabilityExactReference;
  readonly bindingRef: ViraCapabilityExactReference;
  readonly providerId: string;
  readonly providerConnectionId: string;
  readonly trustEvidenceId: string;
  readonly providerJobRef: string;
  readonly completionMode: ViraHostedCapabilityJobCompletionMode;
  readonly retryPolicy: ViraHostedCapabilityJobRetryPolicy;
  readonly deadlineEpochMs: number;
  readonly startedAtEpochMs: number;
  readonly updatedAtEpochMs: number;
  readonly cancelRequestedAtEpochMs: number | null;
  readonly cancelledAtEpochMs: number | null;
  readonly timedOutAtEpochMs: number | null;
  readonly completion: ViraHostedCapabilityJobCompletion | null;
}

export interface ViraHostedCapabilityJobStartInput {
  readonly id: string;
  readonly scope: ViraEnterpriseScope;
  readonly invocationId: string;
  readonly capability: ViraCapabilityDefinition;
  readonly binding: ViraHostedCapabilityBinding;
  readonly authority: ViraHostedCapabilityProviderAuthority;
  readonly providerJobRef: string;
  readonly completionMode: ViraHostedCapabilityJobCompletionMode;
  readonly retryPolicy: ViraHostedCapabilityJobRetryPolicy;
  readonly deadlineEpochMs: number;
}

export interface ViraHostedCapabilityJobCompletionInput {
  readonly scope: ViraEnterpriseScope;
  readonly id: string;
  readonly expectedRevision: number;
  readonly completion: ViraHostedCapabilityJobCompletion;
}

export interface ViraHostedCapabilityJobMutationInput {
  readonly scope: ViraEnterpriseScope;
  readonly id: string;
  readonly expectedRevision: number;
}

export interface ViraHostedCapabilityJobAuthorizedMutationInput extends ViraHostedCapabilityJobMutationInput {
  readonly authority: ViraHostedCapabilityProviderAuthority;
}

export type ViraHostedCapabilityJobStoreFailureCode = "ALREADY_EXISTS" | "NOT_FOUND" | "VERSION_CONFLICT";
export type ViraHostedCapabilityJobStoreMutationResult =
  | { readonly ok: true; readonly value: ViraHostedCapabilityJob }
  | { readonly ok: false; readonly code: ViraHostedCapabilityJobStoreFailureCode };

export interface ViraHostedCapabilityJobStore {
  read(scope: ViraEnterpriseScope, id: string): Promise<ViraHostedCapabilityJob | undefined> | ViraHostedCapabilityJob | undefined;
  create(job: ViraHostedCapabilityJob): Promise<ViraHostedCapabilityJobStoreMutationResult> | ViraHostedCapabilityJobStoreMutationResult;
  replace(job: ViraHostedCapabilityJob, expectedRevision: number): Promise<ViraHostedCapabilityJobStoreMutationResult> | ViraHostedCapabilityJobStoreMutationResult;
}

export type ViraHostedCapabilityJobIssueCode =
  | "INVALID_JOB_INPUT"
  | "INVALID_SCOPE"
  | "INVALID_CAPABILITY"
  | "INVALID_BINDING"
  | "CAPABILITY_MISMATCH"
  | "ACTION_BOUNDARY_REQUIRED"
  | "INVALID_AUTHORITY"
  | "PROVIDER_AUTHORITY_MISMATCH"
  | "PROVIDER_AUTHORITY_REVOKED"
  | "INVALID_COMPLETION"
  | "ALREADY_EXISTS"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "TERMINAL_STATE"
  | "TIMEOUT_NOT_REACHED"
  | "LATE_COMPLETION"
  | "CANCEL_NOT_REQUESTED"
  | "RETRY_NOT_QUERY_SAFE";

export interface ViraHostedCapabilityJobIssue {
  readonly code: ViraHostedCapabilityJobIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraHostedCapabilityJobResult<T = ViraHostedCapabilityJob> =
  | { readonly ok: true; readonly value: T; readonly replay?: boolean }
  | { readonly ok: false; readonly issue: ViraHostedCapabilityJobIssue };

export interface ViraHostedCapabilityJobServiceConfiguration {
  readonly store: ViraHostedCapabilityJobStore;
  readonly nowEpochMs: () => number;
}

export interface ViraHostedCapabilityJobService {
  start(input: ViraHostedCapabilityJobStartInput): Promise<ViraHostedCapabilityJobResult>;
  read(scope: ViraEnterpriseScope, id: string): Promise<ViraHostedCapabilityJobResult>;
  authorizePoll(input: ViraHostedCapabilityJobAuthorizedMutationInput): Promise<ViraHostedCapabilityJobResult>;
  requestCancel(input: ViraHostedCapabilityJobAuthorizedMutationInput): Promise<ViraHostedCapabilityJobResult>;
  confirmCancelled(input: ViraHostedCapabilityJobMutationInput): Promise<ViraHostedCapabilityJobResult>;
  timeout(input: ViraHostedCapabilityJobMutationInput): Promise<ViraHostedCapabilityJobResult>;
  complete(input: ViraHostedCapabilityJobCompletionInput): Promise<ViraHostedCapabilityJobResult>;
}

export interface ViraHostedCapabilityQueryRetryGuardInput {
  readonly capability: ViraCapabilityDefinition;
  readonly retryPolicy: ViraHostedCapabilityJobRetryPolicy;
}
