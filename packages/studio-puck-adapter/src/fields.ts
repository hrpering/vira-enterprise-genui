import { createStudioComponentCatalog } from "@vira-enterprise-genui/studio-catalog";
import type {
  StudioCatalogComponentDefinition,
  StudioCatalogPropDefinition,
} from "@vira-enterprise-genui/studio-catalog";
import { getStudioDesignControl } from "@vira-enterprise-genui/studio-design";
import { findPuckCatalogCompatibilityIssue } from "./compat.js";
import { STUDIO_PUCK_ADAPTER_VERSION } from "./types.js";
import type {
  StudioPuckAdapterValidationIssue,
  StudioPuckCategoryDefinition,
  StudioPuckComponentEditorDefinition,
  StudioPuckEditorMetadataResult,
  StudioPuckField,
} from "./types.js";

function failure(path: string, message: string): StudioPuckEditorMetadataResult {
  const issue: StudioPuckAdapterValidationIssue = { code: "INVALID_CATALOG", path, message };
  return { ok: false, issue };
}

function freezeMetadata<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeMetadata(item);
    return Object.freeze(value);
  }
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) freezeMetadata(object[key]);
  return Object.freeze(value);
}

function fieldForProp(prop: StudioCatalogPropDefinition): StudioPuckField {
  const design = getStudioDesignControl(prop.key);
  const label = design?.label ?? prop.key;
  if (design?.control === "color") return { type: "color", label };

  switch (prop.type) {
    case "string":
      return { type: "text", label };
    case "number":
      return {
        type: "number",
        label,
        ...(design?.min === undefined ? {} : { min: design.min }),
        ...(design?.max === undefined ? {} : { max: design.max }),
        ...(design?.step === undefined ? {} : { step: design.step }),
      };
    case "boolean":
      return {
        type: "radio",
        label,
        options: [
          { label: "True", value: true },
          { label: "False", value: false },
        ],
      };
    case "enum":
      return {
        type: "select",
        label,
        options: (prop.options ?? []).map((option) => ({ label: option, value: option })),
      };
  }
}

function componentDefinition(component: StudioCatalogComponentDefinition): StudioPuckComponentEditorDefinition {
  const fields: Record<string, StudioPuckField> = Object.create(null) as Record<string, StudioPuckField>;
  for (const prop of component.props) fields[prop.key] = fieldForProp(prop);
  for (const slot of component.slots) fields[slot.name] = { type: "slot", label: slot.label };
  return {
    type: component.ref,
    label: component.label,
    category: component.category,
    fields,
  };
}

export function createStudioPuckEditorMetadata(catalogInput: unknown): StudioPuckEditorMetadataResult {
  const catalog = createStudioComponentCatalog(catalogInput);
  if (!catalog.ok) return failure(`$.catalog${catalog.issue.path.slice(1)}`, catalog.issue.message);
  const compatibilityIssue = findPuckCatalogCompatibilityIssue(catalog.value);
  if (compatibilityIssue) return { ok: false, issue: compatibilityIssue };

  const components = catalog.value.components.map(componentDefinition);
  const categoryMap = new Map<string, string[]>();
  for (const component of components) {
    const refs = categoryMap.get(component.category) ?? [];
    refs.push(component.type);
    categoryMap.set(component.category, refs);
  }

  const categories: Record<string, StudioPuckCategoryDefinition> = Object.create(null) as Record<string, StudioPuckCategoryDefinition>;
  for (const [category, refs] of [...categoryMap.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    categories[category] = { title: category, components: refs };
  }

  return {
    ok: true,
    value: freezeMetadata({
      version: STUDIO_PUCK_ADAPTER_VERSION,
      catalogId: catalog.value.id,
      brandId: catalog.value.brandId,
      components,
      categories,
    }),
  };
}
