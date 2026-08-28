import { createViraGenUI } from "@vira-enterprise-genui/runtime-web";
import type { ViraGenUI } from "@vira-enterprise-genui/runtime-web";
import type {
  ViraExperienceConfigureResult,
  ViraExperienceElementApi,
  ViraExperienceElementConstructor,
  ViraExperienceElementPlatform,
  ViraExperienceDefineResult,
  ViraExperienceElementValidationCode,
  ViraExperienceMountResult,
} from "./types.js";

export const VIRA_EXPERIENCE_TAG_NAME = "vira-experience" as const;

function elementFailure(
  code: ViraExperienceElementValidationCode,
  message: string,
): { readonly ok: false; readonly stage: "element"; readonly issue: { readonly code: ViraExperienceElementValidationCode; readonly path: "$"; readonly message: string } } {
  return { ok: false, stage: "element", issue: { code, path: "$", message } };
}

export function createViraExperienceElementClass(
  HTMLElementBase: typeof HTMLElement,
): ViraExperienceElementConstructor {
  class ViraExperienceElement extends HTMLElementBase implements ViraExperienceElementApi {
    #sdk: ViraGenUI | undefined;
    #disposed = false;

    configure(configuration: unknown): ViraExperienceConfigureResult {
      if (this.#disposed) return elementFailure("ELEMENT_DISPOSED", "vira-experience element is disposed");
      if (this.#sdk) return elementFailure("ALREADY_CONFIGURED", "vira-experience element is already configured");

      const created = createViraGenUI(configuration);
      if (!created.ok) return { ok: false, stage: "configuration", issue: created.issue };
      this.#sdk = created.value;
      return { ok: true };
    }

    mount(experience: unknown): ViraExperienceMountResult {
      if (this.#disposed) return elementFailure("ELEMENT_DISPOSED", "vira-experience element is disposed");
      if (!this.#sdk) return elementFailure("NOT_CONFIGURED", "vira-experience element must be configured before mount");
      return this.#sdk.mount(experience);
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
  return { HTMLElementBase: browser.HTMLElement, registry: browser.customElements };
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

  const elementClass = createViraExperienceElementClass(resolved.HTMLElementBase);
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
