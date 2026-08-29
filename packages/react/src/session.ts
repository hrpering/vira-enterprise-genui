import { createViraGenUI } from "@vira-enterprise-genui/runtime-web";
import type {
  ViraGenUI,
  ViraGenUIEventMap,
  ViraGenUIMountResult,
  ViraGenUISubscriptionValidationIssue,
  WebSdkConfigurationValidationIssue,
} from "@vira-enterprise-genui/runtime-web";
import type { ViraReactWrapperIssue } from "./types.js";

export interface ViraReactSessionCallbacks {
  readonly onAction: (action: ViraGenUIEventMap["action"]) => void;
  readonly onEffect: (effect: ViraGenUIEventMap["effect"]) => void;
  readonly onStateChange: (state: ViraGenUIEventMap["statechange"]) => void;
  readonly onError: (failure: ViraGenUIEventMap["error"]) => void;
}

export interface ViraReactSession {
  readonly sdk: ViraGenUI;
  readonly mountResult: Extract<ViraGenUIMountResult, { readonly ok: true }>;
  dispose(): void;
}

export type CreateViraReactSessionResult =
  | { readonly ok: true; readonly value: ViraReactSession }
  | { readonly ok: false; readonly stage: "configuration"; readonly issue: WebSdkConfigurationValidationIssue }
  | { readonly ok: false; readonly stage: "mount"; readonly result: ViraGenUIMountResult }
  | { readonly ok: false; readonly stage: "wrapper"; readonly issue: ViraReactWrapperIssue };

function wrapperIssue(cause: ViraGenUISubscriptionValidationIssue): ViraReactWrapperIssue {
  return Object.freeze({
    code: "SUBSCRIPTION_FAILED",
    path: cause.path,
    message: "React wrapper could not subscribe to the Runtime Web SDK",
    cause,
  });
}

export function createViraReactSession(
  configuration: unknown,
  experience: unknown,
  callbacks: ViraReactSessionCallbacks,
): CreateViraReactSessionResult {
  const created = createViraGenUI(configuration);
  if (!created.ok) return { ok: false, stage: "configuration", issue: created.issue };
  const sdk = created.value;

  const action = sdk.on("action", callbacks.onAction);
  if (!action.ok) {
    sdk.dispose();
    return { ok: false, stage: "wrapper", issue: wrapperIssue(action.issue) };
  }
  const effect = sdk.on("effect", callbacks.onEffect);
  if (!effect.ok) {
    sdk.dispose();
    return { ok: false, stage: "wrapper", issue: wrapperIssue(effect.issue) };
  }
  const statechange = sdk.on("statechange", callbacks.onStateChange);
  if (!statechange.ok) {
    sdk.dispose();
    return { ok: false, stage: "wrapper", issue: wrapperIssue(statechange.issue) };
  }
  const error = sdk.on("error", callbacks.onError);
  if (!error.ok) {
    sdk.dispose();
    return { ok: false, stage: "wrapper", issue: wrapperIssue(error.issue) };
  }

  const mounted = sdk.mount(experience);
  if (!mounted.ok) {
    sdk.dispose();
    return { ok: false, stage: "mount", result: mounted };
  }

  let disposed = false;
  return {
    ok: true,
    value: Object.freeze({
      sdk,
      mountResult: mounted,
      dispose(): void {
        if (disposed) return;
        disposed = true;
        sdk.dispose();
      },
    }),
  };
}
