import {
  parseViraApplicationDistributionEnvelopeV2,
  type ViraApplicationDistributionEnvelopeV2,
} from "@vira-enterprise-genui/application-distribution";
import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  parseViraApplicationProtocolProjection,
} from "./validate.js";
import {
  VIRA_APPLICATION_PROTOCOL_PROJECTION_V2_SCHEMA_VERSION,
  type ViraApplicationProtocolProjectionArtifactV2,
  type ViraApplicationProtocolProjectionV2Issue,
  type ViraApplicationProtocolProjectionV2ParseResult,
  type ViraApplicationProtocolProjectionV2SerializationResult,
} from "./v2-types.js";

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function shape(value: JsonObject, allowed: readonly string[], required = allowed): string | undefined {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).sort().find((key) => !allowedKeys.has(key))
    ?? required.find((key) => !Object.hasOwn(value, key));
}

function issue(code: ViraApplicationProtocolProjectionV2Issue["code"], path: string, message: string):
  { readonly ok: false; readonly issue: ViraApplicationProtocolProjectionV2Issue } {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function nestedPath(base: string, child: string): string {
  return child === "$" ? base : `${base}${child.slice(1)}`;
}

function projectApplicationV1(application: ViraApplicationDistributionEnvelopeV2["application"]): unknown {
  return {
    schemaVersion: "1",
    identity: application.identity,
    version: application.version,
    publisher: application.publisher,
    experiences: application.experiences,
    capabilities: application.capabilities,
    contextTypes: application.contextTypes,
    actions: application.actions.map((ref) => ({ actionType: ref.id })),
    flows: application.flows,
    brandRef: application.brandRef,
    governanceRequirements: application.governanceRequirements,
    hostCompatibility: application.hostCompatibility,
    protocolProjections: application.protocolProjections,
    distribution: application.distribution,
    commercial: {
      entitlementRefs: application.commercial.entitlementRefs,
      meteringRefs: application.commercial.meteringRefs,
    },
  };
}

export function parseViraApplicationProtocolProjectionV2(
  input: unknown,
): ViraApplicationProtocolProjectionV2ParseResult {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !object(parsed.value)) {
    return issue(
      "INVALID_INPUT",
      parsed.ok ? "$" : parsed.issue.path,
      parsed.ok ? "Application protocol projection V2 must be an exact object" : parsed.issue.reason,
    );
  }
  const root = parsed.value;
  const unexpected = shape(root, ["schemaVersion", "source", "projectionRef", "result"]);
  if (unexpected) return issue("UNKNOWN_FIELD", `$.${unexpected}`, "projection V2 shape is invalid");
  if (root.schemaVersion !== VIRA_APPLICATION_PROTOCOL_PROJECTION_V2_SCHEMA_VERSION) {
    return issue(
      "INVALID_SCHEMA_VERSION",
      "$.schemaVersion",
      `schemaVersion must be ${VIRA_APPLICATION_PROTOCOL_PROJECTION_V2_SCHEMA_VERSION}`,
    );
  }

  const source = parseViraApplicationDistributionEnvelopeV2(root.source);
  if (!source.ok) {
    return issue("INVALID_SOURCE", nestedPath("$.source", source.issue.path), source.issue.message);
  }

  const shared = parseViraApplicationProtocolProjection({
    schemaVersion: "1",
    source: {
      schemaVersion: "1",
      application: projectApplicationV1(source.value.application),
      integrity: source.value.integrity,
    },
    projectionRef: root.projectionRef,
    result: root.result,
  });
  if (!shared.ok) return issue(shared.issue.code, shared.issue.path, shared.issue.message);

  const value: ViraApplicationProtocolProjectionArtifactV2 = Object.freeze({
    schemaVersion: VIRA_APPLICATION_PROTOCOL_PROJECTION_V2_SCHEMA_VERSION,
    source: source.value,
    projectionRef: shared.value.projectionRef,
    result: shared.value.result,
  });
  return { ok: true, value };
}

export function serializeViraApplicationProtocolProjectionV2(
  input: unknown,
): ViraApplicationProtocolProjectionV2SerializationResult {
  const parsed = parseViraApplicationProtocolProjectionV2(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), artifact: parsed.value };
}
