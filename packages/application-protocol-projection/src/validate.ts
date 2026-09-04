import {
  parseViraApplicationDistributionEnvelope,
  serializeViraApplicationDistributionEnvelope,
} from "@vira-enterprise-genui/application-distribution";
import { parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import {
  VIRA_APPLICATION_PROTOCOL_PROJECTION_MAX_LOSSES,
  VIRA_APPLICATION_PROTOCOL_PROJECTION_PATH_MAX_LENGTH,
  VIRA_APPLICATION_PROTOCOL_PROJECTION_REASON_MAX_LENGTH,
  VIRA_APPLICATION_PROTOCOL_PROJECTION_SCHEMA_VERSION,
} from "./types.js";
import type {
  ViraApplicationProtocolProjectionArtifact,
  ViraApplicationProtocolProjectionIssue,
  ViraApplicationProtocolProjectionLoss,
  ViraApplicationProtocolProjectionParseResult,
  ViraApplicationProtocolProjectionRef,
  ViraApplicationProtocolProjectionResult,
  ViraApplicationProtocolProjectionSerializationResult,
  ViraApplicationProtocolProjectionValidationCode,
} from "./types.js";

const ROOT_FIELDS = new Set(["schemaVersion", "source", "projectionRef", "result"]);
const REF_FIELDS = new Set(["id", "versionRef"]);
const LOSSLESS_FIELDS = new Set(["fidelity", "payload"]);
const LOSSY_FIELDS = new Set(["fidelity", "payload", "losses"]);
const UNSUPPORTED_FIELDS = new Set(["fidelity", "reason"]);
const LOSS_FIELDS = new Set(["path", "reason"]);
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

type Failure = { readonly ok: false; readonly issue: ViraApplicationProtocolProjectionIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function failure(
  code: ViraApplicationProtocolProjectionValidationCode,
  path: string,
  message: string,
  distributionCode?: ViraApplicationProtocolProjectionIssue["distributionCode"],
): Failure {
  return {
    ok: false,
    issue: distributionCode === undefined
      ? { code, path, message }
      : { code, path, message, distributionCode },
  };
}

function asObject(value: JsonValue | undefined): JsonObject | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function firstUnknownField(object: JsonObject, allowed: ReadonlySet<string>): string | null {
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) return key;
  }
  return null;
}

function safeText(value: JsonValue | undefined, maxLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && value.trim().length > 0
    && !CONTROL_CHARS.test(value);
}

function projectionKey(ref: ViraApplicationProtocolProjectionRef): string {
  return `${ref.id}\u0000${ref.versionRef}`;
}

function parseProjectionRef(
  value: JsonValue | undefined,
  source: ViraApplicationProtocolProjectionArtifact["source"],
): Parsed<ViraApplicationProtocolProjectionRef> {
  const object = asObject(value);
  if (!object) return failure("INVALID_PROJECTION_REF", "$.projectionRef", "projectionRef must be an exact object");

  const unknown = firstUnknownField(object, REF_FIELDS);
  if (unknown) return failure("UNKNOWN_FIELD", `$.projectionRef.${unknown}`, "unknown projectionRef field");
  if (typeof object.id !== "string" || typeof object.versionRef !== "string") {
    return failure("INVALID_PROJECTION_REF", "$.projectionRef", "projectionRef requires string id and versionRef");
  }

  const requestedKey = `${object.id}\u0000${object.versionRef}`;
  const canonical = source.application.protocolProjections.find((ref) => projectionKey(ref) === requestedKey);
  if (!canonical) {
    return failure(
      "UNDECLARED_PROJECTION",
      "$.projectionRef",
      "projectionRef must exactly match one protocol projection declared by the source Application",
    );
  }
  return { ok: true, value: canonical };
}

function freezeJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeJson(item);
    return Object.freeze(value);
  }
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (item !== undefined) freezeJson(item);
  }
  return Object.freeze(value);
}

