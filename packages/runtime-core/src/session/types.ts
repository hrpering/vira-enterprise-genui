export const RUNTIME_SESSION_STATE_VERSION = "1" as const;
export const RUNTIME_SESSION_EVENT_VERSION = "1" as const;
export const RUNTIME_SESSION_INSTANCE_ID_MAX_LENGTH = 4_096 as const;
export const RUNTIME_SESSION_INITIAL_REVISION = 0 as const;

export const RUNTIME_SESSION_VISIBILITIES = Object.freeze([
  "foreground",
  "background",
] as const);
export const RUNTIME_SESSION_CONNECTIVITIES = Object.freeze([
  "connected",
  "disconnected",
] as const);
export const RUNTIME_SESSION_CONTINUITIES = Object.freeze([
  "live",
  "restored",
] as const);
export const RUNTIME_SESSION_CACHE_STATUSES = Object.freeze([
  "inactive",
  "verification-required",
] as const);
export const RUNTIME_SESSION_EVENT_TYPES = Object.freeze([
  "foreground",
  "background",
  "resume",
  "disconnect",
  "reconnect",
] as const);

export type RuntimeSessionVisibility = (typeof RUNTIME_SESSION_VISIBILITIES)[number];
export type RuntimeSessionConnectivity = (typeof RUNTIME_SESSION_CONNECTIVITIES)[number];
export type RuntimeSessionContinuity = (typeof RUNTIME_SESSION_CONTINUITIES)[number];
export type RuntimeSessionCacheStatus = (typeof RUNTIME_SESSION_CACHE_STATUSES)[number];
export type RuntimeSessionEventType = (typeof RUNTIME_SESSION_EVENT_TYPES)[number];

export interface RuntimeSessionState {
  readonly version: typeof RUNTIME_SESSION_STATE_VERSION;
  /** Exact opaque mounted Experience instance identity. Resolution remains owned by MASTER-05. */
  readonly instanceId: string;
  /** Session-availability revision. Distinct from RuntimeState and StudioHostSnapshot revisions. */
  readonly revision: number;
  readonly visibility: RuntimeSessionVisibility;
  readonly connectivity: RuntimeSessionConnectivity;
  readonly continuity: RuntimeSessionContinuity;
  readonly cacheStatus: RuntimeSessionCacheStatus;
}

export interface RuntimeSessionCreateInput {
  readonly visibility: RuntimeSessionVisibility;
  readonly connectivity: RuntimeSessionConnectivity;
}

export interface RuntimeSessionEvent {
  readonly version: typeof RUNTIME_SESSION_EVENT_VERSION;
  readonly type: RuntimeSessionEventType;
}

export type RuntimeSessionValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_INSTANCE_ID"
  | "INVALID_REVISION"
  | "INVALID_VISIBILITY"
  | "INVALID_CONNECTIVITY"
  | "INVALID_CONTINUITY"
  | "INVALID_CACHE_STATUS"
  | "INVALID_SESSION_INVARIANT";

export interface RuntimeSessionValidationIssue {
  readonly code: RuntimeSessionValidationCode;
  readonly path: string;
  readonly message: string;
}

export type RuntimeSessionCreateResult =
  | { readonly ok: true; readonly value: RuntimeSessionState }
  | { readonly ok: false; readonly issue: RuntimeSessionValidationIssue };

export type RuntimeSessionParseResult = RuntimeSessionCreateResult;

export type RuntimeSessionTransitionCode =
  | "INVALID_SESSION_STATE"
  | "INVALID_EVENT"
  | "REVISION_OVERFLOW";

export interface RuntimeSessionTransitionIssue {
  readonly code: RuntimeSessionTransitionCode;
  readonly path: string;
  readonly message: string;
}

export interface RuntimeSessionTransition {
  readonly state: RuntimeSessionState;
  readonly changed: boolean;
}

export type RuntimeSessionTransitionResult =
  | { readonly ok: true; readonly value: RuntimeSessionTransition }
  | { readonly ok: false; readonly issue: RuntimeSessionTransitionIssue };

export type RuntimeSessionRestoreCode =
  | "INVALID_INSTANCE_ID"
  | "INVALID_SESSION_STATE"
  | "INSTANCE_MISMATCH"
  | "REVISION_OVERFLOW";

export interface RuntimeSessionRestoreIssue {
  readonly code: RuntimeSessionRestoreCode;
  readonly path: string;
  readonly message: string;
}

export type RuntimeSessionRestoreResult =
  | { readonly ok: true; readonly value: RuntimeSessionTransition }
  | { readonly ok: false; readonly issue: RuntimeSessionRestoreIssue };
