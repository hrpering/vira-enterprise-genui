import { renderStudioRuntimeReactView } from "@vira-enterprise-genui/studio-runtime-react";
import { createRoot } from "react-dom/client";
import {
  VIRA_STUDIO_EXPERIENCE_TAG_NAME,
} from "./types.js";
import type {
  StudioExperienceElementApi,
  StudioExperienceElementConfiguration,
  StudioExperienceElementConstructor,
  StudioExperienceElementDefineResult,
  StudioExperienceElementIssue,
  StudioExperienceElementPlatform,
  StudioExperienceElementResult,
} from "./types.js";

const configurationFields = new Set(["session", "componentCatalog", "renderers"]);

function failure(
  code: StudioExperienceElementIssue["code"],
  path: string,
  message: string,
  renderIssue?: StudioExperienceElementIssue["renderIssue"],
): StudioExperienceElementResult {
  return { ok: false, issue: { code, path, message, ...(renderIssue === undefined ? {} : { renderIssue }) } };
}

function ownDataValue(input: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function parseConfiguration(input: unknown):
  | { readonly ok: true; readonly value: StudioExperienceElementConfiguration }
  | { readonly ok: false; readonly result: StudioExperienceElementResult } {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, result: failure("INVALID_CONFIGURATION", "$", "Studio element configuration must be a plain object") };
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    return { ok: false, result: failure("INVALID_CONFIGURATION", "$", "Studio element configuration must be a plain object") };
  }
  if (Object.getOwnPropertySymbols(input).length > 0 || Object.getOwnPropertyNames(input).length !== Object.keys(input).length) {
    return { ok: false, result: failure("INVALID_CONFIGURATION", "$", "Studio element configuration must use enumerable string data properties only") };
  }
  const unknown = Object.keys(input).sort().find((field) => !configurationFields.has(field));
  if (unknown) return { ok: false, result: failure("INVALID_CONFIGURATION", `$.${unknown}`, "unknown Studio element configuration field") };

  const session = ownDataValue(input, "session");
  const componentCatalog = ownDataValue(input, "componentCatalog");
  const renderers = ownDataValue(input, "renderers");
  if (session === null || typeof session !== "object" || typeof (session as { currentView?: unknown }).currentView !== "function") {
    return { ok: false, result: failure("INVALID_CONFIGURATION", "$.session", "configuration session must be a Studio runtime session") };
  }
  return {
    ok: true,
    value: { session: session as StudioExperienceElementConfiguration["session"], componentCatalog, renderers },
  };
}

export function createStudioExperienceElementClass(
  platform: StudioExperienceElementPlatform,
): StudioExperienceElementConstructor {
  const ElementClass = class extends platform.HTMLElementBase implements StudioExperienceElementApi {
    #configuration: StudioExperienceElementConfiguration | undefined;
    #root: ReturnType<StudioExperienceElementPlatform["rootFactory"]> | undefined;
    #disposed = false;

    configure(input: unknown): StudioExperienceElementResult {
      if (this.#disposed) return failure("ELEMENT_DISPOSED", "$", "Studio experience element is disposed");
      const configuration = parseConfiguration(input);
      if (!configuration.ok) return configuration.result;
      this.#configuration = configuration.value;
      return this.refresh();
    }

    refresh(): StudioExperienceElementResult {
      if (this.#disposed) return failure("ELEMENT_DISPOSED", "$", "Studio experience element is disposed");
      if (!this.#configuration) return failure("INVALID_CONFIGURATION", "$", "Studio experience element is not configured");
      if (!this.#root) {
        try {
          this.#root = platform.rootFactory(this);
        } catch {
          return failure("ROOT_FAILED", "$", "Studio experience React root could not be created");
        }
      }
      const rendered = renderStudioRuntimeReactView(this.#configuration);
      if (!rendered.ok) return failure("RENDER_FAILED", "$.render", rendered.issue.message, rendered.issue);
      try {
        this.#root.render(rendered.value);
      } catch {
        return failure("ROOT_FAILED", "$.render", "Studio experience React root render failed");
      }
      return { ok: true };
    }

    currentViewId(): string | undefined {
      return this.#configuration?.session.currentViewId();
    }

    isConfigured(): boolean {
      return this.#configuration !== undefined;
    }

    isDisposed(): boolean {
      return this.#disposed;
    }

    disconnectedCallback(): void {
      this.dispose();
    }

    dispose(): void {
      if (this.#disposed) return;
      this.#disposed = true;
      this.#configuration = undefined;
      this.#root?.unmount();
      this.#root = undefined;
    }
  };
  return ElementClass as StudioExperienceElementConstructor;
}

function browserPlatform(): StudioExperienceElementPlatform | undefined {
  if (typeof globalThis.HTMLElement !== "function" || globalThis.customElements === undefined) return undefined;
  return {
    HTMLElementBase: globalThis.HTMLElement,
    registry: globalThis.customElements,
    rootFactory: (container) => createRoot(container),
  };
}

export function defineStudioExperienceElement(
  platformInput?: StudioExperienceElementPlatform,
): StudioExperienceElementDefineResult {
  const platform = platformInput ?? browserPlatform();
  if (!platform) {
    return { ok: false, issue: { code: "PLATFORM_UNAVAILABLE", path: "$", message: "browser custom-element platform is unavailable" } };
  }
  if (platform.registry.get(VIRA_STUDIO_EXPERIENCE_TAG_NAME) !== undefined) {
    return { ok: false, issue: { code: "TAG_ALREADY_DEFINED", path: "$.tagName", message: "Studio experience tag is already defined" } };
  }
  const elementClass = createStudioExperienceElementClass(platform);
  try {
    platform.registry.define(VIRA_STUDIO_EXPERIENCE_TAG_NAME, elementClass);
  } catch {
    return { ok: false, issue: { code: "REGISTRATION_FAILED", path: "$.tagName", message: "Studio experience custom element registration failed" } };
  }
  return { ok: true, value: { tagName: VIRA_STUDIO_EXPERIENCE_TAG_NAME, elementClass } };
}
