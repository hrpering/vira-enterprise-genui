import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import { parseRuntimeSessionState } from "./state.js";
import {
  RUNTIME_SESSION_EVENT_TYPES,
  RUNTIME_SESSION_EVENT_VERSION,
  RUNTIME_SESSION_STATE_VERSION,
  type RuntimeSessionEvent,
  type RuntimeSessionEventType,
  type RuntimeSessionState,
  type RuntimeSessionTransitionResult,
} from "./types.js";

const eventFields = new Set(["version", "type"]);
const eventTypes = new Set<RuntimeSessionEventType>(RUNTIME_SESSION_EVENT_TYPES);

function failure(
  code: "INVALID_SESSION_STATE" | "INVALID_EVENT" | "REVISION_OVERFLOW",
  path: string,
  message: string,
): RuntimeSessionTransitionResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseEvent(input: unknown): RuntimeSessionEvent | undefined {
  let parsed: ReturnType<typeof parseJsonValue>;
  try {
    parsed = parseJsonValue(input);
  } catch {
    return undefined;
  }
  if (!parsed.ok || !isJsonObject(parsed.value)) return undefined;
  const fields = parsed.value;
  if (Object.keys(fields).some((key) => !eventFields.has(key))) return undefined;
  if (fields.version !== RUNTIME_SESSION_EVENT_VERSION) return undefined;
  if (typeof fields.type !== "string" || !eventTypes.has(fields.type as RuntimeSessionEventType)) return undefined;
  return Object.freeze({
    version: RUNTIME_SESSION_EVENT_VERSION,
    type: fields.type as RuntimeSessionEventType,
  });
}

function nextState(
  state: RuntimeSessionState,
  event: RuntimeSessionEvent,
): RuntimeSessionState | undefined {
  switch (event.type) {
    case "background":
      if (state.visibility === "background") return undefined;
      return Object.freeze({ ...state, revision: state.revision + 1, visibility: "background" });
    case "foreground":
    case "resume":
      if (state.visibility === "foreground") return undefined;
      return Object.freeze({ ...state, revision: state.revision + 1, visibility: "foreground" });
    case "disconnect":
      if (state.connectivity === "disconnected") return undefined;
      return Object.freeze({ ...state, revision: state.revision + 1, connectivity: "disconnected" });
    case "reconnect":
      if (state.connectivity === "connected") return undefined;
      return Object.freeze({ ...state, revision: state.revision + 1, connectivity: "connected" });
  }
}

export function transitionRuntimeSession(
  stateInput: unknown,
  eventInput: unknown,
): RuntimeSessionTransitionResult {
  const state = parseRuntimeSessionState(stateInput);
  if (!state.ok) {
    return failure("INVALID_SESSION_STATE", "$", "runtime session state is invalid");
  }
  const event = parseEvent(eventInput);
  if (!event) {
    return failure("INVALID_EVENT", "$.event", "runtime session event is invalid");
  }

  const changesVisibility = (event.type === "background" && state.value.visibility !== "background")
    || ((event.type === "foreground" || event.type === "resume") && state.value.visibility !== "foreground");
  const changesConnectivity = (event.type === "disconnect" && state.value.connectivity !== "disconnected")
    || (event.type === "reconnect" && state.value.connectivity !== "connected");
  if (!changesVisibility && !changesConnectivity) {
    return {
      ok: true,
      value: Object.freeze({ state: state.value, changed: false }),
    };
  }
  if (state.value.revision === Number.MAX_SAFE_INTEGER) {
    return failure("REVISION_OVERFLOW", "$.revision", "runtime session revision cannot be incremented safely");
  }

  const stateAfter = nextState(state.value, event);
  if (!stateAfter) {
    return {
      ok: true,
      value: Object.freeze({ state: state.value, changed: false }),
    };
  }
  const canonical: RuntimeSessionState = Object.freeze({
    version: RUNTIME_SESSION_STATE_VERSION,
    instanceId: stateAfter.instanceId,
    revision: stateAfter.revision,
    visibility: stateAfter.visibility,
    connectivity: stateAfter.connectivity,
    continuity: stateAfter.continuity,
    cacheStatus: stateAfter.cacheStatus,
  });
  return {
    ok: true,
    value: Object.freeze({ state: canonical, changed: true }),
  };
}
