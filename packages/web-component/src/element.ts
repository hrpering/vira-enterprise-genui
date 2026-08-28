import { createViraGenUI } from "@vira-enterprise-genui/runtime-web";
import type { ViraGenUI, ViraGenUIEventMap, ViraGenUIEventName } from "@vira-enterprise-genui/runtime-web";
import type {
  ViraExperienceConfigureResult,
  ViraExperienceCustomEventFactory,
  ViraExperienceDispatchResult,
  ViraExperienceElementApi,
  ViraExperienceElementConstructor,
  ViraExperienceElementPlatform,
  ViraExperienceDefineResult,
  ViraExperienceElementValidationCode,
  ViraExperienceMountResult,
  ViraExperiencePatchResult,
} from "./types.js";

export const VIRA_EXPERIENCE_TAG_NAME = "vira-experience" as const;
export const VIRA_EXPERIENCE_DOM_EVENTS = Object.freeze({
  action: "vira-action",
  effect: "vira-effect",
  statechange: "vira-statechange",
  error: "vira-error",
} as const);

function elementFailure(
  code: ViraExperienceElementValidationCode,
  message: string,
): { readonly ok: false; readonly stage: "element"; readonly issue: { readonly code: ViraExperienceElementValidationCode; readonly path: "$"; readonly message: string } } {
  return { ok: false, stage: "element", issue: { code, path: "$", message } };
}

function browserCustomEventFactory(type: string, detail: unknown): Event {
  const browser = globalThis as typeof globalThis & { CustomEvent?: typeof CustomEvent };
  if (typeof browser.CustomEvent !== "function") throw new Error("CustomEvent unavailable");
  return new browser.CustomEvent(type, {
    detail,
    bubbles: true,
    composed: true,
    cancelable: false,
  });
}

export function createViraExperienceElementClass(
  HTMLElementBase: typeof HTMLElement,
  customEventFactory: ViraExperienceCustomEventFactory = browserCustomEventFactory,
): ViraExperienceElementConstructor {
  class ViraExperienceElement extends HTMLElementBase implements ViraExperienceElementApi {
    #sdk: ViraGenUI | undefined;
    #disposed = false;

    #emit<K extends ViraGenUIEventName>(event: K, detail: ViraGenUIEventMap[K]): void {
      this.dispatchEvent(customEventFactory(VIRA_EXPERIENCE_DOM_EVENTS[event], detail));
    }

    configure(configuration: unknown): ViraExperienceConfigureResult {
      if (this.#disposed) return elementFailure("ELEMENT_DISPOSED", "vira-experience element is disposed");
      if (this.#sdk) return elementFailure("ALREADY_CONFIGURED", "vira-experience element is already configured");

      const created = createViraGenUI(configuration);
      if (!created.ok) return { ok: false, stage: "configuration", issue: created.issue };

      const sdk = created.value;
      const bridges = [
        sdk.on("action", (payload) => this.#emit("action", payload)),
        sdk.on("effect", (payload) => this.#emit("effect", payload)),
        sdk.on("statechange", (payload) => this.#emit("statechange", payload)),
        sdk.on("error", (payload) => this.#emit("error", payload)),
      ];
      if (bridges.some((bridge) => !bridge.ok)) {
        sdk.dispose();
        return elementFailure("EVENT_BRIDGE_FAILED", "vira-experience event bridge could not be created");
      }

      this.#sdk = sdk;
      return { ok: true };
    }

    mount(experience: unknown): ViraExperienceMountResult {
      if (this.#disposed) return elementFailure("ELEMENT_DISPOSED", "vira-experience element is disposed");
      if (!this.#sdk) return elementFailure("NOT_CONFIGURED", "vira-experience element must be configured before mount");
      return this.#sdk.mount(experience);
    }

    dispatch(event: unknown): ViraExperienceDispatchResult {
      if (this.#disposed) return elementFailure("ELEMENT_DISPOSED", "vira-experience element is disposed");
      if (!this.#sdk) return elementFailure("NOT_CONFIGURED", "vira-experience element must be configured before dispatch");
      return this.#sdk.dispatch(event);
    }

    patch(patchInput: unknown): ViraExperiencePatchResult {
      if (this.#disposed) return elementFailure("ELEMENT_DISPOSED", "vira-experience element is disposed");
      if (!this.#sdk) return elementFailure("NOT_CONFIGURED", "vira-experience element must be configured before patch");
      return this.#sdk.patch(patchInput);
    }

    unmount(): void {
      this.#sdk?.unmount();
    }

    currentState(): ReturnType<ViraGenUI["currentState"]> {
      return this.#sdk?.currentState();
    }

    isConfigured(): boolean {
      return this.#sdk !== undefined;
    }

    isMounted(): boolean {
      return this.#sdk?.isMounted() ?? false;
    }

    isDisposed(): boolean {
      return this.#disposed;
    }

    disconnectedCallback(): void {
      if (this.#disposed) return;
      this.#sdk?.unmount();
    }

    dispose(): void {
      if (this.#disposed) return;
      this.#disposed = true;
      this.#sdk?.dispose();
    }
  }

  return ViraExperienceElement as ViraExperienceElementConstructor;
}

function browserPlatform(): ViraExperienceElementPlatform | undefined {
  const browser = globalThis as typeof globalThis & {
    HTMLElement?: typeof HTMLElement;
    customElements?: CustomElementRegistry;
  };
  if (typeof browser.HTMLElement !== "function" || !browser.customElements) return undefined;
  return {
    HTMLElementBase: browser.HTMLElement,
    registry: browser.customElements,
    customEventFactory: browserCustomEventFactory,
  };
}

export function defineViraExperienceElement(
  platform?: ViraExperienceElementPlatform,
): ViraExperienceDefineResult {
  const resolved = platform ?? browserPlatform();
  if (!resolved) {
    return {
      ok: false,
      issue: { code: "PLATFORM_UNAVAILABLE", path: "$", message: "custom elements platform is unavailable" },
    };
  }

  if (resolved.registry.get(VIRA_EXPERIENCE_TAG_NAME) !== undefined) {
    return {
      ok: false,
      issue: { code: "TAG_ALREADY_DEFINED", path: "$.tagName", message: "vira-experience is already defined" },
    };
  }

  const elementClass = createViraExperienceElementClass(
    resolved.HTMLElementBase,
    resolved.customEventFactory,
  );
  try {
    resolved.registry.define(VIRA_EXPERIENCE_TAG_NAME, elementClass);
  } catch {
    return {
      ok: false,
      issue: { code: "REGISTRATION_FAILED", path: "$.tagName", message: "vira-experience registration failed" },
    };
  }

  return {
    ok: true,
    value: Object.freeze({ tagName: VIRA_EXPERIENCE_TAG_NAME, elementClass }),
  };
}
