import { isSemanticNamespace, parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject } from "@vira-enterprise-genui/protocol";
import { parseStudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import {
  STUDIO_AUDIT_EVENT_VERSION,
  STUDIO_PORTABLE_BUNDLE_MAX_BYTES,
  STUDIO_PORTABLE_BUNDLE_VERSION,
} from "./types.js";
import type {
  StudioAuditEventResult,
  StudioAuditKind,
  StudioEnterpriseIssue,
  StudioEnterpriseValidationCode,
  StudioPortableBundleResult,
} from "./types.js";

const bundleFields = new Set(["version", "brandId", "document"]);
const auditFields = new Set(["kind", "experienceId", "brandId", "documentVersion", "timestamp"]);
const auditKinds = new Set<StudioAuditKind>(["draft.save", "publish", "unpublish", "import", "export", "brand.activate"]);

function issue(code: StudioEnterpriseValidationCode, path: string, message: string): StudioEnterpriseIssue {
  return Object.freeze({ code, path, message });
}
function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
function freeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) { for (const item of value) freeze(item); return Object.freeze(value); }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) freeze(record[key]);
  return Object.freeze(value);
}

export function createStudioPortableBundle(input: unknown): StudioPortableBundleResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok || !isObject(parsed.value)) return { ok: false, issue: issue("INVALID_TYPE", parsed.ok ? "$" : parsed.issue.path, "Studio portable bundle must be canonical JSON data") };
  const fields = parsed.value;
  const unknown = Object.keys(fields).sort().find((field) => !bundleFields.has(field));
  if (unknown) return { ok: false, issue: issue("UNKNOWN_FIELD", `$.${unknown}`, `unknown Studio portable bundle field: ${unknown}`) };
  if (fields.version !== STUDIO_PORTABLE_BUNDLE_VERSION) return { ok: false, issue: issue("INVALID_VERSION", "$.version", `portable bundle version must be ${STUDIO_PORTABLE_BUNDLE_VERSION}`) };
  if (typeof fields.brandId !== "string" || !isSemanticNamespace(fields.brandId)) return { ok: false, issue: issue("INVALID_BRAND_ID", "$.brandId", "brandId must be a semantic namespace") };
  const document = parseStudioExperienceDocument(fields.document);
  if (!document.ok) return { ok: false, issue: issue("INVALID_DOCUMENT", `$.document${document.issue.path === "$" ? "" : document.issue.path.slice(1)}`, document.issue.message) };
  const normalized = { version: STUDIO_PORTABLE_BUNDLE_VERSION, brandId: fields.brandId, document: document.value } as const;
  if (byteLength(normalized) > STUDIO_PORTABLE_BUNDLE_MAX_BYTES) return { ok: false, issue: issue("BUNDLE_TOO_LARGE", "$", `Studio portable bundle exceeds ${STUDIO_PORTABLE_BUNDLE_MAX_BYTES} bytes`) };
  return { ok: true, value: freeze(normalized) };
}

export function exportStudioPortableBundle(input: { readonly brandId: string; readonly document: unknown }): StudioPortableBundleResult {
  return createStudioPortableBundle({ version: STUDIO_PORTABLE_BUNDLE_VERSION, ...input });
}

export function migrateStudioPortableBundle(input: unknown): StudioPortableBundleResult {
  // Canvas v2 has one portable version. Future migrations must be explicit,
  // deterministic functions added here; unsupported versions are never guessed.
  return createStudioPortableBundle(input);
}

export function createStudioAuditEvent(input: unknown): StudioAuditEventResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return { ok: false, issue: issue("INVALID_AUDIT_EVENT", "$", "audit input must be a plain object") };
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return { ok: false, issue: issue("INVALID_AUDIT_EVENT", "$", "audit input must be a plain object") };
  if (Object.getOwnPropertySymbols(input).length > 0 || Object.getOwnPropertyNames(input).length !== Object.keys(input).length) return { ok: false, issue: issue("INVALID_AUDIT_EVENT", "$", "audit input must use enumerable string data properties only") };
  const fields = input as Record<string, unknown>;
  const unknown = Object.keys(fields).sort().find((field) => !auditFields.has(field));
  if (unknown) return { ok: false, issue: issue("UNKNOWN_FIELD", `$.${unknown}`, `audit event does not accept customer data field: ${unknown}`) };
  if (typeof fields.kind !== "string" || !auditKinds.has(fields.kind as StudioAuditKind)) return { ok: false, issue: issue("INVALID_AUDIT_EVENT", "$.kind", "unsupported Studio audit kind") };
  if (typeof fields.experienceId !== "string" || !isSemanticNamespace(fields.experienceId)) return { ok: false, issue: issue("INVALID_AUDIT_EVENT", "$.experienceId", "experienceId must be semantic") };
  if (typeof fields.brandId !== "string" || !isSemanticNamespace(fields.brandId)) return { ok: false, issue: issue("INVALID_AUDIT_EVENT", "$.brandId", "brandId must be semantic") };
  if (typeof fields.documentVersion !== "string" || fields.documentVersion.length === 0 || fields.documentVersion.length > 32) return { ok: false, issue: issue("INVALID_AUDIT_EVENT", "$.documentVersion", "documentVersion must be bounded") };
  if (typeof fields.timestamp !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(fields.timestamp)) return { ok: false, issue: issue("INVALID_AUDIT_EVENT", "$.timestamp", "timestamp must be UTC ISO-8601") };
  return { ok: true, value: Object.freeze({
    version: STUDIO_AUDIT_EVENT_VERSION,
    kind: fields.kind as StudioAuditKind,
    experienceId: fields.experienceId,
    brandId: fields.brandId,
    documentVersion: fields.documentVersion,
    timestamp: fields.timestamp,
  }) };
}
