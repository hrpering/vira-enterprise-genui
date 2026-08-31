import type { StudioRuntimeSession } from "@vira-enterprise-genui/studio-runtime";
import type { StudioRuntimeReactIssue } from "@vira-enterprise-genui/studio-runtime-react";
import type { ReactNode } from "react";

export const VIRA_STUDIO_EXPERIENCE_TAG_NAME = "vira-studio-experience" as const;

export interface StudioExperienceElementConfiguration {
  readonly session: StudioRuntimeSession;
  readonly componentCatalog: unknown;
  readonly renderers: unknown;
}

export interface StudioExperienceReactRoot {
  readonly render: (node: ReactNode) => void;
  readonly unmount: () => void;
}

export type StudioExperienceReactRootFactory = (container: Element | DocumentFragment) => StudioExperienceReactRoot;

export interface StudioExperienceElementPlatform {
  readonly HTMLElementBase: typeof HTMLElement;
  readonly registry: Pick<CustomElementRegistry, "define" | "get">;
  readonly rootFactory: StudioExperienceReactRootFactory;
}

export type StudioExperienceElementValidationCode =
  | "PLATFORM_UNAVAILABLE"
  | "INVALID_CONFIGURATION"
  | "ROOT_FAILED"
  | "RENDER_FAILED"
  | "ELEMENT_DISPOSED"
  | "TAG_ALREADY_DEFINED"
  | "REGISTRATION_FAILED";

export interface StudioExperienceElementIssue {
  readonly code: StudioExperienceElementValidationCode;
  readonly path: string;
  readonly message: string;
  readonly renderIssue?: StudioRuntimeReactIssue;
}

export type StudioExperienceElementResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issue: StudioExperienceElementIssue };

export interface StudioExperienceElementApi {
  configure(input: unknown): StudioExperienceElementResult;
  refresh(): StudioExperienceElementResult;
  currentViewId(): string | undefined;
  isConfigured(): boolean;
  isDisposed(): boolean;
  disconnectedCallback(): void;
  dispose(): void;
}

export type StudioExperienceElementConstructor = CustomElementConstructor & {
  new (): HTMLElement & StudioExperienceElementApi;
};

export type StudioExperienceElementDefineResult =
  | { readonly ok: true; readonly value: { readonly tagName: typeof VIRA_STUDIO_EXPERIENCE_TAG_NAME; readonly elementClass: StudioExperienceElementConstructor } }
  | { readonly ok: false; readonly issue: StudioExperienceElementIssue };
