import { isSemanticSegment } from "@vira-enterprise-genui/protocol";
import {
  createStudioComponentCatalog,
  validateStudioDocumentAgainstCatalog,
} from "@vira-enterprise-genui/studio-catalog";
import type { StudioCatalogComponentDefinition } from "@vira-enterprise-genui/studio-catalog";
import {
  createStudioPuckEditorMetadata,
  importPuckDataIntoStudioDocument,
  STUDIO_PUCK_ID_MAX_LENGTH,
  studioViewToPuckData,
} from "@vira-enterprise-genui/studio-puck-adapter";
import { STUDIO_MAX_NODES_PER_VIEW } from "@vira-enterprise-genui/studio-schema";
import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import type {
  StudioNodeIdAllocationRequest,
  StudioNodeIdAllocator,
  StudioPuckAuthoringSessionResult,
  StudioPuckAuthoringValidationCode,
  StudioPuckAuthoringValidationIssue,
  StudioPuckReconcileResult,
} from "./types.js";

const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

function sessionFailure(
  code: StudioPuckAuthoringValidationCode,
  path: string,
  message: string,
): StudioPuckAuthoringSessionResult {
  return { ok: false, issue: { code, path, message } };
}

function reconcileFailure(
  code: StudioPuckAuthoringValidationCode,
  path: string,
  message: string,
): StudioPuckReconcileResult {
  return { ok: false, issue: { code, path, message } };
}

function authoringIssue(
  code: StudioPuckAuthoringValidationCode,
  path: string,
  message: string,
): StudioPuckAuthoringValidationIssue {
  return { code, path, message };
}

function ownDataValue(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function validPuckId(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= STUDIO_PUCK_ID_MAX_LENGTH
    && value.trim() === value
    && !controlCharacterPattern.test(value);
}

interface PuckIdentityCandidate {
  readonly puckId: string;
  readonly component: string;
  readonly path: string;
}

type CandidateResult =
  | { readonly ok: true; readonly value: readonly PuckIdentityCandidate[] }
  | { readonly ok: false; readonly issue: StudioPuckAuthoringValidationIssue };

function collectPuckIdentityCandidates(
  data: unknown,
  components: ReadonlyMap<string, StudioCatalogComponentDefinition>,
): CandidateResult {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, issue: authoringIssue("INVALID_PUCK_DATA", "$.data", "Puck data must be an object") };
  }
  const content = ownDataValue(data, "content");
  if (!Array.isArray(content)) {
    return { ok: false, issue: authoringIssue("INVALID_PUCK_DATA", "$.data.content", "Puck content must be an array") };
  }

  const candidates: PuckIdentityCandidate[] = [];
  const seenPuckIds = new Set<string>();
  const seenObjects = new Set<object>();
  let count = 0;

  function walk(items: unknown[], path: string): StudioPuckAuthoringValidationIssue | undefined {
    if (seenObjects.has(items)) return authoringIssue("INVALID_PUCK_DATA", path, "shared/circular Puck arrays are not supported");
    seenObjects.add(items);
    try {
      for (let index = 0; index < items.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(items, String(index));
        const itemPath = `${path}[${index}]`;
        if (!descriptor || !("value" in descriptor)) return authoringIssue("INVALID_PUCK_DATA", itemPath, "sparse/accessor Puck component data is not supported");
        const item = descriptor.value;
        count += 1;
        if (count > STUDIO_MAX_NODES_PER_VIEW) return authoringIssue("INVALID_PUCK_DATA", "$.data.content", "Puck view exceeds the Studio node limit");
        if (item === null || typeof item !== "object" || Array.isArray(item)) return authoringIssue("INVALID_PUCK_DATA", itemPath, "Puck component must be an object");
        if (seenObjects.has(item)) return authoringIssue("INVALID_PUCK_DATA", itemPath, "shared/circular Puck component objects are not supported");
        seenObjects.add(item);

        const type = ownDataValue(item, "type");
        const props = ownDataValue(item, "props");
        if (typeof type !== "string" || props === null || typeof props !== "object" || Array.isArray(props)) {
          return authoringIssue("INVALID_PUCK_DATA", itemPath, "Puck component requires type and props data fields");
        }
        const component = components.get(type);
        if (!component) return authoringIssue("INVALID_PUCK_DATA", `${itemPath}.type`, "Puck component is not registered in the active Studio catalog");
        const puckId = ownDataValue(props, "id");
        if (!validPuckId(puckId)) return authoringIssue("INVALID_PUCK_DATA", `${itemPath}.props.id`, "Puck component id must be a bounded string");
        if (seenPuckIds.has(puckId)) return authoringIssue("INVALID_PUCK_DATA", `${itemPath}.props.id`, "Puck component ids must be unique within a view");
        seenPuckIds.add(puckId);
        candidates.push({ puckId, component: type, path: `${itemPath}.props.id` });

        for (const slot of component.slots) {
          const children = ownDataValue(props, slot.name);
          if (children === undefined) continue;
          if (!Array.isArray(children)) return authoringIssue("INVALID_PUCK_DATA", `${itemPath}.props.${slot.name}`, "Puck slot must contain an inline component array");
          const nested = walk(children, `${itemPath}.props.${slot.name}`);
          if (nested) return nested;
        }
        seenObjects.delete(item);
      }
    } finally {
      seenObjects.delete(items);
    }
    return undefined;
  }

  const walkIssue = walk(content, "$.data.content");
  return walkIssue ? { ok: false, issue: walkIssue } : { ok: true, value: candidates };
}

