import type { StudioPublication } from "@vira-enterprise-genui/studio-compiler";
import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import type { StudioWorkbenchSession } from "@vira-enterprise-genui/studio-workbench";

export interface StudioWorkbenchReactIssue {
  readonly code: "SHELL_FAILED" | "AUTHORING_FAILED" | "PUBLISH_FAILED" | "MUTATION_FAILED";
  readonly path: string;
  readonly message: string;
}

export interface ViraStudioWorkbenchProps {
  readonly session: StudioWorkbenchSession;
  readonly renderers: unknown;
  readonly title?: string;
  readonly height?: string | number;
  readonly onDocumentChange?: (document: StudioExperienceDocument) => void;
  readonly onPublish?: (publication: StudioPublication) => void | Promise<void>;
  readonly onError?: (issue: StudioWorkbenchReactIssue) => void;
}
