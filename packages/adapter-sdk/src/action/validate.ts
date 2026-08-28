import {
  isSemanticNamespace,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { freezeAdapterData } from "../internal/freeze.js";
import {
  ACTION_ADAPTER_CONTRACT_VERSION,
  ACTION_ADAPTER_EVENT_MAX_LENGTH,
  ACTION_ADAPTER_MAX_MAPPINGS,
} from "./types.js";
import type {
  ActionAdapterContractResult,
  ActionAdapterMapping,
  ActionAdapterValidationCode,
  AdaptActionEventResult,
} from "./types.js";

const contractFields = new Set(["version", "id", "mappings"]);
const mappingFields = new Set(["event", "actionType"]);
const eventInputFields = new Set(["event", "payload"]);
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

function failure(code: ActionAdapterValidationCode, path: string, message: string): ActionAdapterContractResult {
  return { ok: false, issue: { code, path, message } };
}

function eventFailure(code: ActionAdapterValidationCode, path: string, message: string): AdaptActionEventResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validEvent(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= ACTION_ADAPTER_EVENT_MAX_LENGTH
    && value.trim() === value
    && !controlCharacterPattern.test(value);
}

function preflightMappings(input: unknown): ActionAdapterContractResult | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(input, "mappings");
  if (!descriptor || !("value" in descriptor) || !Array.isArray(descriptor.value)) return undefined;
  if (descriptor.value.length > ACTION_ADAPTER_MAX_MAPPINGS) {
    return failure("MAPPING_LIMIT_EXCEEDED", "$.mappings", `action adapter may declare at most ${ACTION_ADAPTER_MAX_MAPPINGS} mappings`);
  }
  return undefined;
}

export function createActionAdapterContract(input: unknown): ActionAdapterContractResult {
  const preflight = preflightMappings(input);
  if (preflight) return preflight;

  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "action adapter contract must be a canonical JSON object");
  const fields = parsed.value;

  const unknownField = Object.keys(fields).sort().find((field) => !contractFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown action adapter field: ${unknownField}`);
  if (fields.version !== ACTION_ADAPTER_CONTRACT_VERSION) return failure("INVALID_VERSION", "$.version", `action adapter contract version must be ${ACTION_ADAPTER_CONTRACT_VERSION}`);
  if (typeof fields.id !== "string" || !isSemanticNamespace(fields.id)) return failure("INVALID_ID", "$.id", "action adapter id must be a semantic namespace");
  if (!Array.isArray(fields.mappings) || fields.mappings.length === 0) return failure("INVALID_MAPPINGS", "$.mappings", "mappings must be a non-empty array");
  if (fields.mappings.length > ACTION_ADAPTER_MAX_MAPPINGS) return failure("MAPPING_LIMIT_EXCEEDED", "$.mappings", `action adapter may declare at most ${ACTION_ADAPTER_MAX_MAPPINGS} mappings`);

  const mappings: ActionAdapterMapping[] = [];
  const events = new Set<string>();
  for (let index = 0; index < fields.mappings.length; index += 1) {
    const raw = fields.mappings[index];
    if (!isJsonObject(raw)) return failure("INVALID_MAPPINGS", `$.mappings[${index}]`, "action mapping must be a canonical JSON object");
    const unknownMappingField = Object.keys(raw).sort().find((field) => !mappingFields.has(field));
    if (unknownMappingField) return failure("INVALID_MAPPINGS", `$.mappings[${index}].${unknownMappingField}`, `unknown action mapping field: ${unknownMappingField}`);
    if (!validEvent(raw.event)) return failure("INVALID_EVENT", `$.mappings[${index}].event`, `event must be a trimmed non-empty string of at most ${ACTION_ADAPTER_EVENT_MAX_LENGTH} characters`);
    if (events.has(raw.event)) return failure("DUPLICATE_EVENT", `$.mappings[${index}].event`, "duplicate action event mapping");
    if (typeof raw.actionType !== "string" || !isSemanticNamespace(raw.actionType)) return failure("INVALID_ACTION_TYPE", `$.mappings[${index}].actionType`, "actionType must be a semantic namespace");
    events.add(raw.event);
    mappings.push({ event: raw.event, actionType: raw.actionType });
  }

  return { ok: true, value: freezeAdapterData({ version: ACTION_ADAPTER_CONTRACT_VERSION, id: fields.id, mappings }) };
}

export function adaptActionEvent(contractInput: unknown, input: unknown): AdaptActionEventResult {
  const contract = createActionAdapterContract(contractInput);
  if (!contract.ok) return contract;
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return eventFailure("INVALID_EVENT_INPUT", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return eventFailure("INVALID_EVENT_INPUT", "$", "action event input must be a canonical JSON object");
  const fields = parsed.value;
  const unknownField = Object.keys(fields).sort().find((field) => !eventInputFields.has(field));
  if (unknownField) return eventFailure("INVALID_EVENT_INPUT", `$.${unknownField}`, `unknown action event input field: ${unknownField}`);
  if (!validEvent(fields.event)) return eventFailure("INVALID_EVENT", "$.event", `event must be a trimmed non-empty string of at most ${ACTION_ADAPTER_EVENT_MAX_LENGTH} characters`);

  const mapping = contract.value.mappings.find((candidate) => candidate.event === fields.event);
  if (!mapping) return eventFailure("UNMAPPED_EVENT", "$.event", "no exact action mapping exists for event");

  let payload: JsonObject = {};
  if (Object.hasOwn(fields, "payload")) {
    if (!isJsonObject(fields.payload)) return eventFailure("INVALID_PAYLOAD", "$.payload", "payload must be a canonical JSON object");
    payload = fields.payload;
  }
  return { ok: true, value: freezeAdapterData({ type: mapping.actionType, payload }) };
}
