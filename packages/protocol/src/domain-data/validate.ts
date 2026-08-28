import { parseJsonValue } from "../json-value.js";
import { readDataObjectInput } from "../object-input.js";
import { isSemanticNamespace, isSemanticSegment } from "../semantic-id.js";
import { DOMAIN_DATA_PROTOCOL_VERSION } from "./types.js";
import type {
  DomainData,
  DomainDataFreshness,
  DomainDataParseResult,
  DomainDataSource,
  DomainDataValidationCode,
} from "./types.js";

const allowedFields = new Set(["version", "domain", "type", "data", "source", "freshness"]);
const sourceFields = new Set(["kind", "name"]);
const freshnessFields = new Set(["observedAtUnixMs", "expiresAtUnixMs"]);

function failure(code: DomainDataValidationCode, path: string, message: string): DomainDataParseResult {
  return { ok: false, issue: { code, path, message } };
}

function firstUnknownField(fields: Readonly<Record<string, unknown>>, allowed: ReadonlySet<string>): string | undefined {
  return Object.keys(fields).sort().find((field) => !allowed.has(field));
}

function parseSource(value: unknown):
  | { readonly ok: true; readonly value: DomainDataSource }
  | { readonly ok: false; readonly path: string; readonly message: string } {
  const input = readDataObjectInput(value, "$.source");
  if (!input.ok) return { ok: false, path: input.issue.path, message: input.issue.reason };
  const fields = input.value;

  const unknownField = firstUnknownField(fields, sourceFields);
  if (unknownField) return { ok: false, path: `$.source.${unknownField}`, message: `unknown source field: ${unknownField}` };

  if (typeof fields.kind !== "string" || !isSemanticSegment(fields.kind)) {
    return { ok: false, path: "$.source.kind", message: "source kind must be one lower-case semantic segment" };
  }

  let name: string | undefined;
  if (Object.hasOwn(fields, "name")) {
    if (typeof fields.name !== "string" || !isSemanticNamespace(fields.name)) {
      return {
        ok: false,
        path: "$.source.name",
        message: "source name must be a semantic namespace, not an opaque endpoint or credential reference",
      };
    }
    name = fields.name;
  }

  return {
    ok: true,
    value: {
      kind: fields.kind,
      ...(name === undefined ? {} : { name }),
    },
  };
}

function validUnixMs(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseFreshness(value: unknown):
  | { readonly ok: true; readonly value: DomainDataFreshness }
  | { readonly ok: false; readonly path: string; readonly message: string } {
  const input = readDataObjectInput(value, "$.freshness");
  if (!input.ok) return { ok: false, path: input.issue.path, message: input.issue.reason };
  const fields = input.value;

  const unknownField = firstUnknownField(fields, freshnessFields);
  if (unknownField) return { ok: false, path: `$.freshness.${unknownField}`, message: `unknown freshness field: ${unknownField}` };

  if (!validUnixMs(fields.observedAtUnixMs)) {
    return { ok: false, path: "$.freshness.observedAtUnixMs", message: "observedAtUnixMs must be a non-negative safe integer" };
  }

  let expiresAtUnixMs: number | undefined;
  if (Object.hasOwn(fields, "expiresAtUnixMs")) {
    if (!validUnixMs(fields.expiresAtUnixMs) || fields.expiresAtUnixMs < fields.observedAtUnixMs) {
      return {
        ok: false,
        path: "$.freshness.expiresAtUnixMs",
        message: "expiresAtUnixMs must be a non-negative safe integer greater than or equal to observedAtUnixMs",
      };
    }
    expiresAtUnixMs = fields.expiresAtUnixMs;
  }

  return {
    ok: true,
    value: {
      observedAtUnixMs: fields.observedAtUnixMs,
      ...(expiresAtUnixMs === undefined ? {} : { expiresAtUnixMs }),
    },
  };
}

export function parseDomainData(value: unknown): DomainDataParseResult {
  const input = readDataObjectInput(value);
  if (!input.ok) return failure("INVALID_TYPE", input.issue.path, input.issue.reason);
  const fields = input.value;

  const unknownField = firstUnknownField(fields, allowedFields);
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown domain data field: ${unknownField}`);

  if (fields.version !== DOMAIN_DATA_PROTOCOL_VERSION) {
    return failure("INVALID_VERSION", "$.version", `domain data version must be ${DOMAIN_DATA_PROTOCOL_VERSION}`);
  }

  if (typeof fields.domain !== "string" || !isSemanticNamespace(fields.domain)) {
    return failure("INVALID_DOMAIN", "$.domain", "domain must be a lower-case semantic namespace");
  }

  if (typeof fields.type !== "string" || !isSemanticSegment(fields.type)) {
    return failure("INVALID_DATA_TYPE", "$.type", "type must be one lower-case semantic segment");
  }

  const parsedData = parseJsonValue(fields.data, "$.data");
  if (!parsedData.ok) return failure("INVALID_DATA", parsedData.issue.path, parsedData.issue.reason);

  let source: DomainDataSource | undefined;
  if (Object.hasOwn(fields, "source")) {
    const parsedSource = parseSource(fields.source);
    if (!parsedSource.ok) return failure("INVALID_SOURCE", parsedSource.path, parsedSource.message);
    source = parsedSource.value;
  }

  let freshness: DomainDataFreshness | undefined;
  if (Object.hasOwn(fields, "freshness")) {
    const parsedFreshness = parseFreshness(fields.freshness);
    if (!parsedFreshness.ok) return failure("INVALID_FRESHNESS", parsedFreshness.path, parsedFreshness.message);
    freshness = parsedFreshness.value;
  }

  return {
    ok: true,
    value: {
      version: DOMAIN_DATA_PROTOCOL_VERSION,
      domain: fields.domain,
      type: fields.type,
      data: parsedData.value,
      ...(source === undefined ? {} : { source }),
      ...(freshness === undefined ? {} : { freshness }),
    },
  };
}

export function isDomainData(value: unknown): value is DomainData {
  return parseDomainData(value).ok;
}

export function domainDataKey(value: Pick<DomainData, "domain" | "type">): string {
  return `${value.domain}.${value.type}`;
}
