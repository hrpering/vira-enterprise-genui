import { COMPOSITION_PRIORITY_MODES } from "./types.js";
import type { CompositionPriorityMode } from "./types.js";

export function isCompositionPriorityMode(value: unknown): value is CompositionPriorityMode {
  return typeof value === "string" && COMPOSITION_PRIORITY_MODES.includes(value as CompositionPriorityMode);
}
