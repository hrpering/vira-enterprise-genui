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

export interface ViraExperienceRuntime {
  readonly hostId: string;
  readonly session: StudioRuntimeSession;
  readonly controller: StudioHostedRuntimeController;
  readonly renderReact: (input: {
    readonly renderers: unknown;
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

  let sequence = 0;
  const session = createStudioRuntimeSession({
    publication: input.publication,
    componentCatalog: input.componentCatalog,
    bindingSourceCatalog: input.bindingSourceCatalog,
    actionAdapter: input.actionAdapter,
    runtimeState: input.runtimeState,
    permissionPolicy: input.permissionPolicy,
  }, {
    data: host.value.data,
    actionIds: { nextId: () => `vira-action-${++sequence}` },
  });
  if (!session.ok) {
    host.value.dispose();
    return { ok: false, stage: "runtime", issue: session.issue };
  }

  const controller = host.value.connect(session.value);
  let disposed = false;
  const runtime: ViraExperienceRuntime = {
    hostId: host.value.hostId,
    session: session.value,
    controller,
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
      controller.dispose();
      host.value.dispose();
    },
  };
  return { ok: true, value: Object.freeze(runtime) };
}
