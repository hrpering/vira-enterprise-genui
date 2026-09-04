import {
  VIRA_ENTERPRISE_CONTEXT_VERSION,
  VIRA_ENTERPRISE_ENVIRONMENTS,
  type ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";
import { parseJsonValue, type JsonObject, type JsonValue } from "@vira-enterprise-genui/protocol";
import {
  createStudioBrandPackage,
  type StudioBrandPackage,
  type StudioBrandTemplate,
} from "@vira-enterprise-genui/studio-brand";
import {
  createStudioWorkbenchSession,
  type CreateStudioWorkbenchSessionInput,
  type StudioWorkbenchSession,
} from "@vira-enterprise-genui/studio-workbench";

export const VIRA_STUDIO_BRAND_CONSOLE_VERSION = "1" as const;

export interface ViraStudioBrandConsoleTemplateSummary {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}
export interface ViraStudioBrandConsoleSession {
  readonly version: typeof VIRA_STUDIO_BRAND_CONSOLE_VERSION;
  readonly scope: ViraEnterpriseScope;
  readonly brandPackage: StudioBrandPackage;
  readonly listTemplates: () => readonly ViraStudioBrandConsoleTemplateSummary[];
  readonly openTemplate: (input: {
    readonly templateId: string;
    readonly allocateNodeId: CreateStudioWorkbenchSessionInput["allocateNodeId"];
    readonly initialViewId?: string;
  }) => ViraStudioBrandConsoleWorkbenchResult;
}
export type ViraStudioBrandConsoleIssueCode = "INVALID_SCOPE" | "INVALID_BRAND_PACKAGE" | "INVALID_TEMPLATE_INPUT" | "TEMPLATE_NOT_FOUND" | "WORKBENCH_FAILED";
export interface ViraStudioBrandConsoleIssue { readonly code: ViraStudioBrandConsoleIssueCode; readonly path: string; readonly message: string; }
export type ViraStudioBrandConsoleCreateResult = { readonly ok: true; readonly value: ViraStudioBrandConsoleSession } | { readonly ok: false; readonly issue: ViraStudioBrandConsoleIssue };
export type ViraStudioBrandConsoleWorkbenchResult = { readonly ok: true; readonly value: StudioWorkbenchSession } | { readonly ok: false; readonly issue: ViraStudioBrandConsoleIssue };

const idPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/;
function issue(code: ViraStudioBrandConsoleIssueCode, path: string, message: string): ViraStudioBrandConsoleIssue { return Object.freeze({ code, path, message }); }
function isObject(value: JsonValue | undefined): value is JsonObject { return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value); }
function parseScope(input: unknown): ViraEnterpriseScope | undefined {
  const parsed = parseJsonValue(input, "$.scope");
  if (!parsed.ok || !isObject(parsed.value)) return undefined;
  const value = parsed.value;
  const keys = Object.keys(value);
  if (keys.length !== 4 || !["version", "organizationId", "projectId", "environment"].every((key) => Object.hasOwn(value, key))) return undefined;
  if (value.version !== VIRA_ENTERPRISE_CONTEXT_VERSION || typeof value.organizationId !== "string" || !idPattern.test(value.organizationId) || typeof value.projectId !== "string" || !idPattern.test(value.projectId) || typeof value.environment !== "string" || !VIRA_ENTERPRISE_ENVIRONMENTS.includes(value.environment as ViraEnterpriseScope["environment"])) return undefined;
  return Object.freeze({ version: VIRA_ENTERPRISE_CONTEXT_VERSION, organizationId: value.organizationId, projectId: value.projectId, environment: value.environment as ViraEnterpriseScope["environment"] });
}
function templateById(brand: StudioBrandPackage, id: string): StudioBrandTemplate | undefined {
  for (let index = 0; index < brand.templates.length; index += 1) {
    const template = brand.templates[index];
    if (template?.id === id) return template;
  }
  return undefined;
}
function templateSummaries(brand: StudioBrandPackage): readonly ViraStudioBrandConsoleTemplateSummary[] {
  const summaries: ViraStudioBrandConsoleTemplateSummary[] = [];
  for (let index = 0; index < brand.templates.length; index += 1) {
    const template = brand.templates[index];
    if (template === undefined) continue;
    summaries.push(Object.freeze({ id: template.id, label: template.label, description: template.description }));
  }
  return Object.freeze(summaries);
}

export function createViraStudioBrandConsole(input: { readonly scope: unknown; readonly brandPackage: unknown }): ViraStudioBrandConsoleCreateResult {
  if (input === null || typeof input !== "object") return { ok: false, issue: issue("INVALID_SCOPE", "$", "Studio Brand Console input is invalid") };
  const scope = parseScope(input.scope);
  if (!scope) return { ok: false, issue: issue("INVALID_SCOPE", "$.scope", "Studio Brand Console requires an exact enterprise scope") };
  const brand = createStudioBrandPackage(input.brandPackage);
  if (!brand.ok) return { ok: false, issue: issue("INVALID_BRAND_PACKAGE", `$.brandPackage${brand.issue.path === "$" ? "" : brand.issue.path.slice(1)}`, brand.issue.message) };
  const brandPackage = brand.value;
  const templates = templateSummaries(brandPackage);
  const session: ViraStudioBrandConsoleSession = {
    version: VIRA_STUDIO_BRAND_CONSOLE_VERSION,
    scope,
    brandPackage,
    listTemplates: () => templates,
    openTemplate(workbenchInput) {
      if (workbenchInput === null || typeof workbenchInput !== "object" || typeof workbenchInput.templateId !== "string" || typeof workbenchInput.allocateNodeId !== "function") return { ok: false, issue: issue("INVALID_TEMPLATE_INPUT", "$.openTemplate", "workbench template input is invalid") };
      const template = templateById(brandPackage, workbenchInput.templateId);
      if (!template) return { ok: false, issue: issue("TEMPLATE_NOT_FOUND", "$.templateId", "brand template does not exist in the active package") };
      const opened = createStudioWorkbenchSession({
        document: template.document,
        componentCatalog: brandPackage.components,
        bindingSourceCatalog: brandPackage.dataSources,
        actionAdapter: brandPackage.actions,
        allocateNodeId: workbenchInput.allocateNodeId,
        ...(workbenchInput.initialViewId === undefined ? {} : { initialViewId: workbenchInput.initialViewId }),
      });
      if (!opened.ok) return { ok: false, issue: issue("WORKBENCH_FAILED", opened.issue.path, opened.issue.message) };
      return { ok: true, value: opened.value };
    },
  };
  return { ok: true, value: Object.freeze(session) };
}
