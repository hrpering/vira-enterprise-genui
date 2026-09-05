import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import { parseViraApplicationExactReference } from "./reference.js";
import {
  VIRA_APPLICATION_PACKAGE_MAX_ACTIONS,
  VIRA_APPLICATION_PACKAGE_MAX_REFERENCES,
  type ViraApplicationExactReference,
} from "./types.js";
import { parseViraApplicationPackage } from "./validate.js";
import {
  VIRA_APPLICATION_PACKAGE_V2_SCHEMA_VERSION,
  VIRA_APPLICATION_TRIGGER_TYPES,
  type ViraApplicationCommercialMetadataV2,
  type ViraApplicationPackageV2,
  type ViraApplicationPackageV2Result,
  type ViraApplicationPackageV2SerializationResult,
  type ViraApplicationPackageV2ValidationCode,
  type ViraApplicationPackageV2ValidationIssue,
  type ViraApplicationTriggerDeclaration,
  type ViraApplicationTriggerType,
} from "./v2-types.js";

type Failure = { readonly ok: false; readonly issue: ViraApplicationPackageV2ValidationIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function fail(code: ViraApplicationPackageV2ValidationCode, path: string, message: string): Failure {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function shape(value: JsonObject, allowed: readonly string[], required = allowed): string | undefined {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).sort().find((key) => !allowedKeys.has(key))
    ?? required.find((key) => !Object.hasOwn(value, key));
}

function nestedPath(base: string, child: string): string {
  return child === "$" ? base : `${base}${child.slice(1)}`;
}

function parseExactReference(value: JsonValue | undefined, path: string): Parsed<ViraApplicationExactReference> {
  const parsed = parseViraApplicationExactReference(value);
  if (parsed.ok) return parsed;
  return fail(parsed.issue.code, nestedPath(path, parsed.issue.path), parsed.issue.message);
}

function parseReferenceArray(
  value: JsonValue | undefined,
  path: string,
): Parsed<readonly ViraApplicationExactReference[]> {
  if (!Array.isArray(value)) return fail("INVALID_REFERENCE", path, "references must be an array");
  if (value.length > VIRA_APPLICATION_PACKAGE_MAX_REFERENCES) {
    return fail("REFERENCE_LIMIT_EXCEEDED", path, `reference limit is ${VIRA_APPLICATION_PACKAGE_MAX_REFERENCES}`);
  }
  const output: ViraApplicationExactReference[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const parsed = parseExactReference(value[index] as JsonValue, `${path}[${index}]`);
    if (!parsed.ok) return parsed;
    const key = `${parsed.value.id}\u0000${parsed.value.versionRef}`;
    if (seen.has(key)) return fail("DUPLICATE_REFERENCE", `${path}[${index}]`, "duplicate exact reference");
    seen.add(key);
    output.push(parsed.value);
  }
  return { ok: true, value: Object.freeze(output) };
}

function parseActions(value: JsonValue | undefined): Parsed<readonly ViraApplicationExactReference[]> {
  if (!Array.isArray(value)) return fail("INVALID_ACTION", "$.actions", "actions must be an array");
  if (value.length > VIRA_APPLICATION_PACKAGE_MAX_ACTIONS) {
    return fail("ACTION_LIMIT_EXCEEDED", "$.actions", `action reference limit is ${VIRA_APPLICATION_PACKAGE_MAX_ACTIONS}`);
  }
  const output: ViraApplicationExactReference[] = [];
  const seenIds = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const parsed = parseExactReference(value[index] as JsonValue, `$.actions[${index}]`);
    if (!parsed.ok) {
      return fail(
        parsed.issue.code === "FLOATING_REFERENCE" ? "FLOATING_REFERENCE" : "INVALID_ACTION",
        parsed.issue.path,
        parsed.issue.message,
      );
    }
    if (seenIds.has(parsed.value.id)) {
      return fail("DUPLICATE_ACTION", `$.actions[${index}].id`, "Application V2 may bind only one exact version per Action id");
    }
    seenIds.add(parsed.value.id);
    output.push(parsed.value);
  }
  return { ok: true, value: Object.freeze(output) };
}

function parseCommercial(value: JsonValue | undefined): Parsed<ViraApplicationCommercialMetadataV2> {
  if (!object(value)) return fail("INVALID_COMMERCIAL", "$.commercial", "commercial must be an exact metadata object");
  const unexpected = shape(value, ["entitlementRefs", "meteringRefs", "pricingRefs", "settlementRefs"]);
  if (unexpected) return fail("INVALID_COMMERCIAL", `$.commercial.${unexpected}`, "commercial shape is invalid");

  const entitlementRefs = parseReferenceArray(value.entitlementRefs, "$.commercial.entitlementRefs");
  if (!entitlementRefs.ok) return entitlementRefs;
  const meteringRefs = parseReferenceArray(value.meteringRefs, "$.commercial.meteringRefs");
  if (!meteringRefs.ok) return meteringRefs;
  const pricingRefs = parseReferenceArray(value.pricingRefs, "$.commercial.pricingRefs");
  if (!pricingRefs.ok) return pricingRefs;
  const settlementRefs = parseReferenceArray(value.settlementRefs, "$.commercial.settlementRefs");
  if (!settlementRefs.ok) return settlementRefs;

  return {
    ok: true,
    value: Object.freeze({
      entitlementRefs: entitlementRefs.value,
      meteringRefs: meteringRefs.value,
      pricingRefs: pricingRefs.value,
      settlementRefs: settlementRefs.value,
    }),
  };
}

