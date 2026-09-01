import { createStudioHostBridge } from "@vira-enterprise-genui/studio-host";
import type { StudioHostBridgeResult } from "@vira-enterprise-genui/studio-host";
import { createStudioHostRuntimeAdapter } from "@vira-enterprise-genui/studio-host-runtime";
import type {
  StudioHostedDispatchResult,
  StudioHostedRuntimeController,
  StudioHostRuntimeIssue,
} from "@vira-enterprise-genui/studio-host-runtime";
import { createStudioRuntimeSession } from "@vira-enterprise-genui/studio-runtime";
import type {
  StudioRuntimeIssue,
} from "@vira-enterprise-genui/studio-runtime";
import { renderStudioRuntimeReactView } from "@vira-enterprise-genui/studio-runtime-react";
import type {
  StudioRuntimeReactRenderer,
  StudioRuntimeReactRenderResult,
} from "@vira-enterprise-genui/studio-runtime-react";

export interface ViraExperienceRuntimeInput {
  readonly publication: unknown;
  readonly componentCatalog: unknown;
  readonly bindingSourceCatalog: unknown;
  readonly actionAdapter: unknown;
  readonly runtimeState: unknown;
  readonly permissionPolicy: unknown;
  readonly host: unknown;
}

export type ViraExperienceRuntimeListener = () => void;
export type ViraExperienceController = Pick<
  StudioHostedRuntimeController,
  "currentViewId" | "currentView" | "currentRuntimeState" | "dispatch"
>;

export interface ViraExperienceRuntime {
  readonly hostId: string;
  /** Public controller exposes complete user actions only; raw session/forward internals stay private. */
  readonly controller: ViraExperienceController;
  /** Monotonic render-invalidation token for accepted host snapshots and completed runtime transitions. */
  readonly revision: () => number;
  /** Subscribe to render-invalidating runtime changes without introducing a second state store. */
  readonly subscribe: (listener: ViraExperienceRuntimeListener) => () => void;
  readonly renderReact: (input: {
    readonly renderers: Readonly<Record<string, StudioRuntimeReactRenderer>>;
    readonly onHostResult?: (result: StudioHostedDispatchResult) => void;
  }) => StudioRuntimeReactRenderResult;
  readonly dispose: () => void;
}

export type ViraExperienceRuntimeResult =
  | { readonly ok: true; readonly value: ViraExperienceRuntime }
  | { readonly ok: false; readonly stage: "host"; readonly issue: StudioHostRuntimeIssue }
  | { readonly ok: false; readonly stage: "runtime"; readonly issue: StudioRuntimeIssue };

export function createViraExperienceHost(input: unknown): StudioHostBridgeResult {
  return createStudioHostBridge(input);
}

export function createViraExperienceRuntime(
  input: ViraExperienceRuntimeInput,
): ViraExperienceRuntimeResult {
  const host = createStudioHostRuntimeAdapter(input.host);
  if (!host.ok) return { ok: false, stage: "host", issue: host.issue };

  let actionSequence = 0;
  const session = createStudioRuntimeSession({
    publication: input.publication,
    componentCatalog: input.componentCatalog,
    bindingSourceCatalog: input.bindingSourceCatalog,
    actionAdapter: input.actionAdapter,
    runtimeState: input.runtimeState,
    permissionPolicy: input.permissionPolicy,
  }, {
    data: host.value.data,
    actionIds: { nextId: () => `vira-action-${++actionSequence}` },
  });
  if (!session.ok) {
    host.value.dispose();
    return { ok: false, stage: "runtime", issue: session.issue };
  }

  const hostedController = host.value.connect(session.value);
  let disposed = false;
  let changeRevision = 0;
  const listeners = new Set<ViraExperienceRuntimeListener>();

  const notify = (): void => {
    if (disposed) return;
    changeRevision += 1;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // UI observers are outside the canonical runtime boundary.
      }
    }
  };

  const notifyAfterHostedResult = (result: StudioHostedDispatchResult): void => {
    // A pure Studio dispatch rejection cannot have changed host data or completed a route.
    // Host/transport failures may still complete the canonical error route and must invalidate.
    if (!result.ok && result.issue.code === "RUNTIME_COMPLETION_FAILED") return;
    notify();
  };

  const forwardRendererDispatch = async (
    runtimeResult: ReturnType<typeof session.value.dispatch>,
  ): Promise<StudioHostedDispatchResult> => {
    const result = await hostedController.forward(runtimeResult);
    notifyAfterHostedResult(result);
    return result;
  };

  const controller: ViraExperienceController = Object.freeze({
    currentViewId: hostedController.currentViewId,
    currentView: hostedController.currentView,
    currentRuntimeState: hostedController.currentRuntimeState,
    async dispatch(eventInput): Promise<StudioHostedDispatchResult> {
      const result = await hostedController.dispatch(eventInput);
      notifyAfterHostedResult(result);
      return result;
    },
  });

  const unsubscribeHost = host.value.subscribe(() => { notify(); });

  const runtime: ViraExperienceRuntime = {
    hostId: host.value.hostId,
    controller,
    revision: () => changeRevision,
    subscribe(listener): () => void {
      if (disposed) return () => {};
      listeners.add(listener);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
      };
    },
    renderReact({ renderers, onHostResult }): StudioRuntimeReactRenderResult {
      return renderStudioRuntimeReactView({
        session: session.value,
        componentCatalog: input.componentCatalog,
        renderers,
        onDispatch: (result) => {
          void forwardRendererDispatch(result).then((hostResult) => {
            onHostResult?.(hostResult);
          });
        },
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeHost();
      listeners.clear();
      hostedController.dispose();
      host.value.dispose();
    },
  };
  return { ok: true, value: Object.freeze(runtime) };
}
