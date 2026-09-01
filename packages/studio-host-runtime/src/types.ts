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
  | "DUPLICATE_FORWARD"
  | "DISPOSED";

export interface StudioHostRuntimeIssue {
  readonly code: StudioHostRuntimeValidationCode;
  readonly path: string;
  readonly message: string;
}

export interface StudioHostRuntimeDataPort {
  readonly read: (source: StudioBindingSource) => unknown;
}

export type StudioHostRuntimeSnapshotListener = (snapshot: StudioHostSnapshot) => void;

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
  /** Subscribes to accepted monotonic host snapshots. Listener failures never poison the host/runtime bridge. */
  readonly subscribe: (listener: StudioHostRuntimeSnapshotListener) => () => void;
  readonly connect: (session: StudioRuntimeSession) => StudioHostedRuntimeController;
  readonly dispose: () => void;
}

export interface StudioHostedRuntimeController {
  readonly currentViewId: StudioRuntimeSession["currentViewId"];
  readonly currentView: StudioRuntimeSession["currentView"];
  readonly currentRuntimeState: StudioRuntimeSession["currentRuntimeState"];
  readonly dispatch: (input: Parameters<StudioRuntimeSession["dispatch"]>[0]) => Promise<StudioHostedDispatchResult>;
  /**
   * Forwards a successful action that was already dispatched by the canonical Studio runtime.
   * Each action id is forwarded to the host at most once for this controller, including when
   * the first host attempt returns or throws an error whose side-effect status is uncertain.
   */
  readonly forward: (runtime: StudioRuntimeDispatchResult) => Promise<StudioHostedDispatchResult>;
  readonly dispose: () => void;
}

export type StudioHostRuntimeAdapterResult =
  | { readonly ok: true; readonly value: StudioHostRuntimeAdapter }
  | { readonly ok: false; readonly issue: StudioHostRuntimeIssue };
