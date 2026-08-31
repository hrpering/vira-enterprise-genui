import {
  createActionAdapterContract,
  createBrandProfile,
} from "@vira-enterprise-genui/adapter-sdk";
import { createStudioBindingSourceCatalog, validateStudioDocumentBindings } from "@vira-enterprise-genui/studio-binding";
import { createStudioComponentCatalog, validateStudioDocumentAgainstCatalog } from "@vira-enterprise-genui/studio-catalog";
import { validateStudioDocumentFlow } from "@vira-enterprise-genui/studio-flow";
import { isSemanticNamespace, isSemanticSegment, parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import type { StudioBrandPackageResult, StudioBrandPackageValidationCode, StudioBrandTemplate } from "./types.js";
import {
  STUDIO_BRAND_MAX_TEMPLATES,
  STUDIO_BRAND_PACKAGE_VERSION,
  STUDIO_BRAND_TEMPLATE_DESCRIPTION_MAX_LENGTH,
  STUDIO_BRAND_TEMPLATE_LABEL_MAX_LENGTH,
} from "./types.js";

const rootFields = new Set(["version", "id", "brand", "components", "dataSources", "actions", "templates"]);
const templateFields = new Set(["id", "label", "description", "document"]);
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

function failure(code: StudioBrandPackageValidationCode, path: string, message: string): StudioBrandPackageResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= maxLength
    && value.trim() === value
    && !controlCharacterPattern.test(value);
}

function freezeData<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeData(item);
    return Object.freeze(value);
  }
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) freezeData(object[key]);
  return Object.freeze(value);
}

export function createStudioBrandPackage(input: unknown): StudioBrandPackageResult {
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const templates = Object.getOwnPropertyDescriptor(input, "templates");
    if (templates && "value" in templates && Array.isArray(templates.value) && templates.value.length > STUDIO_BRAND_MAX_TEMPLATES) {
      return failure("TEMPLATE_LIMIT_EXCEEDED", "$.templates", `Studio brand package allows at most ${STUDIO_BRAND_MAX_TEMPLATES} templates`);
    }
  }

  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "Studio brand package must be a canonical JSON object");
  const fields = parsed.value;

  const unknown = Object.keys(fields).sort().find((field) => !rootFields.has(field));
  if (unknown) return failure("UNKNOWN_FIELD", `$.${unknown}`, `unknown Studio brand package field: ${unknown}`);
  if (fields.version !== STUDIO_BRAND_PACKAGE_VERSION) return failure("INVALID_VERSION", "$.version", `Studio brand package version must be ${STUDIO_BRAND_PACKAGE_VERSION}`);
  if (typeof fields.id !== "string" || !isSemanticNamespace(fields.id)) return failure("INVALID_ID", "$.id", "Studio brand package id must be a semantic namespace");

  const brand = createBrandProfile(fields.brand);
  if (!brand.ok) return failure("INVALID_BRAND_PROFILE", nestedPath("$.brand", brand.issue.path), brand.issue.message);
  const components = createStudioComponentCatalog(fields.components);
  if (!components.ok) return failure("INVALID_COMPONENT_CATALOG", nestedPath("$.components", components.issue.path), components.issue.message);
  if (brand.value.id !== components.value.brandId) {
    return failure("BRAND_ID_MISMATCH", "$.components.brandId", "component catalog brandId must exactly match the active brand profile id");
  }
  const dataSources = createStudioBindingSourceCatalog(fields.dataSources);
  if (!dataSources.ok) return failure("INVALID_BINDING_SOURCE_CATALOG", nestedPath("$.dataSources", dataSources.issue.path), dataSources.issue.message);
  const actions = createActionAdapterContract(fields.actions);
  if (!actions.ok) return failure("INVALID_ACTION_ADAPTER", nestedPath("$.actions", actions.issue.path), actions.issue.message);

  if (!Array.isArray(fields.templates)) return failure("INVALID_TEMPLATES", "$.templates", "templates must be an array");
  if (fields.templates.length > STUDIO_BRAND_MAX_TEMPLATES) return failure("TEMPLATE_LIMIT_EXCEEDED", "$.templates", `Studio brand package allows at most ${STUDIO_BRAND_MAX_TEMPLATES} templates`);

  const templates: StudioBrandTemplate[] = [];
  const templateIds = new Set<string>();
  for (let index = 0; index < fields.templates.length; index += 1) {
    const raw = fields.templates[index];
    const base = `$.templates[${index}]`;
    if (!isJsonObject(raw)) return failure("INVALID_TEMPLATE", base, "Studio brand template must be a canonical JSON object");
    const unknownTemplateField = Object.keys(raw).sort().find((field) => !templateFields.has(field));
    if (unknownTemplateField) return failure("INVALID_TEMPLATE", `${base}.${unknownTemplateField}`, `unknown Studio brand template field: ${unknownTemplateField}`);
    if (typeof raw.id !== "string" || !isSemanticSegment(raw.id)) return failure("INVALID_TEMPLATE", `${base}.id`, "template id must be a semantic segment");
    if (templateIds.has(raw.id)) return failure("DUPLICATE_TEMPLATE", `${base}.id`, "template ids must be unique inside a brand package");
    if (!validText(raw.label, STUDIO_BRAND_TEMPLATE_LABEL_MAX_LENGTH)) return failure("INVALID_TEMPLATE", `${base}.label`, "template label must be a bounded trimmed string");
    if (!validText(raw.description, STUDIO_BRAND_TEMPLATE_DESCRIPTION_MAX_LENGTH)) return failure("INVALID_TEMPLATE", `${base}.description`, "template description must be a bounded trimmed string");

    const catalogDocument = validateStudioDocumentAgainstCatalog(raw.document, components.value);
    if (!catalogDocument.ok) return failure("INVALID_TEMPLATE_DOCUMENT", nestedPath(`${base}.document`, catalogDocument.issue.path), catalogDocument.issue.message);
    const boundDocument = validateStudioDocumentBindings(catalogDocument.value, components.value, dataSources.value);
    if (!boundDocument.ok) return failure("INVALID_TEMPLATE_DOCUMENT", nestedPath(`${base}.document`, boundDocument.issue.path), boundDocument.issue.message);
    const flowedDocument = validateStudioDocumentFlow(boundDocument.value, components.value, actions.value);
    if (!flowedDocument.ok) return failure("INVALID_TEMPLATE_DOCUMENT", nestedPath(`${base}.document`, flowedDocument.issue.path), flowedDocument.issue.message);

    templateIds.add(raw.id);
    templates.push({
      id: raw.id,
      label: raw.label,
      description: raw.description,
      document: flowedDocument.value,
    });
  }

  return {
    ok: true,
    value: freezeData({
      version: STUDIO_BRAND_PACKAGE_VERSION,
      id: fields.id,
      brand: brand.value,
      components: components.value,
      dataSources: dataSources.value,
      actions: actions.value,
      templates,
    }),
  };
}
