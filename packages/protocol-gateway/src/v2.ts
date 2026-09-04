import { parseJsonValue, type JsonValue } from "@vira-enterprise-genui/protocol";

export const PROTOCOL_GATEWAY_V2_VERSION = "2" as const;
export const PROTOCOL_GATEWAY_V2_PROTOCOLS = Object.freeze([
  "ag-ui",
  "a2ui",
  "mcp",
  "mcp-apps",
  "vira-native",
  "custom-json",
] as const);

export type ProtocolGatewayV2Protocol = (typeof PROTOCOL_GATEWAY_V2_PROTOCOLS)[number];
export type ProtocolGatewayV2SemanticRole =
  | "transport-state-events"
  | "declarative-ui"
  | "tool-data-action-discovery"
  | "sandboxed-web-compatibility"
  | "native-publication"
  | "custom-json";
export type ProtocolGatewayV2NativeStrategy =
  | "not-applicable"
  | "catalog-required"
  | "never-auto-convert"
  | "native-publication";

export interface ProtocolGatewayV2Input {
  readonly version: typeof PROTOCOL_GATEWAY_V2_VERSION;
  readonly protocol: ProtocolGatewayV2Protocol;
  readonly sourceId: string;
  readonly payload: JsonValue;
}

export interface ProtocolGatewayV2Ingress {
  readonly version: typeof PROTOCOL_GATEWAY_V2_VERSION;
  readonly protocol: ProtocolGatewayV2Protocol;
  readonly sourceId: string;
  readonly semanticRole: ProtocolGatewayV2SemanticRole;
  readonly nativeStrategy: ProtocolGatewayV2NativeStrategy;
  readonly webCompatibilitySurface: boolean;
  readonly payload: JsonValue;
}

export type ProtocolGatewayV2IssueCode =
  | "INVALID_INPUT"
  | "INVALID_PROTOCOL"
  | "INVALID_SOURCE"
  | "INVALID_PAYLOAD";
export interface ProtocolGatewayV2Issue {
  readonly code: ProtocolGatewayV2IssueCode;
  readonly path: string;
  readonly message: string;
}
export type ProtocolGatewayV2Result =
  | { readonly ok: true; readonly value: ProtocolGatewayV2Ingress }
  | { readonly ok: false; readonly issue: ProtocolGatewayV2Issue };

const ARRAY_IS_ARRAY = Array.isArray;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_IS_FROZEN = Object.isFrozen;
const OBJECT_KEYS = Object.keys;
const OBJECT_PROTOTYPE = Object.prototype;
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const SOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

function failure(
  code: ProtocolGatewayV2IssueCode,
  path: string,
  message: string,
): ProtocolGatewayV2Result {
  return { ok: false, issue: OBJECT_FREEZE({ code, path, message }) };
}

function plainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || ARRAY_IS_ARRAY(value)) return false;
  const prototype = OBJECT_GET_PROTOTYPE_OF(value);
  return prototype === OBJECT_PROTOTYPE || prototype === null;
}

function ownData(object: object, key: PropertyKey): PropertyDescriptor | undefined {
  const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(object, key);
  return descriptor && OBJECT_HAS_OWN(descriptor, "value") && descriptor.enumerable === true
    ? descriptor
    : undefined;
}

function freezeJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object" || OBJECT_IS_FROZEN(value)) return value;
  if (ARRAY_IS_ARRAY(value)) {
    for (let index = 0; index < value.length; index += 1) {
      freezeJson(value[index]!);
    }
    return OBJECT_FREEZE(value);
  }
  for (const key of OBJECT_KEYS(value)) {
    freezeJson(value[key]!);
  }
  return OBJECT_FREEZE(value);
}

function inputField(value: PropertyKey): value is "version" | "protocol" | "sourceId" | "payload" {
  return value === "version" || value === "protocol" || value === "sourceId" || value === "payload";
}

