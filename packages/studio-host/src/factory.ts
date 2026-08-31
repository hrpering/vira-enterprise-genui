import {
  createStudioHostBridge,
  createStudioHostSnapshot,
} from "./validate.js";
import {
  STUDIO_HOST_BRIDGE_VERSION,
  STUDIO_HOST_SNAPSHOT_VERSION,
} from "./types.js";
import type {
  StudioHostBridge,
  StudioHostBridgeResult,
  StudioHostSnapshot,
  StudioHostSnapshotResult,
} from "./types.js";

export type StudioHostDefinition = Omit<StudioHostBridge, "version">;
export type StudioHostSnapshotDefinition = Omit<StudioHostSnapshot, "version">;

export function defineStudioHost(input: StudioHostDefinition): StudioHostBridgeResult {
  return createStudioHostBridge({
    ...input,
    version: STUDIO_HOST_BRIDGE_VERSION,
  });
}

export function defineStudioHostSnapshot(input: StudioHostSnapshotDefinition): StudioHostSnapshotResult {
  return createStudioHostSnapshot({
    ...input,
    version: STUDIO_HOST_SNAPSHOT_VERSION,
  });
}
