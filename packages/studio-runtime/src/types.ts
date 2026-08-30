import type { JsonObject } from "@vira-enterprise-genui/protocol";
import type { RuntimeWebActionIdFactory, StateBindingHostPatchResult, StateBindingProcessResult, StateBindingSession } from "@vira-enterprise-genui/runtime-web";
import type { StudioBindingSource, StudioInteractionOutcome } from "@vira-enterprise-genui/studio-schema";
export const STUDIO_RUNTIME_MAX_REPEAT_ITEMS = 256 as const;
export interface StudioRuntimeDataPort { read(source: StudioBindingSource): unknown; }
export interface StudioRuntimePorts { readonly data: StudioRuntimeDataPort; readonly actionIds: RuntimeWebActionIdFactory; }
export interface StudioRuntimeNodeModel { readonly id: string; readonly sourceNodeId: string; readonly component: string; readonly order: number; readonly props: JsonObject; readonly eventPayloads: Readonly<Record<string, JsonObject>>; readonly parentId?: string; readonly slot?: string; }
export interface StudioRuntimeViewModel { readonly experienceId: string; readonly viewId: string; readonly nodes: readonly StudioRuntimeNodeModel[]; }
export type StudioRuntimeValidationCode = "INVALID_INPUT" | "INVALID_PORTS" | "INVALID_PUBLICATION" | "FORGED_PUBLICATION" | "INVALID_RUNTIME_SESSION" | "SESSION_DISPOSED" | "VIEW_NOT_FOUND" | "DATA_READ_FAILED" | "DATA_VALUE_INVALID" | "REPEAT_LIMIT_EXCEEDED" | "INTERACTION_NOT_FOUND" | "ACTION_PENDING" | "NO_PENDING_ACTION" | "STALE_ACTION" | "INVALID_OUTCOME";
export interface StudioRuntimeIssue { readonly code: StudioRuntimeValidationCode; readonly path: string; readonly message: string; }
export type StudioRuntimeViewResult = { readonly ok: true; readonly value: StudioRuntimeViewModel } | { readonly ok: false; readonly issue: StudioRuntimeIssue };
export type StudioRuntimeDispatchResult = StateBindingProcessResult | { readonly ok: false; readonly stage: "studio"; readonly issue: StudioRuntimeIssue };
export interface StudioRuntimeCompletion { readonly viewId: string; readonly transitioned: boolean; }
export type StudioRuntimeCompletionResult = { readonly ok: true; readonly value: StudioRuntimeCompletion } | { readonly ok: false; readonly issue: StudioRuntimeIssue };
export interface StudioRuntimeSession { currentViewId(): string; currentView(): StudioRuntimeViewResult; currentRuntimeState(): ReturnType<StateBindingSession["currentState"]>; dispatch(input: { readonly nodeId: string; readonly event: string; readonly payload?: unknown }): StudioRuntimeDispatchResult; applyHostPatch(patch: unknown): StateBindingHostPatchResult; complete(input: { readonly actionId: string; readonly outcome: StudioInteractionOutcome }): StudioRuntimeCompletionResult; dispose(): void; }
export type CreateStudioRuntimeSessionResult = { readonly ok: true; readonly value: StudioRuntimeSession } | { readonly ok: false; readonly issue: StudioRuntimeIssue };