export function createStudioPuckAuthoringSession(input: {
  readonly document: unknown;
  readonly catalog: unknown;
  readonly viewId: string;
  readonly allocateNodeId: unknown;
}): StudioPuckAuthoringSessionResult {
  const catalog = createStudioComponentCatalog(input.catalog);
  if (!catalog.ok) return sessionFailure("INVALID_INITIAL_STATE", "$.catalog", catalog.issue.message);
  const catalogValue = catalog.value;
  const metadata = createStudioPuckEditorMetadata(catalogValue);
  if (!metadata.ok) return sessionFailure("INVALID_INITIAL_STATE", metadata.issue.path, metadata.issue.message);
  const document = validateStudioDocumentAgainstCatalog(input.document, catalogValue);
  if (!document.ok) return sessionFailure("INVALID_INITIAL_STATE", "$.document", document.issue.message);
  if (!isSemanticSegment(input.viewId) || !document.value.views.some((view) => view.id === input.viewId)) {
    return sessionFailure("INVALID_INITIAL_STATE", "$.viewId", "requested Studio view does not exist");
  }
  if (typeof input.allocateNodeId !== "function") {
    return sessionFailure("INVALID_ALLOCATOR", "$.allocateNodeId", "allocateNodeId must be an explicit host function");
  }
  const allocateNodeId = input.allocateNodeId as StudioNodeIdAllocator;
  const components = new Map(catalogValue.components.map((component) => [component.ref, component] as const));
  const mappingCache = new Map<string, string>();
  const reservedNodeIds = new Set(
    document.value.views.find((view) => view.id === input.viewId)?.nodes.map((node) => node.id) ?? [],
  );
  let current: StudioExperienceDocument = document.value;

  function currentDocument(): StudioExperienceDocument {
    return current;
  }

  function toPuckData() {
    return studioViewToPuckData(current, catalogValue, input.viewId);
  }

  function resolveNodeId(puckId: string): string | undefined {
    if (!validPuckId(puckId)) return undefined;
    if (isSemanticSegment(puckId)) {
      const view = current.views.find((candidate) => candidate.id === input.viewId);
      if (view?.nodes.some((node) => node.id === puckId)) return puckId;
    }
    return mappingCache.get(puckId);
  }

  function reconcile(data: unknown): StudioPuckReconcileResult {
    const candidates = collectPuckIdentityCandidates(data, components);
    if (!candidates.ok) return { ok: false, issue: candidates.issue };

    const activeMappings: Array<{ puckId: string; nodeId: string }> = [];
    for (const candidate of candidates.value) {
      if (isSemanticSegment(candidate.puckId)) continue;
      let nodeId = mappingCache.get(candidate.puckId);
      if (nodeId === undefined) {
        const request: StudioNodeIdAllocationRequest = Object.freeze({
          viewId: input.viewId,
          component: candidate.component,
          puckId: candidate.puckId,
        });
        try {
          nodeId = allocateNodeId(request);
        } catch {
          return reconcileFailure("ID_ALLOCATION_FAILED", candidate.path, "host node-id allocation failed");
        }
        if (typeof nodeId !== "string" || !isSemanticSegment(nodeId)) {
          return reconcileFailure("INVALID_ALLOCATED_ID", candidate.path, "host node-id allocator must return one semantic Studio node id");
        }
        if (reservedNodeIds.has(nodeId)) {
          return reconcileFailure("ALLOCATED_ID_COLLISION", candidate.path, "host node-id allocator returned an already reserved id");
        }
        mappingCache.set(candidate.puckId, nodeId);
        reservedNodeIds.add(nodeId);
      }
      activeMappings.push({ puckId: candidate.puckId, nodeId });
    }

    const imported = importPuckDataIntoStudioDocument({
      document: current,
      catalog: catalogValue,
      viewId: input.viewId,
      data,
      idMappings: activeMappings,
    });
    if (!imported.ok) return reconcileFailure("IMPORT_FAILED", imported.issue.path, imported.issue.message);
    current = imported.value;
    return { ok: true, value: current };
  }

  return {
    ok: true,
    value: Object.freeze({
      viewId: input.viewId,
      currentDocument,
      toPuckData,
      reconcile,
      resolveNodeId,
    }),
  };
}
