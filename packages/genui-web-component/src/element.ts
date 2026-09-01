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

export interface ViraGenUIElementPlatform {
  readonly HTMLElementBase: typeof HTMLElement;
  readonly registry: Pick<CustomElementRegistry, "define" | "get">;
}

export interface ViraGenUIReactRoot {
  render(node: Parameters<Root["render"]>[0]): void;
  unmount(): void;
}

export type ViraGenUIReactRootFactory = (container: HTMLElement) => ViraGenUIReactRoot;

export type ViraGenUIElementDefineResult =
  | { readonly ok: true; readonly value: ViraGenUIElementConstructor }
  | { readonly ok: false; readonly issue: { readonly code: "PLATFORM_UNAVAILABLE" | "ALREADY_DEFINED" | "REGISTRATION_FAILED"; readonly message: string } };

export function createViraGenUIElementClass(
  HTMLElementBase: typeof HTMLElement,
  rootFactory: ViraGenUIReactRootFactory = (container) => createRoot(container),
): ViraGenUIElementConstructor {
  return class ViraGenUIExperienceElement extends HTMLElementBase implements ViraGenUIElementApi {
    #root: ViraGenUIReactRoot | undefined;
    #input: ViraGenUIElementMountInput | undefined;
    #unsubscribeRuntime: (() => void) | undefined;
    #disposed = false;

    #renderCurrent(): ViraGenUIElementMountResult {
      if (this.#disposed) return { ok: false, issue: { code: "DISPOSED", message: "GenUI element is disposed" } };
      if (!this.#input) return { ok: true };

      try {
        const rendered = this.#input.runtime.renderReact({
          renderers: this.#input.renderers,
          onHostResult: (result) => {
            this.#input?.onHostResult?.(result);
          },
        });
        if (!rendered.ok) return { ok: false, issue: { code: "RENDER_FAILED", message: rendered.issue.message } };
        this.#root ??= rootFactory(this);
        this.#root.render(createElement("div", { "data-vira-genui-root": "true" }, rendered.value));
        return { ok: true };
      } catch {
        return { ok: false, issue: { code: "RENDER_FAILED", message: "GenUI element render failed safely" } };
      }
    }

    mount(input: ViraGenUIElementMountInput): ViraGenUIElementMountResult {
      if (this.#disposed) return { ok: false, issue: { code: "DISPOSED", message: "GenUI element is disposed" } };
      this.unmount();
      this.#input = input;
      try {
        this.#unsubscribeRuntime = input.runtime.subscribe(() => {
          if (this.#disposed || this.#input?.runtime !== input.runtime) return;
          const rerendered = this.#renderCurrent();
          if (!rerendered.ok) this.unmount();
        });
      } catch {
        this.unmount();
        return { ok: false, issue: { code: "RENDER_FAILED", message: "GenUI runtime subscription failed safely" } };
      }
      const result = this.#renderCurrent();
      if (!result.ok) this.unmount();
      return result;
    }

    unmount(): void {
      const unsubscribe = this.#unsubscribeRuntime;
      const root = this.#root;
      this.#unsubscribeRuntime = undefined;
      this.#root = undefined;
      this.#input = undefined;
      try {
        unsubscribe?.();
      } catch {
        // Runtime subscription cleanup cannot keep the element in a half-mounted state.
      }
      try {
        root?.unmount();
      } catch {
        // React cleanup failures are outside the canonical runtime boundary.
      }
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

function browserPlatform(): ViraGenUIElementPlatform | undefined {
  const browser = globalThis as typeof globalThis & {
    HTMLElement?: typeof HTMLElement;
    customElements?: CustomElementRegistry;
  };
  if (typeof browser.HTMLElement !== "function" || !browser.customElements) return undefined;
  return {
    HTMLElementBase: browser.HTMLElement,
    registry: browser.customElements,
  };
}

export function defineViraGenUIElement(
  platform?: ViraGenUIElementPlatform,
): ViraGenUIElementDefineResult {
  let resolved: ViraGenUIElementPlatform | undefined;
  try {
    resolved = platform ?? browserPlatform();
  } catch {
    return { ok: false, issue: { code: "PLATFORM_UNAVAILABLE", message: "GenUI custom elements platform could not be inspected safely" } };
  }
  if (!resolved) {
    return { ok: false, issue: { code: "PLATFORM_UNAVAILABLE", message: "GenUI custom elements platform is unavailable" } };
  }

  try {
    if (resolved.registry.get(VIRA_GENUI_EXPERIENCE_TAG_NAME) !== undefined) {
      return { ok: false, issue: { code: "ALREADY_DEFINED", message: `${VIRA_GENUI_EXPERIENCE_TAG_NAME} is already defined` } };
    }
    const elementClass = createViraGenUIElementClass(resolved.HTMLElementBase);
    resolved.registry.define(VIRA_GENUI_EXPERIENCE_TAG_NAME, elementClass);
    return { ok: true, value: elementClass };
  } catch {
    return { ok: false, issue: { code: "REGISTRATION_FAILED", message: "GenUI custom element registration failed" } };
  }
}
