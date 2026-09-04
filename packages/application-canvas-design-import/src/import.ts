import {
  parseViraCanvasDraft,
  type ViraCanvasDraft,
} from "@vira-enterprise-genui/application-canvas";
import {
  compileDtcgDesignTokens,
} from "@vira-enterprise-genui/design-system-compiler";
import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_CANVAS_DESIGN_IMPORT_MAX_REVISION_LENGTH,
  VIRA_CANVAS_DESIGN_IMPORT_MAX_SOURCE_ID_LENGTH,
  VIRA_CANVAS_DESIGN_IMPORT_MODE,
  VIRA_CANVAS_DESIGN_IMPORT_VERSION,
  VIRA_CANVAS_DESIGN_SOURCE_FORMAT,
  type ViraCanvasDesignImportArtifact,
  type ViraCanvasDesignImportIssue,
  type ViraCanvasDesignImportIssueCode,
  type ViraCanvasDesignImportResult,
  type ViraCanvasExternalDesignSource,
} from "./types.js";

const ROOT_FIELDS = Object.freeze(["draft", "source"] as const);
const SOURCE_FIELDS = Object.freeze(["format", "sourceId", "revision", "document"] as const);
const SAFE_SOURCE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;
const FORBIDDEN_CONTROL_PATTERN = /[\u0000-\u001F\u007F]/;

type Failure = { readonly ok: false; readonly issue: ViraCanvasDesignImportIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function issue(
  code: ViraCanvasDesignImportIssueCode,
  path: string,
  message: string,
  compilerCode?: string,
): ViraCanvasDesignImportIssue {
  return Object.freeze({
    code,
    path,
    message,
    ...(compilerCode === undefined ? {} : { compilerCode }),
  });
}

function failure(
  code: ViraCanvasDesignImportIssueCode,
  path: string,
  message: string,
  compilerCode?: string,
): Failure {
  return { ok: false, issue: issue(code, path, message, compilerCode) };
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function shape(value: JsonObject, allowed: readonly string[]): string | undefined {
  const allowedSet = new Set(allowed);
  return Object.keys(value).sort().find((key) => !allowedSet.has(key))
    ?? allowed.find((key) => !Object.hasOwn(value, key));
}

function safeSourceToken(value: JsonValue | undefined, maxLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && value === value.trim()
    && !FORBIDDEN_CONTROL_PATTERN.test(value)
    && SAFE_SOURCE_TOKEN.test(value);
}

function freeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freeze(item);
    return Object.freeze(value) as T;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) freeze(record[key]);
  return Object.freeze(value);
}

function parseSource(value: JsonValue | undefined): Parsed<ViraCanvasExternalDesignSource> {
  if (!object(value)) {
    return failure("INVALID_SOURCE", "$.source", "source must be an exact safe-data object");
  }
  const unexpected = shape(value, SOURCE_FIELDS);
  if (unexpected) {
    return failure("INVALID_SOURCE", `$.source.${unexpected}`, `unknown or missing source field: ${unexpected}`);
  }
  if (value.format !== VIRA_CANVAS_DESIGN_SOURCE_FORMAT) {
    return failure(
      "UNSUPPORTED_FORMAT",
      "$.source.format",
      `source format must be ${VIRA_CANVAS_DESIGN_SOURCE_FORMAT}`,
    );
  }
  if (!safeSourceToken(value.sourceId, VIRA_CANVAS_DESIGN_IMPORT_MAX_SOURCE_ID_LENGTH)) {
    return failure("INVALID_SOURCE_ID", "$.source.sourceId", "sourceId must be a bounded opaque identifier");
  }
  if (!safeSourceToken(value.revision, VIRA_CANVAS_DESIGN_IMPORT_MAX_REVISION_LENGTH)) {
    return failure("INVALID_SOURCE_REVISION", "$.source.revision", "revision must be a bounded opaque identifier");
  }
  if (value.document === undefined || value.document === null || typeof value.document !== "object" || Array.isArray(value.document)) {
    return failure("INVALID_SOURCE", "$.source.document", "DTCG document must be a root object");
  }

  return {
    ok: true,
    value: freeze({
      format: VIRA_CANVAS_DESIGN_SOURCE_FORMAT,
      sourceId: value.sourceId,
      revision: value.revision,
      document: value.document,
    }),
  };
}

function parseDraft(value: JsonValue | undefined): Parsed<ViraCanvasDraft> {
  const parsed = parseViraCanvasDraft(value);
  if (!parsed.ok) {
    return failure(
      "INVALID_DRAFT",
      `$.draft${parsed.issue.path === "$" ? "" : parsed.issue.path.slice(1)}`,
      parsed.issue.message,
    );
  }
  return { ok: true, value: parsed.value };
}

export function importViraCanvasDesignSystem(input: unknown): ViraCanvasDesignImportResult {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !object(parsed.value)) {
    return failure(
      "INVALID_INPUT",
      parsed.ok ? "$" : parsed.issue.path,
      parsed.ok ? "Canvas design import input must be an exact safe-data object" : parsed.issue.reason,
    );
  }

  const root = parsed.value;
  const unexpected = shape(root, ROOT_FIELDS);
  if (unexpected) {
    return failure("INVALID_INPUT", `$.${unexpected}`, `unknown or missing import field: ${unexpected}`);
  }

  const draft = parseDraft(root.draft);
  if (!draft.ok) return draft;
  const brandRef = draft.value.semantics.application.brandRef;
  if (brandRef === null) {
    return failure(
      "BRAND_REF_REQUIRED",
      "$.draft.semantics.application.brandRef",
      "Canvas design import requires the Application to bind an exact brandRef before importing external design tokens",
    );
  }

  const source = parseSource(root.source);
  if (!source.ok) return source;

  const compiled = compileDtcgDesignTokens(source.value.document);
  if (!compiled.ok) {
    const suffix = compiled.issue.path === "$" ? "" : compiled.issue.path.slice(1);
    return failure(
      "COMPILE_FAILED",
      `$.source.document${suffix}`,
      compiled.issue.message,
      compiled.issue.code,
    );
  }

  const artifact: ViraCanvasDesignImportArtifact = freeze({
    version: VIRA_CANVAS_DESIGN_IMPORT_VERSION,
    mode: VIRA_CANVAS_DESIGN_IMPORT_MODE,
    draftId: draft.value.draftId,
    expectedRevision: draft.value.editorRevision,
    brandRef,
    source: source.value,
    compiled: compiled.value,
  });

  return { ok: true, value: artifact };
}
