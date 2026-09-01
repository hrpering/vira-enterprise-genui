import { parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";

export const VIRA_EXPERIENCE_MESSAGE_VERSION = "1" as const;
export const VIRA_EXPERIENCE_MESSAGE_MAX_STRING_LENGTH = 4_096 as const;

export interface ViraExperiencePackIdentity {
  readonly id: string;
  readonly version: string;
  readonly entrypoint: string;
}

export interface ViraExperiencePresentMessage {
  readonly version: typeof VIRA_EXPERIENCE_MESSAGE_VERSION;
  readonly op: "present";
  readonly instanceId: string;
  readonly pack: ViraExperiencePackIdentity;
  readonly payload: JsonObject;
}

export interface ViraExperienceCommandMessage {
  readonly version: typeof VIRA_EXPERIENCE_MESSAGE_VERSION;
  readonly op: "command";
  readonly instanceId: string;
  readonly command: string;
  readonly args: JsonObject;
}

export type ViraExperienceMessage = ViraExperiencePresentMessage | ViraExperienceCommandMessage;

export interface ViraExperienceMessageIssue {
  readonly code: "INVALID_MESSAGE";
  readonly path: string;
  readonly message: string;
}

export type ViraExperienceMessageResult =
  | { readonly ok: true; readonly value: ViraExperienceMessage }
  | { readonly ok: false; readonly issue: ViraExperienceMessageIssue };

function failure(path: string, message: string): ViraExperienceMessageResult {
  return { ok: false, issue: { code: "INVALID_MESSAGE", path, message } };
}

function objectValue(value: JsonValue | undefined): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function exactKeys(value: JsonObject, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (keys.length !== sortedExpected.length) return false;
  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index] !== sortedExpected[index]) return false;
  }
  return true;
}

function boundedString(value: JsonValue | undefined): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= VIRA_EXPERIENCE_MESSAGE_MAX_STRING_LENGTH;
}

function freezeJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) freezeJson(value[index] as JsonValue);
    return Object.freeze(value);
  }
  const object = value as JsonObject;
  for (const key of Object.keys(object)) freezeJson(object[key] as JsonValue);
  return Object.freeze(object);
}

export function parseViraExperienceMessage(input: unknown): ViraExperienceMessageResult {
  const parsed = parseJsonValue(input, "$" );
  if (!parsed.ok) return failure(parsed.issue.path, parsed.issue.reason);
  const root = objectValue(parsed.value);
  if (!root) return failure("$", "Vira experience message must be a JSON object");
  if (root.version !== VIRA_EXPERIENCE_MESSAGE_VERSION) {
    return failure("$.version", `Vira experience message version must equal ${VIRA_EXPERIENCE_MESSAGE_VERSION}`);
  }
  if (!boundedString(root.instanceId)) {
    return failure("$.instanceId", "instanceId must be a bounded non-empty string");
  }

  if (root.op === "present") {
    if (!exactKeys(root, ["version", "op", "instanceId", "pack", "payload"])) {
      return failure("$", "present message contains missing or unsupported fields");
    }
    const pack = objectValue(root.pack);
    if (!pack || !exactKeys(pack, ["id", "version", "entrypoint"])) {
      return failure("$.pack", "pack must contain exactly id, version, and entrypoint");
    }
    if (!boundedString(pack.id) || !boundedString(pack.version) || !boundedString(pack.entrypoint)) {
      return failure("$.pack", "pack identity fields must be bounded non-empty strings");
    }
    const payload = objectValue(root.payload);
    if (!payload) return failure("$.payload", "present payload must be a JSON object");
    return {
      ok: true,
      value: Object.freeze({
        version: VIRA_EXPERIENCE_MESSAGE_VERSION,
        op: "present",
        instanceId: root.instanceId,
        pack: Object.freeze({ id: pack.id, version: pack.version, entrypoint: pack.entrypoint }),
        payload: freezeJson(payload) as JsonObject,
      }),
    };
  }

  if (root.op === "command") {
    if (!exactKeys(root, ["version", "op", "instanceId", "command", "args"])) {
      return failure("$", "command message contains missing or unsupported fields");
    }
    if (!boundedString(root.command)) {
      return failure("$.command", "command must be a bounded non-empty string");
    }
    const args = objectValue(root.args);
    if (!args) return failure("$.args", "command args must be a JSON object");
    return {
      ok: true,
      value: Object.freeze({
        version: VIRA_EXPERIENCE_MESSAGE_VERSION,
        op: "command",
        instanceId: root.instanceId,
        command: root.command,
        args: freezeJson(args) as JsonObject,
      }),
    };
  }

  return failure("$.op", "op must equal present or command");
}
