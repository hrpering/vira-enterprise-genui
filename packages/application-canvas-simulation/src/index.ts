export {
  VIRA_CANVAS_SIMULATION_MAX_ID_LENGTH,
  VIRA_CANVAS_SIMULATION_MAX_SEMANTICS_SNAPSHOT_LENGTH,
  VIRA_CANVAS_SIMULATION_MAX_STEPS,
  VIRA_CANVAS_SIMULATION_MODE,
  VIRA_CANVAS_SIMULATION_VERSION,
} from "./types.js";
export type {
  ViraCanvasSimulationFrame,
  ViraCanvasSimulationIssue,
  ViraCanvasSimulationIssueCode,
  ViraCanvasSimulationReplay,
  ViraCanvasSimulationReplayResult,
  ViraCanvasSimulationResult,
  ViraCanvasSimulationScenario,
  ViraCanvasSimulationTrace,
} from "./types.js";
export {
  replayViraCanvasSimulation,
  simulateViraCanvasScenario,
} from "./simulate.js";

export { VIRA_CANVAS_SIMULATION_V2_VERSION } from "./v2-types.js";
export type {
  ViraCanvasSimulationReplayV2,
  ViraCanvasSimulationReplayV2Result,
  ViraCanvasSimulationScenarioV2,
  ViraCanvasSimulationTraceV2,
  ViraCanvasSimulationV2Result,
} from "./v2-types.js";
export {
  replayViraCanvasSimulationV2,
  simulateViraCanvasScenarioV2,
} from "./v2-simulate.js";