function parseLosses(value: JsonValue | undefined): Parsed<readonly ViraApplicationProtocolProjectionLoss[]> {
  if (!Array.isArray(value)) return failure("INVALID_LOSSES", "$.result.losses", "losses must be an array");
  if (value.length === 0) return failure("INVALID_LOSSES", "$.result.losses", "lossy projection requires at least one explicit semantic loss");
  if (value.length > VIRA_APPLICATION_PROTOCOL_PROJECTION_MAX_LOSSES) {
    return failure(
      "LOSS_LIMIT_EXCEEDED",
      "$.result.losses",
      `losses must contain at most ${VIRA_APPLICATION_PROTOCOL_PROJECTION_MAX_LOSSES} entries`,
    );
  }

  const losses: ViraApplicationProtocolProjectionLoss[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const object = asObject(value[index]);
    if (!object) return failure("INVALID_LOSSES", `$.result.losses[${index}]`, "loss entry must be an exact object");
    const unknown = firstUnknownField(object, LOSS_FIELDS);
    if (unknown) return failure("UNKNOWN_FIELD", `$.result.losses[${index}].${unknown}`, "unknown loss field");

    if (!safeText(object.path, VIRA_APPLICATION_PROTOCOL_PROJECTION_PATH_MAX_LENGTH) || !object.path.startsWith("$.application")) {
      return failure(
        "INVALID_LOSS_PATH",
        `$.result.losses[${index}].path`,
        "loss path must be a bounded canonical Application path beginning with $.application",
      );
    }
    if (!safeText(object.reason, VIRA_APPLICATION_PROTOCOL_PROJECTION_REASON_MAX_LENGTH)) {
      return failure("INVALID_REASON", `$.result.losses[${index}].reason`, "loss reason must be non-empty bounded safe text");
    }
    if (seen.has(object.path)) {
      return failure("DUPLICATE_LOSS", `$.result.losses[${index}].path`, "duplicate semantic loss path");
    }
    seen.add(object.path);
    losses.push(Object.freeze({ path: object.path, reason: object.reason }));
  }

  losses.sort((left, right) => left.path.localeCompare(right.path) || left.reason.localeCompare(right.reason));
  return { ok: true, value: Object.freeze(losses) };
}

function parseResult(value: JsonValue | undefined): Parsed<ViraApplicationProtocolProjectionResult> {
  const object = asObject(value);
  if (!object) return failure("INVALID_RESULT", "$.result", "result must be an exact fidelity result object");
  if (typeof object.fidelity !== "string") return failure("INVALID_FIDELITY", "$.result.fidelity", "fidelity is required");

  if (object.fidelity === "lossless") {
    const unknown = firstUnknownField(object, LOSSLESS_FIELDS);
    if (unknown) return failure("UNKNOWN_FIELD", `$.result.${unknown}`, "unknown lossless result field");
    if (!("payload" in object)) return failure("INVALID_PAYLOAD", "$.result.payload", "lossless projection requires payload");
    return {
      ok: true,
      value: Object.freeze({ fidelity: "lossless", payload: freezeJson(object.payload as JsonValue) }),
    };
  }

  if (object.fidelity === "lossy") {
    const unknown = firstUnknownField(object, LOSSY_FIELDS);
    if (unknown) return failure("UNKNOWN_FIELD", `$.result.${unknown}`, "unknown lossy result field");
    if (!("payload" in object)) return failure("INVALID_PAYLOAD", "$.result.payload", "lossy projection requires payload");
    const losses = parseLosses(object.losses);
    if (!losses.ok) return losses;
    return {
      ok: true,
      value: Object.freeze({
        fidelity: "lossy",
        payload: freezeJson(object.payload as JsonValue),
        losses: losses.value,
      }),
    };
  }

  if (object.fidelity === "unsupported") {
    const unknown = firstUnknownField(object, UNSUPPORTED_FIELDS);
    if (unknown) return failure("UNKNOWN_FIELD", `$.result.${unknown}`, "unknown unsupported result field");
    if (!safeText(object.reason, VIRA_APPLICATION_PROTOCOL_PROJECTION_REASON_MAX_LENGTH)) {
      return failure("INVALID_REASON", "$.result.reason", "unsupported projection requires non-empty bounded safe reason text");
    }
    return { ok: true, value: Object.freeze({ fidelity: "unsupported", reason: object.reason }) };
  }

  return failure("INVALID_FIDELITY", "$.result.fidelity", "fidelity must be lossless, lossy, or unsupported");
}

