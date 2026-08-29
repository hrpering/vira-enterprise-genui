import type { StudioPuckIdMapping } from "./types.js";

/**
 * Puck reserves `root` for its synthetic editor root and indexes that root in
 * the same node map as user content. Canonical Studio ids remain independent
 * from that implementation detail; only the adapter boundary aliases them.
 */
export const STUDIO_PUCK_RESERVED_NODE_IDS = Object.freeze(["root"] as const);
export const STUDIO_PUCK_ALIAS_PREFIX = "vira~" as const;

const reservedNodeIds = new Set<string>(STUDIO_PUCK_RESERVED_NODE_IDS);

export function studioNodeIdRequiresPuckAlias(nodeId: string): boolean {
  return reservedNodeIds.has(nodeId);
}

export function studioNodeIdToPuckId(nodeId: string): string {
  return studioNodeIdRequiresPuckAlias(nodeId)
    ? `${STUDIO_PUCK_ALIAS_PREFIX}${nodeId}`
    : nodeId;
}

export function puckIdToStudioReservedNodeId(puckId: string): string | undefined {
  for (const nodeId of STUDIO_PUCK_RESERVED_NODE_IDS) {
    if (studioNodeIdToPuckId(nodeId) === puckId) return nodeId;
  }
  return undefined;
}

export function createStudioPuckReservedIdMappings(
  nodeIds: readonly string[],
): readonly StudioPuckIdMapping[] {
  const mappings = nodeIds
    .filter(studioNodeIdRequiresPuckAlias)
    .map((nodeId) => Object.freeze({ puckId: studioNodeIdToPuckId(nodeId), nodeId }));
  return Object.freeze(mappings);
}
