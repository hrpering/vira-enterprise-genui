import type {
  ViraGenUI,
  ViraGenUIDispatchResult,
  ViraGenUIEventMap,
  ViraGenUIMountResult,
  ViraGenUIPatchResult,
  WebSdkConfigurationValidationIssue,
} from "@vira-enterprise-genui/runtime-web";

export type ViraExperienceElementValidationCode =
  | "ELEMENT_DISPOSED"
  | "ALREADY_CONFIGURED"
  | "NOT_CONFIGURED"
  | "EVENT_BRIDGE_FAILED";

export interface ViraExperienceElementValidationIssue {
  readonly code: ViraExperienceElementValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ViraExperienceConfigureResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly stage: "element"; readonly issue: ViraExperienceElementValidationIssue }
  | { readonly ok: false; readonly stage: "configuration"; readonly issue: WebSdkConfigurationValidationIssue };

export type ViraExperienceMountResult =
  | ViraGenUIMountResult
  | { readonly ok: false; readonly stage: "element"; readonly issue: ViraExperienceElementValidationIssue };

export type ViraExperienceDispatchResult =
  | ViraGenUIDispatchResult
  | { readonly ok: false; readonly stage: "element"; readonly issue: ViraExperienceElementValidationIssue };

export type ViraExperiencePatchResult =
  | ViraGenUIPatchResult
  | { readonly ok: false; readonly stage: "element"; readonly issue: ViraExperienceElementValidationIssue };

export interface ViraExperienceElementApi {
  configure(configuration: unknown): ViraExperienceConfigureResult;
  mount(experience: unknown): ViraExperienceMountResult;
  dispatch(event: unknown): ViraExperienceDispatchResult;
  patch(patch: unknown): ViraExperiencePatchResult;
  unmount(): void;
  currentState(): ReturnType<ViraGenUI["currentState"]>;
  isConfigured(): boolean;
  isMounted(): boolean;
  isDisposed(): boolean;
  disconnectedCallback(): void;
  dispose(): void;
}

export type ViraExperienceElementConstructor = CustomElementConstructor & {
  new (): HTMLElement & ViraExperienceElementApi;
};

export type ViraExperienceCustomEventFactory = (
  type: string,
  detail: unknown,
) => Event;

export interface ViraExperienceElementPlatform {
  readonly HTMLElementBase: typeof HTMLElement;
  readonly registry: Pick<CustomElementRegistry, "define" | "get">;
  readonly customEventFactory: ViraExperienceCustomEventFactory;
}

export interface ViraExperienceDomEventDetailMap {
  readonly "vira-action": ViraGenUIEventMap["action"];
  readonly "vira-effect": ViraGenUIEventMap["effect"];
  readonly "vira-statechange": ViraGenUIEventMap["statechange"];
  readonly "vira-error": ViraGenUIEventMap["error"];
}

export type ViraExperienceDomEventName = keyof ViraExperienceDomEventDetailMap;

export type ViraExperienceDefineValidationCode =
  | "PLATFORM_UNAVAILABLE"
  | "TAG_ALREADY_DEFINED"
  | "REGISTRATION_FAILED";

export interface ViraExperienceDefineValidationIssue {
  readonly code: ViraExperienceDefineValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ViraExperienceDefineResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly tagName: string;
        readonly elementClass: ViraExperienceElementConstructor;
      };
    }
  | { readonly ok: false; readonly issue: ViraExperienceDefineValidationIssue };
