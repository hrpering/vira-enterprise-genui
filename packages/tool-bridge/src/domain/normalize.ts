import {
  isSemanticNamespace,
  isSemanticSegment,
  parseDomainData,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { JsonValue } from "@vira-enterprise-genui/protocol";
import { freezeToolBridgeData } from "../internal/freeze.js";
import { parseExternalToolResult } from "../validate.js";
import type { ExternalToolIdentity } from "../types.js";
import { TOOL_DOMAIN_MAPPING_VERSION } from "./types.js";
import type {
  ToolDomainMapping,
  ToolDomainMappingResult,
  ToolDomainMappingValidationCode,
  ToolDomainNormalizationResult,
  ToolDomainNormalizationValidationCode,
} from "./types.js";

const mappingFields = new Set(["version", "tool", "domain", "type"]);
const toolFields = new Set(["kind", "name"]);

interface NestedIssue {
  readonly path: string;
  readonly message: string;
}

type NestedResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: NestedIssue };

function mappingFailure(
  code: ToolDomainMappingValidationCode,
  path: string,
  message: string,
): ToolDomainMappingResult {
  return { ok: false, issue: { code, path, message } };
}

function normalizationFailure(
  code: ToolDomainNormalizationValidationCode,
  path: string,
  message: string,
): ToolDomainNormalizationResult {
  return { ok: false, issue: { code, path, message } };
}

function nestedFailure(path: string, message: string): { readonly ok: false; readonly issue: NestedIssue } {
  return { ok: false, issue: { path, message } };
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

function jsonObject(value: JsonValue): Readonly<Record<string, JsonValue>> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value;
}

function parseMappingTool(value: JsonValue | undefined): NestedResult<ExternalToolIdentity> {
  if (value === undefined) return nestedFailure("$.tool", "mapping tool identity is required");
  const fields = jsonObject(value);
  if (!fields) return nestedFailure("$.tool", "mapping tool identity must be an object");
  const extra = Object.keys(fields).sort().find((field) => !toolFields.has(field));
  if (extra) return nestedFailure(`$.tool.${extra}`, "mapping tool identity contains an unknown field");
  if (typeof fields.kind !== "string" || !isSemanticSegment(fields.kind)) {
    return nestedFailure("$.tool.kind", "mapping tool kind must be one semantic segment");
  }
  if (typeof fields.name !== "string" || !isSemanticNamespace(fields.name)) {
    return nestedFailure("$.tool.name", "mapping tool name must be a semantic namespace");
  }
  return { ok: true, value: freezeToolBridgeData({ kind: fields.kind, name: fields.name }) };
}

export function createToolDomainMapping(input: unknown): ToolDomainMappingResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return mappingFailure("INVALID_INPUT", parsed.issue.path, parsed.issue.reason);
  const fields = jsonObject(parsed.value);
  if (!fields) return mappingFailure("INVALID_INPUT", "$", "tool domain mapping must be an object");
  const extra = Object.keys(fields).sort().find((field) => !mappingFields.has(field));
  if (extra) return mappingFailure("UNKNOWN_FIELD", `$.${extra}`, "tool domain mapping contains an unknown field");
  if (fields.version !== TOOL_DOMAIN_MAPPING_VERSION) return mappingFailure("INVALID_VERSION", "$.version", "tool domain mapping version is invalid");
  const tool = parseMappingTool(fields.tool);
  if (!tool.ok) return mappingFailure("INVALID_TOOL", tool.issue.path, tool.issue.message);
  if (typeof fields.domain !== "string" || !isSemanticNamespace(fields.domain)) {
    return mappingFailure("INVALID_DOMAIN", "$.domain", "mapping domain must be a semantic namespace");
  }
  if (typeof fields.type !== "string" || !isSemanticSegment(fields.type)) {
    return mappingFailure("INVALID_DATA_TYPE", "$.type", "mapping type must be one semantic segment");
  }
  return {
    ok: true,
    value: freezeToolBridgeData({
      version: TOOL_DOMAIN_MAPPING_VERSION,
      tool: tool.value,
      domain: fields.domain,
      type: fields.type,
    } as ToolDomainMapping),
  };
}

function sameTool(left: ExternalToolIdentity, right: ExternalToolIdentity): boolean {
  return left.kind === right.kind && left.name === right.name;
}

export function normalizeToolResultToDomainData(
  toolResultInput: unknown,
  mappingInput: unknown,
): ToolDomainNormalizationResult {
  const toolResult = parseExternalToolResult(toolResultInput);
  if (!toolResult.ok) {
    return normalizationFailure(
      "INVALID_TOOL_RESULT",
      nestedPath("$.result", toolResult.issue.path),
      "external tool result is invalid",
    );
  }
  const mapping = createToolDomainMapping(mappingInput);
  if (!mapping.ok) {
    return normalizationFailure(
      "INVALID_MAPPING",
      nestedPath("$.mapping", mapping.issue.path),
      "tool domain mapping is invalid",
    );
  }
  if (!sameTool(toolResult.value.tool, mapping.value.tool)) {
    return normalizationFailure("TOOL_MISMATCH", "$.mapping.tool", "tool result does not match the exact mapped tool identity");
  }

  const target = freezeToolBridgeData({ domain: mapping.value.domain, type: mapping.value.type });
  if (toolResult.value.outcome === "empty") {
    return {
      ok: true,
      value: freezeToolBridgeData({
        outcome: "empty" as const,
        tool: toolResult.value.tool,
        target,
        ...(toolResult.value.freshness === undefined ? {} : { freshness: toolResult.value.freshness }),
      }),
    };
  }
  if (toolResult.value.outcome === "failure") {
    return {
      ok: true,
      value: freezeToolBridgeData({
        outcome: "failure" as const,
        tool: toolResult.value.tool,
        target,
        failure: toolResult.value.failure!,
        ...(toolResult.value.freshness === undefined ? {} : { freshness: toolResult.value.freshness }),
      }),
    };
  }

  const candidate = {
    version: "1",
    domain: mapping.value.domain,
    type: mapping.value.type,
    data: toolResult.value.data,
    source: {
      kind: toolResult.value.tool.kind,
      name: toolResult.value.tool.name,
    },
    ...(toolResult.value.freshness === undefined ? {} : { freshness: toolResult.value.freshness }),
  };
  const domainData = parseDomainData(candidate);
  if (!domainData.ok) {
    return normalizationFailure(
      "DOMAIN_DATA_REJECTED",
      nestedPath("$.domainData", domainData.issue.path),
      "normalized tool result was rejected by Protocol DomainData validation",
    );
  }

  const frozenDomainData = freezeToolBridgeData(domainData.value);
  if (toolResult.value.outcome === "success") {
    return {
      ok: true,
      value: freezeToolBridgeData({ outcome: "success" as const, domainData: frozenDomainData }),
    };
  }
  return {
    ok: true,
    value: freezeToolBridgeData({
      outcome: "partial" as const,
      domainData: frozenDomainData,
      ...(toolResult.value.failure === undefined ? {} : { failure: toolResult.value.failure }),
    }),
  };
}
