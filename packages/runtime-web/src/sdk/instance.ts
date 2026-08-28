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
  ViraGenUIDispatchResult,
  ViraGenUIMountResult,
  ViraGenUIMountValidationCode,
} from "./types.js";

const mountInputFields = new Set(["experienceId", "plan", "composition"]);
const declarativeMountFailures = new Set<RuntimeWebMountValidationCode>([
  "INVALID_MOUNT_INPUT",
  "INVALID_RENDER_INPUT",
  "INVALID_RESPONSIVE_POLICY",
]);

function mountFailure(
  code: ViraGenUIMountValidationCode,
  path: string,
  message: string,
): ViraGenUIMountResult {
  return { ok: false, issue: { code, path, message } };
}

function sdkDispatchFailure(code: "SDK_DISPOSED" | "NOT_MOUNTED", message: string): ViraGenUIDispatchResult {
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

  function releaseActive(): void {
    const current = active;
    active = undefined;
    if (!current) return;
    current.session.dispose();
    current.mounted.dispose();
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
        accessibility: config.accessibility,
        responsive: config.responsive,
      }, config.domPort);
      if (!mounted.ok) {
        session.value.dispose();
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
      const current = active;
      if (!current) return sdkDispatchFailure("NOT_MOUNTED", "Vira GenUI instance has no active experience");
      return current.session.process(event);
    },
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
    },
  };

  return { ok: true, value: Object.freeze(sdk) };
}
