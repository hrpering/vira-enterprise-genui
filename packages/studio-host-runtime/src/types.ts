import type { StudioHostActionOutcome, StudioHostSnapshot } from "@vira-enterprise-genui/studio-host";
import type { StudioRuntimeCompletion, StudioRuntimeDispatchResult, StudioRuntimeSession } from "@vira-enterprise-genui/studio-runtime";
import type { StudioBindingSource } from "@vira-enterprise-genui/studio-schema";

export type StudioHostRuntimeValidationCode =
  | "INVALID_HOST"
  | "INVALID_SNAPSHOT"
  | "STALE_SNAPSHOT"
  | "HOST_DISPATCH_FAILED"
  | "INVALID_HOST_RESULT"
  | "RUNTIME_COMPLETION_FAILED"
  | "DISPOSED";

export interface StudioHostRuntimeIssue {
  readonly code: StudioHostRuntimeValidationCode;
  readonly path: string;
  readonly message: string;
}

export interface StudioHostRuntimeDataPort {
  readonly read: (source: StudioBindingSource) => unknown;
}

export interface StudioHostedDispatchSuccess {
  readonly actionId: string;
  readonly actionType: string;
  readonly outcome: StudioHostActionOutcome;
  readonly completion: StudioRuntimeCompletion;
}

export type StudioHostedDispatchResult =
  | { readonly ok: true; readonly value: StudioHostedDispatchSuccess }
  | { readonly ok: false; readonly issue: StudioHostRuntimeIssue; readonly runtime?: StudioRuntimeDispatchResult };

export interface StudioHostRuntimeAdapter {
  readonly hostId: string;
  readonly data: StudioHostRuntimeDataPort;
  readonly snapshot: () => StudioHostSnapshot;
  readonly connect: (session: StudioRuntimeSession) => StudioHostedRuntimeController;
  readonly dispose: () => void;
}

export interface StudioHostedRuntimeController {
  readonly currentViewId: StudioRuntimeSession["currentViewId"];
  readonly currentView: StudioRuntimeSession["currentView"];
  readonly currentRuntimeState: StudioRuntimeSession["currentRuntimeState"];
  readonly dispatch: (input: Parameters<StudioRuntimeSession["dispatch"]>[0]) => Promise<StudioHostedDispatchResult>;
  readonly dispose: () => void;
}

export type StudioHostRuntimeAdapterResult =
  | { readonly ok: true; readonly value: StudioHostRuntimeAdapter }
  | { readonly ok: false; readonly issue: StudioHostRuntimeIssue };
