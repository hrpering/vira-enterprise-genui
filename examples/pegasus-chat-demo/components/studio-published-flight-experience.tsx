"use client";

import { planExperience } from "@vira-enterprise-genui/planner";
import { createRuntimeState } from "@vira-enterprise-genui/runtime-core";
import { createStudioRuntimeSession } from "@vira-enterprise-genui/studio-runtime";
import type { StudioRuntimeSession } from "@vira-enterprise-genui/studio-runtime";
import { renderStudioRuntimeReactView } from "@vira-enterprise-genui/studio-runtime-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ViraFlightExperienceResult } from "../lib/vira-chat-contract";
import { resolveChatStudioPublication } from "../lib/studio-publication-resolver";

function createSession(
  result: ViraFlightExperienceResult,
  invalidate: () => void,
): { readonly session?: StudioRuntimeSession; readonly renderers?: unknown; readonly componentCatalog?: unknown; readonly error?: string } {
  const resolved = resolveChatStudioPublication(result);
  if (!resolved.ok) return { error: resolved.issue.message };

  const planned = planExperience({
    id: `chat-studio-${resolved.value.publicationId.replaceAll(".", "-")}`,
    intent: { version: "1", namespace: "travel.flight", name: "published-booking" },
    state: {},
    requiredState: [],
    capabilityRequirements: [],
    availableCapabilities: [],
    futureCapabilities: [],
  });
  if (!planned.ok) return { error: planned.issue.message };
  const runtimeState = createRuntimeState(`chat-studio-${resolved.value.publicationId.replaceAll(".", "-")}`, planned.value);
  if (!runtimeState.ok) return { error: runtimeState.issue.message };

  let actionSequence = 0;
  const created = createStudioRuntimeSession({
    publication: resolved.value.publication,
    componentCatalog: resolved.value.componentCatalog,
    bindingSourceCatalog: resolved.value.bindingSourceCatalog,
    actionAdapter: resolved.value.actionAdapter,
    runtimeState: runtimeState.value,
    permissionPolicy: resolved.value.permissionPolicy,
  }, {
    data: {
      read(source) {
        if (source.kind === "scope") return undefined;
        return resolved.value.runtimeData[source.path];
      },
    },
    actionIds: { nextId: () => `chat-studio-action-${++actionSequence}` },
  });
  if (!created.ok) return { error: created.issue.message };

  const base = created.value;
  const session = Object.freeze({
    currentViewId: () => base.currentViewId(),
    currentView: () => base.currentView(),
    currentRuntimeState: () => base.currentRuntimeState(),
    dispatch(input: Parameters<StudioRuntimeSession["dispatch"]>[0]) {
      const dispatched = base.dispatch(input);
      if (!dispatched.ok) return dispatched;
      const completed = base.complete({ actionId: dispatched.value.action.id, outcome: "success" });
      if (completed.ok) queueMicrotask(invalidate);
      return dispatched;
    },
    applyHostPatch: (patch: unknown) => base.applyHostPatch(patch),
    complete: (input: Parameters<StudioRuntimeSession["complete"]>[0]) => base.complete(input),
    dispose: () => base.dispose(),
  } satisfies StudioRuntimeSession);

  return {
    session,
    renderers: resolved.value.renderers,
    componentCatalog: resolved.value.componentCatalog,
  };
}

export function StudioPublishedFlightExperience({
  result,
  fallback,
}: {
  readonly result: ViraFlightExperienceResult;
  readonly fallback: ReactNode;
}) {
  const [, setRevision] = useState(0);
  const runtime = useMemo(
    () => createSession(result, () => { setRevision((value) => value + 1); }),
    [result],
  );

  useEffect(() => () => { runtime.session?.dispose(); }, [runtime]);
  if (!runtime.session || runtime.componentCatalog === undefined || runtime.renderers === undefined) return fallback;

  const rendered = renderStudioRuntimeReactView({
    session: runtime.session,
    componentCatalog: runtime.componentCatalog,
    renderers: runtime.renderers,
  });
  if (!rendered.ok) return fallback;
  return rendered.value;
}
