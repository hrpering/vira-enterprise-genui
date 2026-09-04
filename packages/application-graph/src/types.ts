export const VIRA_APPLICATION_GRAPH_SCHEMA_VERSION = "1" as const;
export const VIRA_APPLICATION_GRAPH_MAX_NODES = 256 as const;
export const VIRA_APPLICATION_GRAPH_MAX_EDGES = 1_024 as const;
export const VIRA_APPLICATION_GRAPH_NAME_MAX_LENGTH = 120 as const;
export const VIRA_APPLICATION_GRAPH_DESCRIPTION_MAX_LENGTH = 2_000 as const;
export const VIRA_APPLICATION_GRAPH_PUBLISHER_NAME_MAX_LENGTH = 120 as const;

export const VIRA_APPLICATION_GRAPH_NODE_KINDS = Object.freeze([
  "experience",
  "capability",
  "context",
  "action",
] as const);

export const VIRA_APPLICATION_GRAPH_EDGE_KINDS = Object.freeze([
  "experience-uses-capability",
  "experience-offers-action",
  "context-input",
  "context-output",
  "semantic-transition",
] as const);

export type ViraApplicationGraphNodeKind = (typeof VIRA_APPLICATION_GRAPH_NODE_KINDS)[number];
export type ViraApplicationGraphEdgeKind = (typeof VIRA_APPLICATION_GRAPH_EDGE_KINDS)[number];

export interface ViraApplicationGraphPublisher {
  readonly id: string;
  readonly name: string;
}

export interface ViraApplicationGraphMetadata {
  readonly name: string;
  readonly description?: string;
}

export interface ViraApplicationGraphExactReference {
  readonly id: string;
  readonly versionRef: string;
}

export interface ViraApplicationGraphExperienceReference {
  readonly id: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly entrypoint: string;
}

export interface ViraApplicationGraphExperienceTarget {
  readonly kind: "experience";
  readonly ref: ViraApplicationGraphExperienceReference;
}

export interface ViraApplicationGraphCapabilityTarget {
  readonly kind: "capability";
  readonly ref: ViraApplicationGraphExactReference;
}

export interface ViraApplicationGraphContextTarget {
  readonly kind: "context";
  readonly ref: ViraApplicationGraphExactReference;
}

export interface ViraApplicationGraphActionTarget {
  readonly kind: "action";
  readonly actionType: string;
}

export type ViraApplicationGraphNodeTarget =
  | ViraApplicationGraphExperienceTarget
  | ViraApplicationGraphCapabilityTarget
  | ViraApplicationGraphContextTarget
  | ViraApplicationGraphActionTarget;

export interface ViraApplicationGraphNode {
  readonly id: string;
  readonly target: ViraApplicationGraphNodeTarget;
}

export interface ViraApplicationGraphEdge {
  readonly id: string;
  readonly kind: ViraApplicationGraphEdgeKind;
  readonly from: string;
  readonly to: string;
}

export interface ViraApplicationGraph {
  readonly schemaVersion: typeof VIRA_APPLICATION_GRAPH_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly publisher: ViraApplicationGraphPublisher;
  readonly metadata: ViraApplicationGraphMetadata;
  readonly nodes: readonly ViraApplicationGraphNode[];
  readonly edges: readonly ViraApplicationGraphEdge[];
}

export type ViraApplicationGraphValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_ID"
  | "INVALID_VERSION"
  | "INVALID_PUBLISHER"
  | "INVALID_METADATA"
  | "INVALID_NODE"
  | "INVALID_NODE_TARGET"
  | "INVALID_REFERENCE"
  | "FLOATING_REFERENCE"
  | "NODE_LIMIT_EXCEEDED"
  | "DUPLICATE_NODE"
  | "INVALID_EDGE"
  | "INVALID_EDGE_KIND"
  | "EDGE_LIMIT_EXCEEDED"
  | "DUPLICATE_EDGE"
  | "EDGE_NODE_NOT_FOUND"
  | "INVALID_EDGE_RELATION"
  | "EMPTY_GRAPH";

export interface ViraApplicationGraphValidationIssue {
  readonly code: ViraApplicationGraphValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ViraApplicationGraphResult =
  | { readonly ok: true; readonly value: ViraApplicationGraph }
  | { readonly ok: false; readonly issue: ViraApplicationGraphValidationIssue };

export type ViraApplicationGraphSerializationResult =
  | { readonly ok: true; readonly value: string; readonly graph: ViraApplicationGraph }
  | { readonly ok: false; readonly issue: ViraApplicationGraphValidationIssue };
