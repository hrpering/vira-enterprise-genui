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
  if (value === null || typeof value !== "object") return false;
  try {
    return !Array.isArray(value);
  } catch {
    return false;
  }
}

function ownDataValue(value: object, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function ownDenseArrayValues(value: unknown): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value)) return undefined;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor) || typeof lengthDescriptor.value !== "number") return undefined;
    const output: unknown[] = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor)) return undefined;
      output.push(descriptor.value);
    }
    return output;
  } catch {
    return undefined;
  }
}

function ownEnumerableDataValues(value: object): readonly unknown[] | undefined {
  try {
    const output: unknown[] = [];
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) return undefined;
      output.push(descriptor.value);
    }
    return output;
  } catch {
    return undefined;
  }
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

function collectComponentIds(data: unknown): ReadonlySet<string> | undefined {
  if (!isRecord(data)) return new Set<string>();
  const content = ownDenseArrayValues(ownDataValue(data, "content"));
  if (content === undefined) return new Set<string>();

  const ids = new Set<string>();
  const seen = new Set<object>();

  function walk(items: readonly unknown[]): boolean {
    for (const item of items) {
      if (!isRecord(item)) continue;
      if (seen.has(item)) continue;
      seen.add(item);

      const props = ownDataValue(item, "props");
      if (!isRecord(props)) continue;
      const id = ownDataValue(props, "id");
      if (typeof id === "string") ids.add(id);

      const values = ownEnumerableDataValues(props);
      if (values === undefined) return false;
      for (const propValue of values) {
        const children = ownDenseArrayValues(propValue);
        if (children !== undefined && !walk(children)) return false;
      }
    }
    return true;
  }

  return walk(content) ? ids : undefined;
}

function reservedMappingsForView(documentInput: unknown, viewId: string): readonly StudioPuckIdMapping[] {
  const parsed = parseStudioExperienceDocument(documentInput);
  if (!parsed.ok) return Object.freeze([]);
  const view = parsed.value.views.find((candidate) => candidate.id === viewId);
  if (!view) return Object.freeze([]);
  return createStudioPuckReservedIdMappings(view.nodes.map((node) => node.id));
}

function containsExactMapping(input: readonly unknown[], mapping: StudioPuckIdMapping): boolean {
  for (const candidate of input) {
    if (!isRecord(candidate)) continue;
    if (ownDataValue(candidate, "puckId") === mapping.puckId && ownDataValue(candidate, "nodeId") === mapping.nodeId) {
      return true;
    }
  }
  return false;
}

function mergeReservedMappings(input: {
  readonly document: unknown;
  readonly viewId: string;
  readonly data: unknown;
  readonly idMappings?: unknown;
}): unknown {
  const ids = collectComponentIds(input.data);
  if (ids === undefined) return input.idMappings;
  const reserved = reservedMappingsForView(input.document, input.viewId)
    .filter((mapping) => ids.has(mapping.puckId));
  if (reserved.length === 0) return input.idMappings;
  if (input.idMappings === undefined) return reserved;

  const provided = ownDenseArrayValues(input.idMappings);
  if (provided === undefined) return input.idMappings;
  const missing = reserved.filter((mapping) => !containsExactMapping(provided, mapping));
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
  try {
    return importRawPuckDataIntoStudioDocument({
      document: input.document,
      catalog: input.catalog,
      viewId: input.viewId,
      data: input.data,
      idMappings: mergeReservedMappings(input),
    });
  } catch {
    return {
      ok: false,
      issue: {
        code: "INVALID_PUCK_DATA",
        path: "$.data",
        message: "Puck data could not be safely inspected",
      },
    };
  }
}
