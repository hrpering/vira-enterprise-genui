import { isSemanticNamespace, parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import {
  STUDIO_HOST_ACTION_OUTCOMES,
  STUDIO_HOST_BRIDGE_VERSION,
  STUDIO_HOST_SNAPSHOT_VERSION,
} from "./types.js";
import type {
  StudioHostActionOutcome,
  StudioHostActionResultValidationResult,
  StudioHostBridge,
  StudioHostBridgeResult,
  StudioHostSnapshotResult,
  StudioHostValidationCode,
} from "./types.js";

const snapshotFields = new Set(["version", "revision", "state", "domain"]);
const actionResultFields = new Set(["outcome", "snapshot"]);
const bridgeFields = new Set(["version", "id", "snapshot", "dispatch", "subscribe"]);
const actionOutcomes = new Set<StudioHostActionOutcome>(STUDIO_HOST_ACTION_OUTCOMES);

function snapshotFailure(code: StudioHostValidationCode, path: string, message: string): StudioHostSnapshotResult {
  return { ok: false, issue: { code, path, message } };
}

function actionFailure(code: StudioHostValidationCode, path: string, message: string): StudioHostActionResultValidationResult {
  return { ok: false, issue: { code, path, message } };
}

function bridgeFailure(code: StudioHostValidationCode, path: string, message: string): StudioHostBridgeResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
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

export function createStudioHostSnapshot(input: unknown): StudioHostSnapshotResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return snapshotFailure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return snapshotFailure("INVALID_TYPE", "$", "Studio host snapshot must be a canonical JSON object");
  const fields = parsed.value;
  const unknown = Object.keys(fields).sort().find((field) => !snapshotFields.has(field));
  if (unknown) return snapshotFailure("UNKNOWN_FIELD", `$.${unknown}`, `unknown Studio host snapshot field: ${unknown}`);
  if (fields.version !== STUDIO_HOST_SNAPSHOT_VERSION) return snapshotFailure("INVALID_VERSION", "$.version", `Studio host snapshot version must be ${STUDIO_HOST_SNAPSHOT_VERSION}`);
  if (typeof fields.revision !== "number" || !Number.isSafeInteger(fields.revision) || fields.revision < 0) return snapshotFailure("INVALID_REVISION", "$.revision", "Studio host snapshot revision must be a non-negative safe integer");
  if (!isJsonObject(fields.state)) return snapshotFailure("INVALID_STATE", "$.state", "Studio host snapshot state must be a canonical JSON object");
  if (!isJsonObject(fields.domain)) return snapshotFailure("INVALID_DOMAIN", "$.domain", "Studio host snapshot domain must be a canonical JSON object");
  return {
    ok: true,
    value: freezeData({
      version: STUDIO_HOST_SNAPSHOT_VERSION,
      revision: fields.revision,
      state: fields.state,
      domain: fields.domain,
    }),
  };
}

export function createStudioHostActionResult(input: unknown): StudioHostActionResultValidationResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return actionFailure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return actionFailure("INVALID_TYPE", "$", "Studio host action result must be a canonical JSON object");
  const fields = parsed.value;
  const unknown = Object.keys(fields).sort().find((field) => !actionResultFields.has(field));
  if (unknown) return actionFailure("UNKNOWN_FIELD", `$.${unknown}`, `unknown Studio host action result field: ${unknown}`);
  if (typeof fields.outcome !== "string" || !actionOutcomes.has(fields.outcome as StudioHostActionOutcome)) return actionFailure("INVALID_OUTCOME", "$.outcome", "Studio host action outcome must be success, empty, or error");

  const snapshot = fields.snapshot === undefined ? undefined : createStudioHostSnapshot(fields.snapshot);
  if (snapshot !== undefined && !snapshot.ok) return actionFailure("INVALID_SNAPSHOT", nestedPath("$.snapshot", snapshot.issue.path), snapshot.issue.message);

  return {
    ok: true,
    value: freezeData({
      outcome: fields.outcome as StudioHostActionOutcome,
      ...(snapshot === undefined ? {} : { snapshot: snapshot.value }),
    }),
  };
}

function ownDataValue(input: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

export function createStudioHostBridge(input: unknown): StudioHostBridgeResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return bridgeFailure("INVALID_TYPE", "$", "Studio host bridge must be a plain object");
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return bridgeFailure("INVALID_TYPE", "$", "Studio host bridge must be a plain object");
  if (Object.getOwnPropertySymbols(input).length > 0 || Object.getOwnPropertyNames(input).length !== Object.keys(input).length) {
    return bridgeFailure("INVALID_BRIDGE", "$", "Studio host bridge must use enumerable string data properties only");
  }
  const unknown = Object.keys(input).sort().find((field) => !bridgeFields.has(field));
  if (unknown) return bridgeFailure("UNKNOWN_FIELD", `$.${unknown}`, `unknown Studio host bridge field: ${unknown}`);

  const version = ownDataValue(input, "version");
  const id = ownDataValue(input, "id");
  const snapshot = ownDataValue(input, "snapshot");
  const dispatch = ownDataValue(input, "dispatch");
  const subscribe = ownDataValue(input, "subscribe");
  if (version !== STUDIO_HOST_BRIDGE_VERSION) return bridgeFailure("INVALID_VERSION", "$.version", `Studio host bridge version must be ${STUDIO_HOST_BRIDGE_VERSION}`);
  if (typeof id !== "string" || !isSemanticNamespace(id)) return bridgeFailure("INVALID_ID", "$.id", "Studio host bridge id must be a semantic namespace");
  if (typeof snapshot !== "function") return bridgeFailure("INVALID_BRIDGE", "$.snapshot", "Studio host bridge snapshot must be a function");
  if (typeof dispatch !== "function") return bridgeFailure("INVALID_BRIDGE", "$.dispatch", "Studio host bridge dispatch must be a function");
  if (typeof subscribe !== "function") return bridgeFailure("INVALID_BRIDGE", "$.subscribe", "Studio host bridge subscribe must be a function");

  return {
    ok: true,
    value: Object.freeze({
      version: STUDIO_HOST_BRIDGE_VERSION,
      id,
      snapshot,
      dispatch,
      subscribe,
    } as StudioHostBridge),
  };
}
