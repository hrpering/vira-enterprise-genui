import { createRuntimeState } from "@vira-enterprise-genui/runtime-core";
import { mountExperience } from "../dom-lifecycle/index.js";
import type { MountedExperience, RuntimeWebMountValidationCode } from "../dom-lifecycle/index.js";
import { readRuntimeWebDataObject } from "../internal/data-object-input.js";
import { createStateBindingSession } from "../state-bindings/index.js";
import type { StateBindingSession } from "../state-bindings/index.js";
import { createWebSdkConfiguration } from "./configuration.js";
import type {
  CreateViraGenUIResult,
  ViraGenUI,
  ViraGenUIDispatchFailure,
  ViraGenUIDispatchResult,
  ViraGenUIEventListener,
  ViraGenUIEventMap,
  ViraGenUIEventName,
  ViraGenUIMountResult,
  ViraGenUIMountValidationCode,
  ViraGenUIPatchFailure,
  ViraGenUIPatchResult,
  ViraGenUISubscriptionResult,
} from "./types.js";

const mountInputFields = new Set(["experienceId", "plan", "composition"]);
const declarativeMountFailures = new Set<RuntimeWebMountValidationCode>([
  "INVALID_MOUNT_INPUT",
  "INVALID_RENDER_INPUT",
  "INVALID_CAPABILITY_ALLOWLIST",
  "INVALID_RESPONSIVE_POLICY",
]);
const sdkEventNames = Object.freeze(["action", "effect", "statechange", "error"] as const);
type StoredListener = (payload: unknown) => void;

function mountFailure(
  code: ViraGenUIMountValidationCode,
  path: string,
  message: string,
): ViraGenUIMountResult {
  return { ok: false, issue: { code, path, message } };
}

function sdkDispatchFailure(
  code: "SDK_DISPOSED" | "NOT_MOUNTED" | "REENTRANT_DISPATCH",
  message: string,
): ViraGenUIDispatchFailure {
  return { ok: false, stage: "sdk", issue: { code, path: "$", message } };
}

function sdkPatchFailure(
  code: "SDK_DISPOSED" | "NOT_MOUNTED" | "REENTRANT_PATCH",
  message: string,
): ViraGenUIPatchFailure {
  return { ok: false, stage: "sdk", issue: { code, path: "$", message } };
}

interface ActiveExperience {
  readonly mounted: MountedExperience;
  readonly session: StateBindingSession;
}

