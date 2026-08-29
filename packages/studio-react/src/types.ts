import type { Config, Data } from "@puckeditor/core";
import type { ReactNode } from "react";

export interface StudioTrustedRenderContext {
  readonly component: string;
  readonly nodeId: string;
  readonly props: Readonly<Record<string, unknown>>;
}

export type StudioTrustedRenderer = (context: StudioTrustedRenderContext) => ReactNode;

export interface StudioPuckShellSession {
  readonly config: Config;
  readonly data: Data;
}

export type StudioPuckShellValidationCode =
  | "INVALID_STUDIO_INPUT"
  | "INVALID_RENDERER_REGISTRY"
  | "MISSING_RENDERER"
  | "EXTRA_RENDERER";

export interface StudioPuckShellValidationIssue {
  readonly code: StudioPuckShellValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StudioPuckShellSessionResult =
  | { readonly ok: true; readonly value: StudioPuckShellSession }
  | { readonly ok: false; readonly issue: StudioPuckShellValidationIssue };

export interface ViraExperienceStudioProps {
  readonly session: StudioPuckShellSession;
  readonly onChange?: (data: Data) => void;
  readonly onPublish?: (data: Data) => void | Promise<void>;
  readonly headerTitle?: string;
  readonly height?: string | number;
}
