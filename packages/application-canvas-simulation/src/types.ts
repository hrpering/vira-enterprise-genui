import type {
  ViraCanvasGraphRef,
} from "@vira-enterprise-genui/application-canvas";

export const VIRA_CANVAS_SIMULATION_VERSION = "1" as const;
export const VIRA_CANVAS_SIMULATION_MODE = "dry-run" as const;
export const VIRA_CANVAS_SIMULATION_MAX_STEPS = 1_024 as const;
export const VIRA_CANVAS_SIMULATION_MAX_ID_LENGTH = 128 as const;
export const VIRA_CANVAS_SIMULATION_MAX_SEMANTICS_SNAPSHOT_LENGTH = 2_000_000 as const;

export interface ViraCanvasSimulationScenario {
  readonly id: string;
  readonly graphRef: ViraCanvasGraphRef;
  readonly startNodeId: string;
  readonly edgeIds: readonly string[];
}

export interface ViraCanvasSimulationFrame {
  readonly index: number;
  readonly nodeId: string;
  readonly nodeKind: "experience" | "capability" | "context" | "action";
  readonly viaEdgeId: string | null;
}

export interface ViraCanvasSimulationTrace {
  readonly version: typeof VIRA_CANVAS_SIMULATION_VERSION;
  readonly mode: typeof VIRA_CANVAS_SIMULATION_MODE;
  readonly scenarioId: string;
  readonly sourceDraftId: string;
  readonly applicationRef: {
    readonly id: string;
    readonly version: string;
  };
  readonly graphRef: ViraCanvasGraphRef;
  readonly semanticsSnapshot: string;
  readonly frames: readonly ViraCanvasSimulationFrame[];
}

export interface ViraCanvasSimulationReplay {
  readonly version: typeof VIRA_CANVAS_SIMULATION_VERSION;
  readonly mode: typeof VIRA_CANVAS_SIMULATION_MODE;
  readonly scenarioId: string;
  readonly applicationRef: {
    readonly id: string;
    readonly version: string;
  };
  readonly graphRef: ViraCanvasGraphRef;
  readonly frames: readonly ViraCanvasSimulationFrame[];
  readonly matched: true;
}

export type ViraCanvasSimulationIssueCode =
  | "INVALID_INPUT"
  | "INVALID_SCENARIO"
  | "STEP_LIMIT_EXCEEDED"
  | "GRAPH_NOT_FOUND"
  | "NODE_NOT_FOUND"
  | "EDGE_NOT_FOUND"
  | "EDGE_PATH_MISMATCH"
  | "INVALID_TRACE"
  | "SEMANTIC_DRIFT";

export interface ViraCanvasSimulationIssue {
  readonly code: ViraCanvasSimulationIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCanvasSimulationResult =
  | { readonly ok: true; readonly value: ViraCanvasSimulationTrace }
  | { readonly ok: false; readonly issue: ViraCanvasSimulationIssue };

export type ViraCanvasSimulationReplayResult =
  | { readonly ok: true; readonly value: ViraCanvasSimulationReplay }
  | { readonly ok: false; readonly issue: ViraCanvasSimulationIssue };
