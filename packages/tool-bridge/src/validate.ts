import {
  isSemanticNamespace,
  isSemanticSegment,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { JsonValue } from "@vira-enterprise-genui/protocol";
import {
  EXTERNAL_TOOL_RESULT_OUTCOMES,
  EXTERNAL_TOOL_RESULT_VERSION,
} from "./types.js";
import type {
  ExternalToolFailure,
  ExternalToolFreshness,
  ExternalToolIdentity,
  ExternalToolResult,
  ExternalToolResultOutcome,
  ExternalToolResultParseResult,
  ExternalToolResultValidationCode,
} from "./types.js";

const rootFields = new Set(["version", "tool", "outcome", "data", "failure", "freshness"]);
const toolFields = new Set(["kind", "name"]);
const failureFields = new Set(["code"]);
const freshnessFields = new Set(["observedAtUnixMs", "expiresAtUnixMs"]);

interface NestedIssue {
  readonly path: string;
  readonly message: string;
}

type NestedResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: NestedIssue };

function failure(
  code: ExternalToolResultValidationCode,
  path: string,
  message: string,
): ExternalToolResultParseResult {
  return { ok: false, issue: { code, path, message } };
}

function nestedFailure(path: string, message: string): { readonly ok: false; readonly issue: NestedIssue } {
  return { ok: false, issue: { path, message } };
}

function objectValue(value: JsonValue, path: string): NestedResult<Readonly<Record<string, JsonValue>>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return nestedFailure(path, "value must be a plain object");
  }
  return { ok: true, value };
}

function unknownField(
  value: Readonly<Record<string, JsonValue>>,
  allowed: ReadonlySet<string>,
): string | undefined {
  return Object.keys(value).sort().find((field) => !allowed.has(field));
}

function validUnixMs(value: JsonValue | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function deepFreezeJson(value: JsonValue): JsonValue {
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) {
      for (const item of value) deepFreezeJson(item);
    } else {
      for (const item of Object.values(value)) deepFreezeJson(item);
    }
    Object.freeze(value);
  }
  return value;
}

function parseTool(value: JsonValue | undefined): NestedResult<ExternalToolIdentity> {
  if (value === undefined) return nestedFailure("$.tool", "tool is required");
  const raw = objectValue(value, "$.tool");
  if (!raw.ok) return raw;
  const extra = unknownField(raw.value, toolFields);
  if (extra) return nestedFailure(`$.tool.${extra}`, "tool contains an unknown field");
  const kind = raw.value.kind;
  const name = raw.value.name;
  if (typeof kind !== "string" || !isSemanticSegment(kind)) {
    return nestedFailure("$.tool.kind", "tool kind must be one semantic segment");
  }
  if (typeof name !== "string" || !isSemanticNamespace(name)) {
    return nestedFailure("$.tool.name", "tool name must be a semantic namespace");
  }
  return { ok: true, value: Object.freeze({ kind, name }) };
}

function parseFailure(value: JsonValue | undefined): NestedResult<ExternalToolFailure> {
  if (value === undefined) return nestedFailure("$.failure", "failure metadata is required");
  const raw = objectValue(value, "$.failure");
  if (!raw.ok) return raw;
  const extra = unknownField(raw.value, failureFields);
  if (extra) return nestedFailure(`$.failure.${extra}`, "failure contains an unknown field");
  const code = raw.value.code;
  if (typeof code !== "string" || !isSemanticNamespace(code)) {
    return nestedFailure("$.failure.code", "failure code must be a semantic namespace");
  }
  return { ok: true, value: Object.freeze({ code }) };
}

function parseFreshness(value: JsonValue | undefined): NestedResult<ExternalToolFreshness> {
  if (value === undefined) return nestedFailure("$.freshness", "freshness metadata is required");
  const raw = objectValue(value, "$.freshness");
  if (!raw.ok) return raw;
  const extra = unknownField(raw.value, freshnessFields);
  if (extra) return nestedFailure(`$.freshness.${extra}`, "freshness contains an unknown field");
  const observedAtUnixMs = raw.value.observedAtUnixMs;
  const expiresAtUnixMs = raw.value.expiresAtUnixMs;
  if (!validUnixMs(observedAtUnixMs)) {
    return nestedFailure("$.freshness.observedAtUnixMs", "observedAtUnixMs must be a non-negative safe integer");
  }
  if (expiresAtUnixMs !== undefined && !validUnixMs(expiresAtUnixMs)) {
    return nestedFailure("$.freshness.expiresAtUnixMs", "expiresAtUnixMs must be a non-negative safe integer");
  }
  if (expiresAtUnixMs !== undefined && expiresAtUnixMs < observedAtUnixMs) {
    return nestedFailure("$.freshness.expiresAtUnixMs", "expiresAtUnixMs must be greater than or equal to observedAtUnixMs");
  }
  return {
    ok: true,
    value: Object.freeze({
      observedAtUnixMs,
      ...(expiresAtUnixMs === undefined ? {} : { expiresAtUnixMs }),
    }),
  };
}

