import { validateStudioDocumentAgainstCatalog } from "@vira-enterprise-genui/studio-catalog";
import { parseStudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import { importPuckDataIntoStudioDocument as legacyImport } from "./convert.js";
import type { StudioPuckDataImportResult } from "./types.js";

export function importPuckDataIntoStudioDocument(input: Parameters<typeof legacyImport>[0]): StudioPuckDataImportResult {
  const original = parseStudioExperienceDocument(input.document); if (!original.ok) return legacyImport(input);
  const result = legacyImport(input); if (!result.ok) return result;
  const repeats = new Map(original.value.views.find((view) => view.id === input.viewId)?.nodes.filter((node) => node.repeat).map((node) => [node.id, node.repeat] as const) ?? []);
  const candidate: StudioExperienceDocument = { ...result.value, views: result.value.views.map((view) => view.id !== input.viewId ? view : { ...view, nodes: view.nodes.map((node) => { const repeat = repeats.get(node.id); return repeat ? { ...node, repeat } : node; }) }) };
  const validated = validateStudioDocumentAgainstCatalog(candidate, input.catalog); return validated.ok ? { ok: true, value: validated.value } : { ok: false, issue: { code: "INVALID_IMPORTED_DOCUMENT", path: `$.document${validated.issue.path.slice(1)}`, message: validated.issue.message } };
}
