import type {
  ViraCanvasSimulationFrame,
  ViraCanvasSimulationIssue,
  ViraCanvasSimulationScenario,
} from "./types.js";

export const VIRA_CANVAS_SIMULATION_V2_VERSION = "2" as const;

export interface ViraCanvasSimulationTraceV2 {
  readonly version: typeof VIRA_CANVAS_SIMULATION_V2_VERSION;
  readonly mode: "dry-run";
  readonly scenarioId: string;
  readonly sourceDraftId: string;
  readonly applicationRef: { readonly id: string; readonly version: string };
  readonly graphRef: { readonly id: string; readonly version: string };
  readonly semanticsSnapshot: string;
  readonly frames: readonly ViraCanvasSimulationFrame[];
}

export interface ViraCanvasSimulationReplayV2 {
  readonly version: typeof VIRA_CANVAS_SIMULATION_V2_VERSION;
  readonly mode: "dry-run";
  readonly scenarioId: string;
  readonly applicationRef: { readonly id: string; readonly version: string };
  readonly graphRef: { readonly id: string; readonly version: string };
  readonly frames: readonly ViraCanvasSimulationFrame[];
  readonly matched: true;
}

export type ViraCanvasSimulationV2Result =
  | { readonly ok: true; readonly value: ViraCanvasSimulationTraceV2 }
  | { readonly ok: false; readonly issue: ViraCanvasSimulationIssue };

export type ViraCanvasSimulationReplayV2Result =
  | { readonly ok: true; readonly value: ViraCanvasSimulationReplayV2 }
  | { readonly ok: false; readonly issue: ViraCanvasSimulationIssue };

export type ViraCanvasSimulationScenarioV2 = ViraCanvasSimulationScenario;
