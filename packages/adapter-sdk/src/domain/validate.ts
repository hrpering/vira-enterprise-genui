import {
  isSemanticNamespace,
  isSemanticSegment,
  parseDomainData,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { freezeAdapterData } from "../internal/freeze.js";
import {
  DOMAIN_ADAPTER_CONTRACT_VERSION,
  DOMAIN_ADAPTER_MAX_TYPES,
} from "./types.js";
import type {
  DomainAdapterContractResult,
  DomainAdapterValidationCode,
  DomainDataForAdapterResult,
} from "./types.js";

const contractFields = new Set(["version", "id", "domain", "types"]);

function failure(code: DomainAdapterValidationCode, path: string, message: string): DomainAdapterContractResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function preflightTypes(input: unknown): DomainAdapterContractResult | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(input, "types");
  if (!descriptor || !("value" in descriptor) || !Array.isArray(descriptor.value)) return undefined;
  if (descriptor.value.length > DOMAIN_ADAPTER_MAX_TYPES) {
    return failure(
      "TYPE_LIMIT_EXCEEDED",
      "$.types",
      `domain adapter contract may declare at most ${DOMAIN_ADAPTER_MAX_TYPES} data types`,
    );
  }
  return undefined;
}

export function createDomainAdapterContract(input: unknown): DomainAdapterContractResult {
  const preflight = preflightTypes(input);
  if (preflight) return preflight;

  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "domain adapter contract must be a canonical JSON object");
  const fields = parsed.value;

  const unknownField = Object.keys(fields).sort().find((field) => !contractFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown domain adapter field: ${unknownField}`);
  if (fields.version !== DOMAIN_ADAPTER_CONTRACT_VERSION) {
    return failure("INVALID_VERSION", "$.version", `domain adapter contract version must be ${DOMAIN_ADAPTER_CONTRACT_VERSION}`);
  }
  if (typeof fields.id !== "string" || !isSemanticNamespace(fields.id)) {
    return failure("INVALID_ID", "$.id", "domain adapter id must be a semantic namespace");
  }
  if (typeof fields.domain !== "string" || !isSemanticNamespace(fields.domain)) {
    return failure("INVALID_DOMAIN", "$.domain", "domain must be a semantic namespace");
  }
  if (!Array.isArray(fields.types) || fields.types.length === 0) {
    return failure("INVALID_TYPES", "$.types", "types must be a non-empty array of semantic data-type segments");
  }
  if (fields.types.length > DOMAIN_ADAPTER_MAX_TYPES) {
    return failure("TYPE_LIMIT_EXCEEDED", "$.types", `domain adapter contract may declare at most ${DOMAIN_ADAPTER_MAX_TYPES} data types`);
  }

  const types: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < fields.types.length; index += 1) {
    const type = fields.types[index];
    if (typeof type !== "string" || !isSemanticSegment(type)) {
      return failure("INVALID_TYPES", `$.types[${index}]`, "domain data type must be one lower-case semantic segment");
    }
    if (seen.has(type)) {
      return failure("DUPLICATE_TYPE", `$.types[${index}]`, `duplicate domain data type: ${type}`);
    }
    seen.add(type);
    types.push(type);
  }

  return {
    ok: true,
    value: freezeAdapterData({
      version: DOMAIN_ADAPTER_CONTRACT_VERSION,
      id: fields.id,
      domain: fields.domain,
      types,
    }),
  };
}

export function normalizeDomainDataForAdapter(
  contractInput: unknown,
  dataInput: unknown,
): DomainDataForAdapterResult {
  const contract = createDomainAdapterContract(contractInput);
  if (!contract.ok) return contract;

  const data = parseDomainData(dataInput);
  if (!data.ok) {
    return {
      ok: false,
      issue: {
        code: "INVALID_DOMAIN_DATA",
        path: data.issue.path,
        message: data.issue.message,
      },
    };
  }
  if (data.value.domain !== contract.value.domain) {
    return {
      ok: false,
      issue: {
        code: "DOMAIN_MISMATCH",
        path: "$.domain",
        message: `domain data ${data.value.domain} does not match adapter domain ${contract.value.domain}`,
      },
    };
  }
  if (!contract.value.types.includes(data.value.type)) {
    return {
      ok: false,
      issue: {
        code: "UNSUPPORTED_DATA_TYPE",
        path: "$.type",
        message: `domain data type ${data.value.type} is not declared by the adapter contract`,
      },
    };
  }

  return { ok: true, value: freezeAdapterData(data.value) };
}
