import type {
  StudioHostedDispatchResult,
  StudioRuntimeReactRenderer,
  ViraExperienceRuntime,
} from "@vira-enterprise-genui/genui";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";

export const VIRA_GENUI_EXPERIENCE_TAG_NAME = "vira-genui-experience" as const;

export interface ViraGenUIElementMountInput {
  readonly runtime: ViraExperienceRuntime;
  readonly renderers: Readonly<Record<string, StudioRuntimeReactRenderer>>;
  readonly onHostResult?: (result: StudioHostedDispatchResult) => void;
}

export type ViraGenUIElementMountResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issue: { readonly code: "RENDER_FAILED" | "DISPOSED"; readonly message: string } };

export interface ViraGenUIElementApi {
  mount(input: ViraGenUIElementMountInput): ViraGenUIElementMountResult;
  unmount(): void;
  dispose(): void;
  isMounted(): boolean;
  isDisposed(): boolean;
}

export type ViraGenUIElementConstructor = CustomElementConstructor & {
  new (): HTMLElement & ViraGenUIElementApi;
};

export function createViraGenUIElementClass(
  HTMLElementBase: typeof HTMLElement = HTMLElement,
): ViraGenUIElementConstructor {
  return class ViraGenUIExperienceElement extends HTMLElementBase implements ViraGenUIElementApi {
    #root: Root | undefined;
    #input: ViraGenUIElementMountInput | undefined;
    #disposed = false;

    #renderCurrent(): ViraGenUIElementMountResult {
      if (this.#disposed) return { ok: false, issue: { code: "DISPOSED", message: "GenUI element is disposed" } };
      if (!this.#input) return { ok: true };
      const rendered = this.#input.runtime.renderReact({
        renderers: this.#input.renderers,
        onHostResult: (result) => {
          this.#input?.onHostResult?.(result);
          if (!this.#disposed && this.#input) this.#renderCurrent();
        },
      });
      if (!rendered.ok) return { ok: false, issue: { code: "RENDER_FAILED", message: rendered.issue.message } };
      this.#root ??= createRoot(this);
      this.#root.render(createElement("div", { "data-vira-genui-root": "true" }, rendered.value));
      return { ok: true };
    }

    mount(input: ViraGenUIElementMountInput): ViraGenUIElementMountResult {
      if (this.#disposed) return { ok: false, issue: { code: "DISPOSED", message: "GenUI element is disposed" } };
      this.#input = input;
      return this.#renderCurrent();
    }

    unmount(): void {
      this.#root?.unmount();
      this.#root = undefined;
      this.#input = undefined;
    }

    disconnectedCallback(): void {
      this.unmount();
    }

    dispose(): void {
      if (this.#disposed) return;
      this.unmount();
      this.#disposed = true;
    }

    isMounted(): boolean {
      return this.#root !== undefined && this.#input !== undefined;
    }

    isDisposed(): boolean {
      return this.#disposed;
    }
  } as ViraGenUIElementConstructor;
}

export function defineViraGenUIElement(
  registry: Pick<CustomElementRegistry, "define" | "get"> = customElements,
): { readonly ok: true; readonly value: ViraGenUIElementConstructor } | { readonly ok: false; readonly issue: { readonly code: "ALREADY_DEFINED" | "REGISTRATION_FAILED"; readonly message: string } } {
  if (registry.get(VIRA_GENUI_EXPERIENCE_TAG_NAME)) {
    return { ok: false, issue: { code: "ALREADY_DEFINED", message: `${VIRA_GENUI_EXPERIENCE_TAG_NAME} is already defined` } };
  }
  const elementClass = createViraGenUIElementClass();
  try {
    registry.define(VIRA_GENUI_EXPERIENCE_TAG_NAME, elementClass);
  } catch {
    return { ok: false, issue: { code: "REGISTRATION_FAILED", message: "GenUI custom element registration failed" } };
  }
  return { ok: true, value: elementClass };
}
