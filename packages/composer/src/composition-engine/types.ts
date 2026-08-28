import type { CompositionPriorityMode } from "@vira-enterprise-genui/planner";
import type { DisclosurePolicy } from "../disclosure-policy/index.js";
import type { LayoutPolicy } from "../layout-policy/index.js";
import type { SemanticRegion } from "../semantic-regions/index.js";

export interface ComposedExperience {
  readonly planId: string;
  readonly mode: CompositionPriorityMode;
  readonly layout: LayoutPolicy;
  readonly disclosure: DisclosurePolicy;
  readonly regions: readonly SemanticRegion[];
}

export type CompositionEngineValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_PLAN"
  | "INVALID_LAYOUT_POLICY"
  | "INVALID_DISCLOSURE_POLICY"
  | "INTERNAL_REGION_COMPOSITION";

export interface CompositionEngineValidationIssue {
  readonly code: CompositionEngineValidationCode;
  readonly path: string;
  readonly message: string;
}

export type CompositionEngineResult =
  | { readonly ok: true; readonly value: ComposedExperience }
  | { readonly ok: false; readonly issue: CompositionEngineValidationIssue };
