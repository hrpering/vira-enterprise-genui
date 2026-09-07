import type {
  ViraApplicationGraphCapabilityTarget,
  ViraApplicationGraphContextTarget,
  ViraApplicationGraphEdge,
  ViraApplicationGraphExactReference,
  ViraApplicationGraphExperienceTarget,
  ViraApplicationGraphMetadata,
  ViraApplicationGraphPublisher,
  ViraApplicationGraphValidationCode,
} from "./types.js";

export const VIRA_APPLICATION_GRAPH_V2_SCHEMA_VERSION = "2" as const;

export interface ViraApplicationGraphActionTargetV2 {
  readonly kind: "action";
  readonly ref: ViraApplicationGraphExactReference;
}

export type ViraApplicationGraphNodeTargetV2 =
  | ViraApplicationGraphExperienceTarget
  | ViraApplicationGraphCapabilityTarget
  | ViraApplicationGraphContextTarget
  | ViraApplicationGraphActionTargetV2;

export interface ViraApplicationGraphNodeV2 {
  readonly id: string;
  readonly target: ViraApplicationGraphNodeTargetV2;
}

export interface ViraApplicationGraphV2 {
  readonly schemaVersion: typeof VIRA_APPLICATION_GRAPH_V2_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly publisher: ViraApplicationGraphPublisher;
  readonly metadata: ViraApplicationGraphMetadata;
  readonly nodes: readonly ViraApplicationGraphNodeV2[];
  readonly edges: readonly ViraApplicationGraphEdge[];
}

export interface ViraApplicationGraphV2ValidationIssue {
  readonly code: ViraApplicationGraphValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ViraApplicationGraphV2Result =
  | { readonly ok: true; readonly value: ViraApplicationGraphV2 }
  | { readonly ok: false; readonly issue: ViraApplicationGraphV2ValidationIssue };

export type ViraApplicationGraphV2SerializationResult =
  | { readonly ok: true; readonly value: string; readonly graph: ViraApplicationGraphV2 }
  | { readonly ok: false; readonly issue: ViraApplicationGraphV2ValidationIssue };