function protocol(value: unknown): value is ProtocolGatewayV2Protocol {
  return value === "ag-ui"
    || value === "a2ui"
    || value === "mcp"
    || value === "mcp-apps"
    || value === "vira-native"
    || value === "custom-json";
}

function semantics(value: ProtocolGatewayV2Protocol): Readonly<Pick<
  ProtocolGatewayV2Ingress,
  "semanticRole" | "nativeStrategy" | "webCompatibilitySurface"
>> {
  switch (value) {
    case "ag-ui":
      return OBJECT_FREEZE({
        semanticRole: "transport-state-events",
        nativeStrategy: "not-applicable",
        webCompatibilitySurface: false,
      });
    case "a2ui":
      return OBJECT_FREEZE({
        semanticRole: "declarative-ui",
        nativeStrategy: "catalog-required",
        webCompatibilitySurface: false,
      });
    case "mcp":
      return OBJECT_FREEZE({
        semanticRole: "tool-data-action-discovery",
        nativeStrategy: "not-applicable",
        webCompatibilitySurface: false,
      });
    case "mcp-apps":
      return OBJECT_FREEZE({
        semanticRole: "sandboxed-web-compatibility",
        nativeStrategy: "never-auto-convert",
        webCompatibilitySurface: true,
      });
    case "vira-native":
      return OBJECT_FREEZE({
        semanticRole: "native-publication",
        nativeStrategy: "native-publication",
        webCompatibilitySurface: false,
      });
    case "custom-json":
      return OBJECT_FREEZE({
        semanticRole: "custom-json",
        nativeStrategy: "not-applicable",
        webCompatibilitySurface: false,
      });
  }
}

export function normalizeProtocolGatewayV2Ingress(input: unknown): ProtocolGatewayV2Result {
  try {
    if (!plainObject(input)) {
      return failure("INVALID_INPUT", "$", "protocol gateway v2 input must be a plain own-data object");
    }

    const keys = REFLECT_OWN_KEYS(input);
    if (keys.length !== 4) {
      return failure("INVALID_INPUT", "$", "protocol gateway v2 input requires exactly version, protocol, sourceId and payload");
    }
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== "string" || !inputField(key) || !ownData(input, key)) {
        return failure("INVALID_INPUT", "$", "protocol gateway v2 fields must be exact enumerable own data properties");
      }
    }

    const version = ownData(input, "version")?.value;
    if (version !== PROTOCOL_GATEWAY_V2_VERSION) {
      return failure("INVALID_INPUT", "$.version", "protocol gateway v2 version must equal 2");
    }
    const protocolValue = ownData(input, "protocol")?.value;
    if (!protocol(protocolValue)) {
      return failure("INVALID_PROTOCOL", "$.protocol", "protocol gateway v2 protocol is unsupported");
    }
    const sourceId = ownData(input, "sourceId")?.value;
    if (typeof sourceId !== "string" || !SOURCE_ID.test(sourceId)) {
      return failure("INVALID_SOURCE", "$.sourceId", "protocol gateway v2 sourceId is invalid");
    }
    const payload = ownData(input, "payload")?.value;
    const parsed = parseJsonValue(payload, "$.payload");
    if (!parsed.ok) {
      return failure("INVALID_PAYLOAD", parsed.issue.path, parsed.issue.reason);
    }

    const meta = semantics(protocolValue);
    return {
      ok: true,
      value: OBJECT_FREEZE({
        version: PROTOCOL_GATEWAY_V2_VERSION,
        protocol: protocolValue,
        sourceId,
        semanticRole: meta.semanticRole,
        nativeStrategy: meta.nativeStrategy,
        webCompatibilitySurface: meta.webCompatibilitySurface,
        payload: freezeJson(parsed.value),
      }),
    };
  } catch {
    return failure("INVALID_INPUT", "$", "protocol gateway v2 input could not be inspected safely");
  }
}
