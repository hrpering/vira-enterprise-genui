import type { Capability } from "@vira-enterprise-genui/protocol";
import type {
  ComposedExperience,
  DisclosurePolicy,
  LayoutPolicy,
  SemanticRegionRole,
} from "@vira-enterprise-genui/composer";

export interface RenderCapabilityBinding {
  readonly capability: Capability;
  readonly component: string;
}

export interface RenderModelRegion {
  readonly id: string;
  readonly role: SemanticRegionRole;
  readonly bindings: readonly RenderCapabilityBinding[];
}

export interface RenderModel {
  readonly planId: string;
  readonly mode: ComposedExperience["mode"];
  readonly layout: LayoutPolicy;
  readonly disclosure: DisclosurePolicy;
  readonly regions: readonly RenderModelRegion[];
}

export type RenderModelValidationCode =
  | "INVALID_INPUT"
  | "INVALID_COMPOSITION"
  | "INVALID_COMPONENT_ADAPTER"
  | "UNMAPPED_COMPONENT";

export interface RenderModelValidationIssue {
  readonly code: RenderModelValidationCode;
  readonly path: string;
  readonly message: string;
}

export type RenderModelResult =
  | { readonly ok: true; readonly value: RenderModel }
  | { readonly ok: false; readonly issue: RenderModelValidationIssue };
