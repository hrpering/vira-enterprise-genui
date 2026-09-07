import type { ViraApplicationExactReference, ViraApplicationReleaseReference } from "@vira-enterprise-genui/application-package";
import type { ViraApplicationResolution } from "@vira-enterprise-genui/application-resolution";
import type { ViraEnterpriseScope } from "@vira-enterprise-genui/enterprise-context";

export const VIRA_APPLICATION_RUN_VERSION = "1" as const;
export const VIRA_APPLICATION_RUN_STATUSES = Object.freeze(["running", "waiting", "paused", "completed", "failed"] as const);
export const VIRA_APPLICATION_RUN_WAIT_KINDS = Object.freeze(["event", "timer", "human-task", "application-call"] as const);

export type ViraApplicationRunStatus = (typeof VIRA_APPLICATION_RUN_STATUSES)[number];
export type ViraApplicationRunWaitKind = (typeof VIRA_APPLICATION_RUN_WAIT_KINDS)[number];

export interface ViraApplicationRunResolutionPin {
  readonly release: ViraApplicationReleaseReference;
  readonly environment: ViraEnterpriseScope["environment"];
  readonly deploymentId: string;
  readonly deploymentRevision: number;
  readonly artifactId: string;
  readonly distributionDigest: string;
  readonly resolutionDigest: string;
}

export interface ViraApplicationRunWait {
  readonly id: string;
  readonly kind: ViraApplicationRunWaitKind;
  readonly reference: string;
  readonly dueAtUnixMs: number | null;
}

export interface ViraApplicationRun {
  readonly version: typeof VIRA_APPLICATION_RUN_VERSION;
  readonly id: string;
  readonly scope: ViraEnterpriseScope;
  readonly revision: number;
  readonly status: ViraApplicationRunStatus;
  readonly resolution: ViraApplicationRunResolutionPin;
  readonly entrypointRef: ViraApplicationExactReference;
  readonly workContextId: string | null;
  readonly wait: ViraApplicationRunWait | null;
  readonly createdAtUnixMs: number;
  readonly updatedAtUnixMs: number;
}

export type ViraApplicationRunStoreMutationCode = "ALREADY_EXISTS" | "NOT_FOUND" | "VERSION_CONFLICT";
export type ViraApplicationRunStoreMutationResult =
  | { readonly ok: true; readonly value: ViraApplicationRun }
  | { readonly ok: false; readonly code: ViraApplicationRunStoreMutationCode };

/** Durable store boundary. replace() MUST atomically compare expectedRevision in the write itself. */
export interface ViraApplicationRunStore {
  readonly read: (scope: ViraEnterpriseScope, id: string) => Promise<ViraApplicationRun | undefined>;
  readonly create: (run: ViraApplicationRun) => Promise<ViraApplicationRunStoreMutationResult>;
  readonly replace: (run: ViraApplicationRun, expectedRevision: number) => Promise<ViraApplicationRunStoreMutationResult>;
}

export type ViraApplicationRunIssueCode =
  | "INVALID_SERVICE"
  | "INVALID_INPUT"
  | "INVALID_SCOPE"
  | "INVALID_RESOLUTION"
  | "INVALID_ENTRYPOINT"
  | "INVALID_WAIT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_STATE"
  | "REVISION_OVERFLOW"
  | "STORE_FAILURE";

export interface ViraApplicationRunIssue {
  readonly code: ViraApplicationRunIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraApplicationRunResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraApplicationRunIssue };

export interface ViraApplicationRunServiceConfiguration {
  readonly store: ViraApplicationRunStore;
  readonly nowUnixMs: () => number;
}

export interface ViraApplicationRunCreateInput {
  readonly id: string;
  readonly scope: unknown;
  readonly resolution: ViraApplicationResolution | unknown;
  readonly entrypointRef: unknown;
  readonly workContextId: string | null;
}

export interface ViraApplicationRunWaitInput {
  readonly scope: unknown;
  readonly id: string;
  readonly expectedRevision: number;
  readonly wait: unknown;
}

export interface ViraApplicationRunResumeInput {
  readonly scope: unknown;
  readonly id: string;
  readonly expectedRevision: number;
  readonly waitId: string;
}

export interface ViraApplicationRunService {
  readonly create: (input: ViraApplicationRunCreateInput) => Promise<ViraApplicationRunResult<ViraApplicationRun>>;
  readonly read: (scope: unknown, id: string) => Promise<ViraApplicationRunResult<ViraApplicationRun>>;
  readonly wait: (input: ViraApplicationRunWaitInput) => Promise<ViraApplicationRunResult<ViraApplicationRun>>;
  readonly resume: (input: ViraApplicationRunResumeInput) => Promise<ViraApplicationRunResult<ViraApplicationRun>>;
}
