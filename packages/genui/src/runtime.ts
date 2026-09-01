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
  StudioRuntimeSession,
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

export interface ViraExperienceRuntime {
  readonly hostId: string;
  readonly session: StudioRuntimeSession;
  readonly controller: StudioHostedRuntimeController;
  /** Monotonic consumer-visible revision for route completions and accepted host snapshots. */
  readonly revision: () => number;
  /** Subscribe to runtime changes without introducing a second state store. */
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

  const controller: StudioHostedRuntimeController = Object.freeze({
    currentViewId: hostedController.currentViewId,
    currentView: hostedController.currentView,
    currentRuntimeState: hostedController.currentRuntimeState,
    async dispatch(eventInput): Promise<StudioHostedDispatchResult> {
      const result = await hostedController.dispatch(eventInput);
      notify();
      return result;
    },
    async forward(runtimeResult): Promise<StudioHostedDispatchResult> {
      const result = await hostedController.forward(runtimeResult);
      notify();
      return result;
    },
    dispose: hostedController.dispose,
  });

  const unsubscribeHost = host.value.subscribe(() => { notify(); });

  const runtime: ViraExperienceRuntime = {
    hostId: host.value.hostId,
    session: session.value,
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
          void controller.forward(result).then((hostResult) => {
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
      controller.dispose();
      host.value.dispose();
    },
  };
  return { ok: true, value: Object.freeze(runtime) };
}
