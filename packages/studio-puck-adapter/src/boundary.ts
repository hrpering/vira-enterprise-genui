import type { Data } from "@puckeditor/core";
import { parseStudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import {
  importPuckDataIntoStudioDocument as importRawPuckDataIntoStudioDocument,
  studioViewToPuckData as exportRawStudioViewToPuckData,
} from "./convert.js";
import { createStudioPuckReservedIdMappings } from "./identity.js";
import type {
  StudioPuckDataExportResult,
  StudioPuckDataImportResult,
  StudioPuckIdMapping,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rewriteComponentIds(value: unknown, nodeToPuck: ReadonlyMap<string, string>): unknown {
  if (!isRecord(value)) return value;
  const props = value.props;
  if (!isRecord(props)) return value;

  const nextProps: Record<string, unknown> = {};
  for (const [key, propValue] of Object.entries(props)) {
    nextProps[key] = Array.isArray(propValue)
      ? propValue.map((child) => rewriteComponentIds(child, nodeToPuck))
      : propValue;
  }
  if (typeof props.id === "string") nextProps.id = nodeToPuck.get(props.id) ?? props.id;

  return { ...value, props: nextProps };
}

function rewriteExportedData(data: Data, mappings: readonly StudioPuckIdMapping[]): Data {
  if (mappings.length === 0) return data;
  const nodeToPuck = new Map(mappings.map((mapping) => [mapping.nodeId, mapping.puckId] as const));
  const source = data as unknown as Record<string, unknown>;
  const content = Array.isArray(source.content)
    ? source.content.map((item) => rewriteComponentIds(item, nodeToPuck))
    : source.content;
  return { ...source, content } as Data;
}

function collectComponentIds(data: unknown): ReadonlySet<string> {
  const ids = new Set<string>();
  if (!isRecord(data) || !Array.isArray(data.content)) return ids;

  const seen = new Set<object>();
  function walk(items: unknown[]): void {
    if (seen.has(items)) return;
    seen.add(items);
    for (const item of items) {
      if (!isRecord(item) || seen.has(item)) continue;
      seen.add(item);
      const props = item.props;
      if (!isRecord(props)) continue;
      if (typeof props.id === "string") ids.add(props.id);
      for (const value of Object.values(props)) {
        if (Array.isArray(value)) walk(value);
      }
    }
  }
  walk(data.content);
  return ids;
}

function reservedMappingsForView(documentInput: unknown, viewId: string): readonly StudioPuckIdMapping[] {
  const parsed = parseStudioExperienceDocument(documentInput);
  if (!parsed.ok) return Object.freeze([]);
  const view = parsed.value.views.find((candidate) => candidate.id === viewId);
  if (!view) return Object.freeze([]);
  return createStudioPuckReservedIdMappings(view.nodes.map((node) => node.id));
}

function mergeReservedMappings(input: {
  readonly document: unknown;
  readonly viewId: string;
  readonly data: unknown;
  readonly idMappings?: unknown;
}): unknown {
  const ids = collectComponentIds(input.data);
  const reserved = reservedMappingsForView(input.document, input.viewId)
    .filter((mapping) => ids.has(mapping.puckId));
  if (reserved.length === 0) return input.idMappings;
  if (input.idMappings === undefined) return reserved;
  if (!Array.isArray(input.idMappings)) return input.idMappings;

  const provided = input.idMappings;
  const missing = reserved.filter((mapping) => !provided.some((candidate) => {
    return isRecord(candidate)
      && candidate.puckId === mapping.puckId
      && candidate.nodeId === mapping.nodeId;
  }));
  return [...missing, ...provided];
}

export function studioViewToPuckData(
  documentInput: unknown,
  catalogInput: unknown,
  viewId: string,
): StudioPuckDataExportResult {
  const result = exportRawStudioViewToPuckData(documentInput, catalogInput, viewId);
  if (!result.ok) return result;
  const mappings = reservedMappingsForView(documentInput, viewId);
  return { ok: true, value: rewriteExportedData(result.value, mappings) };
}

export function importPuckDataIntoStudioDocument(input: {
  readonly document: unknown;
  readonly catalog: unknown;
  readonly viewId: string;
  readonly data: unknown;
  readonly idMappings?: unknown;
}): StudioPuckDataImportResult {
  return importRawPuckDataIntoStudioDocument({
    document: input.document,
    catalog: input.catalog,
    viewId: input.viewId,
    data: input.data,
    idMappings: mergeReservedMappings(input),
  });
}