export function createViraGenUI(configurationInput: unknown): CreateViraGenUIResult {
  const configuration = createWebSdkConfiguration(configurationInput);
  if (!configuration.ok) return configuration;
  const config = configuration.value;

  let active: ActiveExperience | undefined;
  let disposed = false;
  let notifying = false;
  const listeners = new Map<ViraGenUIEventName, Set<StoredListener>>();

  function notify<K extends ViraGenUIEventName>(event: K, payload: ViraGenUIEventMap[K]): void {
    const registered = listeners.get(event);
    if (!registered) return;
    for (const listener of [...registered]) {
      try {
        listener(payload);
      } catch {
        // Host notification exceptions cannot alter dispatch/state semantics.
      }
    }
  }

  function publish(run: () => void): void {
    notifying = true;
    try {
      run();
    } finally {
      notifying = false;
    }
  }

  function releaseActive(): void {
    const current = active;
    active = undefined;
    if (!current) return;
    current.session.dispose();
    current.mounted.dispose();
  }

  function subscribe<K extends ViraGenUIEventName>(
    event: K,
    listener: ViraGenUIEventListener<K>,
  ): ViraGenUISubscriptionResult {
    if (disposed) {
      return { ok: false, issue: { code: "SDK_DISPOSED", path: "$", message: "Vira GenUI instance is disposed" } };
    }
    if (!sdkEventNames.includes(event)) {
      return { ok: false, issue: { code: "INVALID_EVENT", path: "$.event", message: "unsupported SDK event name" } };
    }
    if (typeof listener !== "function") {
      return { ok: false, issue: { code: "INVALID_LISTENER", path: "$.listener", message: "SDK event listener must be a function" } };
    }

    const stored = listener as unknown as StoredListener;
    let registered = listeners.get(event);
    if (!registered) {
      registered = new Set<StoredListener>();
      listeners.set(event, registered);
    }
    registered.add(stored);
    let activeSubscription = true;

    return {
      ok: true,
      value: Object.freeze({
        unsubscribe(): void {
          if (!activeSubscription) return;
          activeSubscription = false;
          registered?.delete(stored);
        },
      }),
    };
  }

  function publishSuccess(result: { readonly action: ViraGenUIEventMap["action"]; readonly effects: readonly ViraGenUIEventMap["effect"][]; readonly state: ViraGenUIEventMap["statechange"]; readonly stateChanged: boolean }): void {
    publish(() => {
      notify("action", result.action);
      for (const effect of result.effects) notify("effect", effect);
      if (result.stateChanged) notify("statechange", result.state);
    });
  }

  const sdk: ViraGenUI = {
    mount(input: unknown): ViraGenUIMountResult {
      if (disposed) return mountFailure("SDK_DISPOSED", "$", "Vira GenUI instance is disposed");
      if (active) return mountFailure("ALREADY_MOUNTED", "$", "Vira GenUI instance already has an active experience");

      const root = readRuntimeWebDataObject(input);
      if (!root.ok) return mountFailure("INVALID_MOUNT_INPUT", root.issue.path, "SDK mount input is invalid");
      const fields = root.value;
      const unknownField = Object.keys(fields).sort().find((field) => !mountInputFields.has(field));
      if (unknownField) return mountFailure("INVALID_MOUNT_INPUT", `$.${unknownField}`, "SDK mount input contains an unknown field");

      const initialState = createRuntimeState(fields.experienceId, fields.plan);
      if (!initialState.ok) {
        return mountFailure("INVALID_RUNTIME_STATE", initialState.issue.path, "SDK mount RuntimeState input is invalid");
      }

      const session = createStateBindingSession({
        state: initialState.value,
        policy: config.permissionPolicy,
        actionAdapter: config.actionAdapter,
      }, config.idFactory);
      if (!session.ok) {
        return mountFailure("STATE_BINDING_FAILED", session.issue.path, "SDK state binding session could not be created");
      }

      const mounted = mountExperience({
        composition: fields.composition,
        plan: initialState.value.plan,
        componentAdapter: config.componentAdapter,
        capabilityAllowlist: config.capabilityAllowlist,
        accessibility: config.accessibility,
        responsive: config.responsive,
      }, config.domPort);
      if (!mounted.ok) {
        session.value.dispose();
        if (mounted.issue.code === "CAPABILITY_DENIED") {
          return mountFailure("CAPABILITY_DENIED", mounted.issue.path, "SDK render capability is not authorized");
        }
        if (declarativeMountFailures.has(mounted.issue.code)) {
          return mountFailure("INVALID_RENDER_INPUT", mounted.issue.path, "SDK render input is invalid");
        }
        return mountFailure("DOM_MOUNT_FAILED", mounted.issue.path, "SDK DOM host mount failed");
      }

      active = Object.freeze({ mounted: mounted.value, session: session.value });
      return {
        ok: true,
        value: Object.freeze({
          experienceId: initialState.value.experienceId,
          planId: initialState.value.plan.id,
        }),
      };
    },
    dispatch(event: unknown): ViraGenUIDispatchResult {
      if (disposed) return sdkDispatchFailure("SDK_DISPOSED", "Vira GenUI instance is disposed");
      if (notifying) return sdkDispatchFailure("REENTRANT_DISPATCH", "dispatch is not allowed during SDK listener notification");
      const current = active;
      if (!current) {
        const failure = sdkDispatchFailure("NOT_MOUNTED", "Vira GenUI instance has no active experience");
        publish(() => notify("error", failure));
        return failure;
      }

      const result = current.session.process(event);
      if (!result.ok) {
        publish(() => notify("error", result));
        return result;
      }

      publishSuccess(result.value);
      return result;
    },
    patch(patchInput: unknown): ViraGenUIPatchResult {
      if (disposed) return sdkPatchFailure("SDK_DISPOSED", "Vira GenUI instance is disposed");
      if (notifying) return sdkPatchFailure("REENTRANT_PATCH", "patch is not allowed during SDK listener notification");
      const current = active;
      if (!current) {
        const failure = sdkPatchFailure("NOT_MOUNTED", "Vira GenUI instance has no active experience");
        publish(() => notify("error", failure));
        return failure;
      }

      const result = current.session.processHostPatch(patchInput);
      if (!result.ok) {
        publish(() => notify("error", result));
        return result;
      }

      publishSuccess(result.value);
      return result;
    },
    on: subscribe,
    currentState() {
      return active?.session.currentState();
    },
    isMounted() {
      return active !== undefined;
    },
    unmount() {
      releaseActive();
    },
    isDisposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseActive();
      listeners.clear();
    },
  };

  return { ok: true, value: Object.freeze(sdk) };
}
