import type { JsonObject } from "@vira-enterprise-genui/protocol";

export const STUDIO_HOST_BRIDGE_VERSION = "1" as const;
export const STUDIO_HOST_SNAPSHOT_VERSION = "1" as const;
export const STUDIO_HOST_ACTION_OUTCOMES = Object.freeze(["success", "empty", "error"] as const);

export type StudioHostActionOutcome = (typeof STUDIO_HOST_ACTION_OUTCOMES)[number];

export interface StudioHostActionDescriptor {
  readonly type: string;
  readonly payload: JsonObject;
}

export interface StudioHostSnapshot {
  readonly version: typeof STUDIO_HOST_SNAPSHOT_VERSION;
  readonly revision: number;
  readonly state: JsonObject;
  readonly domain: JsonObject;
}

export interface StudioHostActionResult {
  readonly outcome: StudioHostActionOutcome;
  readonly snapshot?: StudioHostSnapshot;
}

export type StudioHostSnapshotListener = (snapshot: StudioHostSnapshot) => void;
export type StudioHostUnsubscribe = () => void;

export interface StudioHostBridge {
  readonly version: typeof STUDIO_HOST_BRIDGE_VERSION;
  readonly id: string;
  readonly snapshot: () => StudioHostSnapshot;
  readonly dispatch: (action: StudioHostActionDescriptor) => Promise<StudioHostActionResult>;
  readonly subscribe: (listener: StudioHostSnapshotListener) => StudioHostUnsubscribe;
}

export type StudioHostValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ID"
  | "INVALID_REVISION"
  | "INVALID_STATE"
  | "INVALID_DOMAIN"
  | "INVALID_OUTCOME"
  | "INVALID_SNAPSHOT"
  | "INVALID_BRIDGE";

export interface StudioHostValidationIssue {
  readonly code: StudioHostValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StudioHostSnapshotResult =
  | { readonly ok: true; readonly value: StudioHostSnapshot }
  | { readonly ok: false; readonly issue: StudioHostValidationIssue };

export type StudioHostActionResultValidationResult =
  | { readonly ok: true; readonly value: StudioHostActionResult }
  | { readonly ok: false; readonly issue: StudioHostValidationIssue };

export type StudioHostBridgeResult =
  | { readonly ok: true; readonly value: StudioHostBridge }
  | { readonly ok: false; readonly issue: StudioHostValidationIssue };