function jsonFailureCode(path: string): ExternalToolResultValidationCode {
  if (path === "$.data" || path.startsWith("$.data.") || path.startsWith("$.data[")) return "INVALID_DATA";
  if (path === "$.tool" || path.startsWith("$.tool.") || path.startsWith("$.tool[")) return "INVALID_TOOL";
  if (path === "$.failure" || path.startsWith("$.failure.") || path.startsWith("$.failure[")) return "INVALID_FAILURE";
  if (path === "$.freshness" || path.startsWith("$.freshness.") || path.startsWith("$.freshness[")) return "INVALID_FRESHNESS";
  return "INVALID_INPUT";
}

export function parseExternalToolResult(input: unknown): ExternalToolResultParseResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure(jsonFailureCode(parsed.issue.path), parsed.issue.path, parsed.issue.reason);
  const root = objectValue(parsed.value, "$");
  if (!root.ok) return failure("INVALID_INPUT", root.issue.path, "external tool result must be an object");
  const fields = root.value;

  const extra = unknownField(fields, rootFields);
  if (extra) return failure("UNKNOWN_FIELD", `$.${extra}`, "external tool result contains an unknown field");
  if (fields.version !== EXTERNAL_TOOL_RESULT_VERSION) {
    return failure("INVALID_VERSION", "$.version", "external tool result version is invalid");
  }

  const tool = parseTool(fields.tool);
  if (!tool.ok) return failure("INVALID_TOOL", tool.issue.path, tool.issue.message);

  const outcome = fields.outcome;
  if (typeof outcome !== "string" || !EXTERNAL_TOOL_RESULT_OUTCOMES.includes(outcome as ExternalToolResultOutcome)) {
    return failure("INVALID_OUTCOME", "$.outcome", "external tool result outcome is invalid");
  }
  const typedOutcome = outcome as ExternalToolResultOutcome;

  const hasData = Object.hasOwn(fields, "data");
  const hasFailure = Object.hasOwn(fields, "failure");
  if ((typedOutcome === "success" || typedOutcome === "partial") && !hasData) {
    return failure("OUTCOME_CONFLICT", "$.data", `${typedOutcome} tool results require data`);
  }
  if ((typedOutcome === "empty" || typedOutcome === "failure") && hasData) {
    return failure("OUTCOME_CONFLICT", "$.data", `${typedOutcome} tool results must not carry data`);
  }
  if ((typedOutcome === "success" || typedOutcome === "empty") && hasFailure) {
    return failure("OUTCOME_CONFLICT", "$.failure", `${typedOutcome} tool results must not carry failure metadata`);
  }
  if (typedOutcome === "failure" && !hasFailure) {
    return failure("OUTCOME_CONFLICT", "$.failure", "failure tool results require semantic failure metadata");
  }

  let parsedFailure: ExternalToolFailure | undefined;
  if (hasFailure) {
    const result = parseFailure(fields.failure);
    if (!result.ok) return failure("INVALID_FAILURE", result.issue.path, result.issue.message);
    parsedFailure = result.value;
  }

  let freshness: ExternalToolFreshness | undefined;
  if (Object.hasOwn(fields, "freshness")) {
    const result = parseFreshness(fields.freshness);
    if (!result.ok) return failure("INVALID_FRESHNESS", result.issue.path, result.issue.message);
    freshness = result.value;
  }

  const normalized: ExternalToolResult = {
    version: EXTERNAL_TOOL_RESULT_VERSION,
    tool: tool.value,
    outcome: typedOutcome,
    ...(hasData ? { data: deepFreezeJson(fields.data as JsonValue) } : {}),
    ...(parsedFailure === undefined ? {} : { failure: parsedFailure }),
    ...(freshness === undefined ? {} : { freshness }),
  };
  return { ok: true, value: Object.freeze(normalized) };
}