function parseTriggers(
  value: JsonValue | undefined,
  flows: readonly ViraApplicationExactReference[],
): Parsed<readonly ViraApplicationTriggerDeclaration[]> {
  if (!Array.isArray(value)) return fail("INVALID_TRIGGER", "$.triggers", "triggers must be an array");
  if (value.length > VIRA_APPLICATION_PACKAGE_MAX_REFERENCES) {
    return fail("REFERENCE_LIMIT_EXCEEDED", "$.triggers", `trigger limit is ${VIRA_APPLICATION_PACKAGE_MAX_REFERENCES}`);
  }
  const flowKeys = new Set(flows.map((ref) => `${ref.id}\u0000${ref.versionRef}`));
  const output: ViraApplicationTriggerDeclaration[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const path = `$.triggers[${index}]`;
    const item = value[index] as JsonValue;
    if (!object(item)) return fail("INVALID_TRIGGER", path, "trigger must be an exact object");
    const unexpected = shape(item, ["type", "entrypointRef"]);
    if (unexpected) return fail("INVALID_TRIGGER", `${path}.${unexpected}`, "trigger shape is invalid");
    if (
      typeof item.type !== "string"
      || !VIRA_APPLICATION_TRIGGER_TYPES.includes(item.type as ViraApplicationTriggerType)
    ) {
      return fail("INVALID_TRIGGER", `${path}.type`, "trigger type must be api, webhook, schedule or application-call");
    }
    const entrypointRef = parseExactReference(item.entrypointRef, `${path}.entrypointRef`);
    if (!entrypointRef.ok) return entrypointRef;
    const entrypointKey = `${entrypointRef.value.id}\u0000${entrypointRef.value.versionRef}`;
    if (!flowKeys.has(entrypointKey)) {
      return fail(
        "TRIGGER_ENTRYPOINT_NOT_FOUND",
        `${path}.entrypointRef`,
        "trigger entrypointRef must exactly reference one declared Application flow",
      );
    }
    const triggerKey = `${item.type}\u0000${entrypointKey}`;
    if (seen.has(triggerKey)) return fail("DUPLICATE_TRIGGER", path, "duplicate portable trigger declaration");
    seen.add(triggerKey);
    output.push(Object.freeze({
      type: item.type as ViraApplicationTriggerType,
      entrypointRef: entrypointRef.value,
    }));
  }
  return { ok: true, value: Object.freeze(output) };
}

export function parseViraApplicationPackageV2(input: unknown): ViraApplicationPackageV2Result {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !object(parsed.value)) {
    return fail(
      "INVALID_TYPE",
      parsed.ok ? "$" : parsed.issue.path,
      parsed.ok ? "Application V2 must be a plain object" : parsed.issue.reason,
    );
  }

  const root = parsed.value;
  const fields = [
    "schemaVersion",
    "identity",
    "version",
    "publisher",
    "experiences",
    "capabilities",
    "contextTypes",
    "actions",
    "flows",
    "brandRef",
    "governanceRequirements",
    "hostCompatibility",
    "protocolProjections",
    "triggers",
    "distribution",
    "commercial",
  ] as const;
  const unexpected = shape(root, fields);
  if (unexpected) return fail("UNKNOWN_FIELD", `$.${unexpected}`, `unknown or missing Application V2 field: ${unexpected}`);
  if (root.schemaVersion !== VIRA_APPLICATION_PACKAGE_V2_SCHEMA_VERSION) {
    return fail(
      "INVALID_SCHEMA_VERSION",
      "$.schemaVersion",
      `schemaVersion must equal ${VIRA_APPLICATION_PACKAGE_V2_SCHEMA_VERSION}`,
    );
  }

  const actions = parseActions(root.actions);
  if (!actions.ok) return actions;
  const commercial = parseCommercial(root.commercial);
  if (!commercial.ok) return commercial;

  const legacyShape = {
    schemaVersion: "1",
    identity: root.identity,
    version: root.version,
    publisher: root.publisher,
    experiences: root.experiences,
    capabilities: root.capabilities,
    contextTypes: root.contextTypes,
    actions: actions.value.map((ref) => ({ actionType: ref.id })),
    flows: root.flows,
    brandRef: root.brandRef,
    governanceRequirements: root.governanceRequirements,
    hostCompatibility: root.hostCompatibility,
    protocolProjections: root.protocolProjections,
    distribution: root.distribution,
    commercial: {
      entitlementRefs: commercial.value.entitlementRefs,
      meteringRefs: commercial.value.meteringRefs,
    },
  };
  const shared = parseViraApplicationPackage(legacyShape);
  if (!shared.ok) return fail(shared.issue.code, shared.issue.path, shared.issue.message);

  const triggers = parseTriggers(root.triggers, shared.value.flows);
  if (!triggers.ok) return triggers;

  const value: ViraApplicationPackageV2 = Object.freeze({
    schemaVersion: VIRA_APPLICATION_PACKAGE_V2_SCHEMA_VERSION,
    identity: shared.value.identity,
    version: shared.value.version,
    publisher: shared.value.publisher,
    experiences: shared.value.experiences,
    capabilities: shared.value.capabilities,
    contextTypes: shared.value.contextTypes,
    actions: actions.value,
    flows: shared.value.flows,
    brandRef: shared.value.brandRef,
    governanceRequirements: shared.value.governanceRequirements,
    hostCompatibility: shared.value.hostCompatibility,
    protocolProjections: shared.value.protocolProjections,
    triggers: triggers.value,
    distribution: shared.value.distribution,
    commercial: commercial.value,
  });
  return { ok: true, value };
}

export function serializeViraApplicationPackageV2(input: unknown): ViraApplicationPackageV2SerializationResult {
  const parsed = parseViraApplicationPackageV2(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), package: parsed.value };
}