function canonicalJson(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value) as string;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`);
  return `{${entries.join(",")}}`;
}

function serializeResult(result: ViraApplicationProtocolProjectionResult): string {
  if (result.fidelity === "lossless") {
    return `{"fidelity":"lossless","payload":${canonicalJson(result.payload)}}`;
  }
  if (result.fidelity === "lossy") {
    const losses = result.losses
      .map((loss) => `{"path":${JSON.stringify(loss.path)},"reason":${JSON.stringify(loss.reason)}}`)
      .join(",");
    return `{"fidelity":"lossy","payload":${canonicalJson(result.payload)},"losses":[${losses}]}`;
  }
  return `{"fidelity":"unsupported","reason":${JSON.stringify(result.reason)}}`;
}

export function parseViraApplicationProtocolProjection(input: unknown): ViraApplicationProtocolProjectionParseResult {
  const json = parseJsonValue(input);
  if (!json.ok) return failure("INVALID_INPUT", json.issue.path, json.issue.reason);
  const object = asObject(json.value);
  if (!object) return failure("INVALID_INPUT", "$", "protocol projection artifact must be an exact object");

  const unknown = firstUnknownField(object, ROOT_FIELDS);
  if (unknown) return failure("UNKNOWN_FIELD", `$.${unknown}`, "unknown protocol projection artifact field");
  if (object.schemaVersion !== VIRA_APPLICATION_PROTOCOL_PROJECTION_SCHEMA_VERSION) {
    return failure(
      "INVALID_SCHEMA_VERSION",
      "$.schemaVersion",
      `schemaVersion must be ${VIRA_APPLICATION_PROTOCOL_PROJECTION_SCHEMA_VERSION}`,
    );
  }

  const source = parseViraApplicationDistributionEnvelope(object.source);
  if (!source.ok) {
    return failure(
      "INVALID_SOURCE",
      source.issue.path === "$" ? "$.source" : `$.source${source.issue.path.slice(1)}`,
      source.issue.message,
      source.issue.code,
    );
  }
  const projectionRef = parseProjectionRef(object.projectionRef, source.value);
  if (!projectionRef.ok) return projectionRef;
  const result = parseResult(object.result);
  if (!result.ok) return result;

  const artifact: ViraApplicationProtocolProjectionArtifact = Object.freeze({
    schemaVersion: VIRA_APPLICATION_PROTOCOL_PROJECTION_SCHEMA_VERSION,
    source: source.value,
    projectionRef: projectionRef.value,
    result: result.value,
  });
  return { ok: true, value: artifact };
}

export function serializeViraApplicationProtocolProjection(input: unknown): ViraApplicationProtocolProjectionSerializationResult {
  const parsed = parseViraApplicationProtocolProjection(input);
  if (!parsed.ok) return parsed;
  const source = serializeViraApplicationDistributionEnvelope(parsed.value.source);
  if (!source.ok) {
    return failure(
      "INVALID_SOURCE",
      source.issue.path === "$" ? "$.source" : `$.source${source.issue.path.slice(1)}`,
      source.issue.message,
      source.issue.code,
    );
  }

  const projectionRef = `{"id":${JSON.stringify(parsed.value.projectionRef.id)},"versionRef":${JSON.stringify(parsed.value.projectionRef.versionRef)}}`;
  return {
    ok: true,
    value: `{"schemaVersion":"${VIRA_APPLICATION_PROTOCOL_PROJECTION_SCHEMA_VERSION}","source":${source.value},"projectionRef":${projectionRef},"result":${serializeResult(parsed.value.result)}}`,
    artifact: parsed.value,
  };
}
