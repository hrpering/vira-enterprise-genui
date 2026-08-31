import {
  createStudioHostActionResult,
  createStudioHostBridge,
  createStudioHostSnapshot,
} from "@vira-enterprise-genui/studio-host";
import type { StudioHostBridge, StudioHostSnapshot } from "@vira-enterprise-genui/studio-host";
import type { StudioRuntimeSession } from "@vira-enterprise-genui/studio-runtime";
import type { StudioBindingSource } from "@vira-enterprise-genui/studio-schema";
import type {
  StudioHostedDispatchResult,
  StudioHostedRuntimeController,
  StudioHostRuntimeAdapter,
  StudioHostRuntimeAdapterResult,
  StudioHostRuntimeIssue,
  StudioHostRuntimeValidationCode,
} from "./types.js";

function issue(code: StudioHostRuntimeValidationCode, path: string, message: string): StudioHostRuntimeIssue {
  return Object.freeze({ code, path, message });
}

function lookup(root: Readonly<Record<string, unknown>>, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(current, segment);
    if (!descriptor || !("value" in descriptor)) return undefined;
    current = descriptor.value;
  }
  return current;
}

function normalizedSnapshot(input: unknown): { readonly ok: true; readonly value: StudioHostSnapshot } | { readonly ok: false; readonly issue: StudioHostRuntimeIssue } {
  const result = createStudioHostSnapshot(input);
  return result.ok
    ? { ok: true, value: result.value }
    : { ok: false, issue: issue("INVALID_SNAPSHOT", result.issue.path, result.issue.message) };
}

export function createStudioHostRuntimeAdapter(hostInput: unknown): StudioHostRuntimeAdapterResult {
  const validatedHost = createStudioHostBridge(hostInput);
  if (!validatedHost.ok) return { ok: false, issue: issue("INVALID_HOST", validatedHost.issue.path, validatedHost.issue.message) };
  const host: StudioHostBridge = validatedHost.value;

  let initial: unknown;
  try {
    initial = host.snapshot();
  } catch {
    return { ok: false, issue: issue("INVALID_SNAPSHOT", "$.host.snapshot", "Studio host snapshot failed") };
  }
  const parsedInitial = normalizedSnapshot(initial);
  if (!parsedInitial.ok) return parsedInitial;

  let current = parsedInitial.value;
  let disposed = false;
  let subscriptionFault: StudioHostRuntimeIssue | undefined;

  const acceptSnapshot = (candidate: unknown): StudioHostRuntimeIssue | undefined => {
    const parsed = normalizedSnapshot(candidate);
    if (!parsed.ok) return parsed.issue;
    if (parsed.value.revision < current.revision) {
      return issue("STALE_SNAPSHOT", "$.snapshot.revision", "Studio host snapshot revision moved backwards");
    }
    current = parsed.value;
    return undefined;
  };

  let unsubscribe: (() => void) | undefined;
  try {
    unsubscribe = host.subscribe((snapshot) => {
      if (disposed) return;
      subscriptionFault = acceptSnapshot(snapshot);
    });
  } catch {
    return { ok: false, issue: issue("INVALID_HOST", "$.host.subscribe", "Studio host subscription failed") };
  }
  if (typeof unsubscribe !== "function") {
    return { ok: false, issue: issue("INVALID_HOST", "$.host.subscribe", "Studio host subscribe must return an unsubscribe function") };
  }

  const data = Object.freeze({
    read(source: StudioBindingSource): unknown {
      if (disposed) throw new Error("Studio host runtime adapter is disposed");
      if (subscriptionFault) throw new Error(subscriptionFault.message);
      if (source.kind === "scope") return undefined;
      const root = source.kind === "state" ? current.state : current.domain;
      return lookup(root, source.path);
    },
  });

  const adapter: StudioHostRuntimeAdapter = {
    hostId: host.id,
    data,
    snapshot: () => current,
    connect(session: StudioRuntimeSession): StudioHostedRuntimeController {
      let controllerDisposed = false;
      const controller: StudioHostedRuntimeController = {
        currentViewId: () => session.currentViewId(),
        currentView: () => session.currentView(),
        currentRuntimeState: () => session.currentRuntimeState(),
        async dispatch(eventInput): Promise<StudioHostedDispatchResult> {
          if (disposed || controllerDisposed) return { ok: false, issue: issue("DISPOSED", "$", "hosted Studio runtime is disposed") };
          if (subscriptionFault) return { ok: false, issue: subscriptionFault };

          const runtime = session.dispatch(eventInput);
          if (!runtime.ok) return { ok: false, issue: issue("RUNTIME_COMPLETION_FAILED", "$.runtime.dispatch", "Studio runtime rejected the event"), runtime };

          const actionId = runtime.value.action.id;
          let hostRaw: unknown;
          try {
            hostRaw = await host.dispatch({
              type: runtime.value.action.type,
              payload: runtime.value.action.payload,
            });
          } catch {
            const completion = session.complete({ actionId, outcome: "error" });
            return {
              ok: false,
              issue: issue("HOST_DISPATCH_FAILED", "$.host.dispatch", completion.ok ? "Studio host dispatch failed" : "Studio host dispatch failed and runtime error completion failed"),
            };
          }

          const hostResult = createStudioHostActionResult(hostRaw);
          if (!hostResult.ok) {
            session.complete({ actionId, outcome: "error" });
            return { ok: false, issue: issue("INVALID_HOST_RESULT", hostResult.issue.path, hostResult.issue.message) };
          }
          if (hostResult.value.snapshot !== undefined) {
            const snapshotIssue = acceptSnapshot(hostResult.value.snapshot);
            if (snapshotIssue) {
              session.complete({ actionId, outcome: "error" });
              return { ok: false, issue: snapshotIssue };
            }
          }

          const completion = session.complete({ actionId, outcome: hostResult.value.outcome });
          if (!completion.ok) return { ok: false, issue: issue("RUNTIME_COMPLETION_FAILED", completion.issue.path, completion.issue.message) };
          return {
            ok: true,
            value: Object.freeze({
              actionId,
              actionType: runtime.value.action.type,
              outcome: hostResult.value.outcome,
              completion: completion.value,
            }),
          };
        },
        dispose() {
          if (controllerDisposed) return;
          controllerDisposed = true;
          session.dispose();
        },
      };
      return Object.freeze(controller);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe?.();
      unsubscribe = undefined;
    },
  };
  return { ok: true, value: Object.freeze(adapter) };
}
