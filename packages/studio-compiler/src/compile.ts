import { parseStudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import { STUDIO_PUBLICATION_VERSION } from "./types.js";
import type { StudioPublicationResult } from "./types.js";
function sorted(values: Iterable<string>): readonly string[] { return Object.freeze([...new Set(values)].sort((left, right) => left.localeCompare(right))); }
export function compileStudioExperience(input: unknown): StudioPublicationResult {
  const parsed = parseStudioExperienceDocument(input); if (!parsed.ok) return parsed; const document = parsed.value;
  const componentRefs: string[] = []; const bindingSources: string[] = document.bindings.map((binding) => `${binding.source.kind}:${binding.source.path}`);
  for (const view of document.views) for (const node of view.nodes) { componentRefs.push(node.component); if (node.repeat) bindingSources.push(`${node.repeat.source.kind}:${node.repeat.source.path}`); }
  for (const interaction of document.interactions) for (const payload of interaction.payloadBindings ?? []) if (payload.source.kind !== "literal") bindingSources.push(`${payload.source.kind}:${payload.source.path}`);
  const publication = { version: STUDIO_PUBLICATION_VERSION, id: document.id, recipeId: document.recipeId, entryView: document.entryView, document, manifest: Object.freeze({ componentRefs: sorted(componentRefs), actionEvents: sorted(document.interactions.map((interaction) => interaction.actionEvent)), bindingSources: sorted(bindingSources) }) } as const;
  return { ok: true, value: Object.freeze(publication) };
}
