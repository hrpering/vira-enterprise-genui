import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import { parseViraApplicationExactReference } from "./reference.js";
import { parseViraApplicationPackage } from "./validate.js";
import type {
  ViraApplicationExactReference,
  ViraApplicationPackage,
} from "./types.js";
import {
  parseViraApplicationPackageV2,
} from "./v2-validate.js";
import type {
  ViraApplicationPackageV2,
  ViraApplicationPackageV2ValidationIssue,
} from "./v2-types.js";

export type ViraApplicationV1ToV2MigrationCode =
  | "INVALID_MIGRATION_INPUT"
  | "INVALID_ACTION_MAPPING"
  | "MISSING_ACTION_MAPPING"
  | "AMBIGUOUS_ACTION_MAPPING"
  | "UNUSED_ACTION_MAPPING"
  | "INVALID_V1_APPLICATION"
  | "INVALID_V2_APPLICATION";

export interface ViraApplicationV1ToV2MigrationIssue {
  readonly code: ViraApplicationV1ToV2MigrationCode;
  readonly path: string;
  readonly message: string;
  readonly sourceIssue?: ViraApplicationPackageV2ValidationIssue;
}

export interface ViraApplicationV1ActionMapping {
  readonly actionType: string;
  readonly actionRef: ViraApplicationExactReference;
}

export interface ViraApplicationV1ToV2MigrationDeclaration {
  readonly actionMappings: readonly ViraApplicationV1ActionMapping[];
  readonly triggers: readonly unknown[];
  readonly pricingRefs: readonly unknown[];
  readonly settlementRefs: readonly unknown[];
}

export type ViraApplicationV1ToV2MigrationResult =
  | { readonly ok: true; readonly value: ViraApplicationPackageV2 }
  | { readonly ok: false; readonly issue: ViraApplicationV1ToV2MigrationIssue };

type Failure = { readonly ok: false; readonly issue: ViraApplicationV1ToV2MigrationIssue };

function fail(
  code: ViraApplicationV1ToV2MigrationCode,
  path: string,
  message: string,
  sourceIssue?: ViraApplicationPackageV2ValidationIssue,
): Failure {
  return {
    ok: false,
    issue: Object.freeze({
      code,
      path,
      message,
      ...(sourceIssue === undefined ? {} : { sourceIssue }),
    }),
  };
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function shape(value: JsonObject, allowed: readonly string[], required = allowed): string | undefined {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).sort().find((key) => !allowedKeys.has(key))
    ?? required.find((key) => !Object.hasOwn(value, key));
}

function parseMappingDeclaration(input: unknown):
  | { readonly ok: true; readonly value: ViraApplicationV1ToV2MigrationDeclaration }
  | Failure {
  const parsed = parseJsonValue(input, "$migration");
  if (!parsed.ok || !object(parsed.value)) {
    return fail(
      "INVALID_MIGRATION_INPUT",
      parsed.ok ? "$migration" : parsed.issue.path,
      parsed.ok ? "migration declaration must be a plain exact object" : parsed.issue.reason,
    );
  }
  const root = parsed.value;
  const unexpected = shape(root, ["actionMappings", "triggers", "pricingRefs", "settlementRefs"]);
  if (unexpected) {
    return fail(
      "INVALID_MIGRATION_INPUT",
      `$migration.${unexpected}`,
      "migration declaration requires actionMappings, triggers, pricingRefs and settlementRefs only",
    );
  }
  if (
    !Array.isArray(root.actionMappings)
    || !Array.isArray(root.triggers)
    || !Array.isArray(root.pricingRefs)
    || !Array.isArray(root.settlementRefs)
  ) {
    return fail("INVALID_MIGRATION_INPUT", "$migration", "all migration declaration fields must be arrays");
  }

  const mappings: ViraApplicationV1ActionMapping[] = [];
  for (let index = 0; index < root.actionMappings.length; index += 1) {
    const path = `$migration.actionMappings[${index}]`;
    const item = root.actionMappings[index] as JsonValue;
    if (!object(item)) return fail("INVALID_ACTION_MAPPING", path, "action mapping must be an exact object");
    const mappingUnexpected = shape(item, ["actionType", "actionRef"]);
    if (mappingUnexpected) {
      return fail("INVALID_ACTION_MAPPING", `${path}.${mappingUnexpected}`, "action mapping shape is invalid");
    }
    if (typeof item.actionType !== "string" || !isSemanticNamespace(item.actionType)) {
      return fail("INVALID_ACTION_MAPPING", `${path}.actionType`, "actionType must be a canonical semantic namespace");
    }
    const actionRef = parseViraApplicationExactReference(item.actionRef);
    if (!actionRef.ok) {
      const suffix = actionRef.issue.path === "$" ? "" : actionRef.issue.path.slice(1);
      return fail("INVALID_ACTION_MAPPING", `${path}.actionRef${suffix}`, actionRef.issue.message);
    }
    if (actionRef.value.id !== item.actionType) {
      return fail(
        "INVALID_ACTION_MAPPING",
        `${path}.actionRef.id`,
        "actionRef.id must exactly preserve the legacy actionType identity",
      );
    }
    mappings.push(Object.freeze({ actionType: item.actionType, actionRef: actionRef.value }));
  }

  return {
    ok: true,
    value: Object.freeze({
      actionMappings: Object.freeze(mappings),
      triggers: Object.freeze([...root.triggers]),
      pricingRefs: Object.freeze([...root.pricingRefs]),
      settlementRefs: Object.freeze([...root.settlementRefs]),
    }),
  };
}

function resolveActionMappings(
  application: ViraApplicationPackage,
  mappings: readonly ViraApplicationV1ActionMapping[],
):
  | { readonly ok: true; readonly value: readonly ViraApplicationExactReference[] }
  | Failure {
  const byAction = new Map<string, ViraApplicationExactReference>();
  for (let index = 0; index < mappings.length; index += 1) {
    const mapping = mappings[index]!;
    if (byAction.has(mapping.actionType)) {
      return fail(
        "AMBIGUOUS_ACTION_MAPPING",
        `$migration.actionMappings[${index}].actionType`,
        "legacy actionType must map to exactly one Action version",
      );
    }
    byAction.set(mapping.actionType, mapping.actionRef);
  }

  const declared = new Set(application.actions.map((action) => action.actionType));
  for (let index = 0; index < mappings.length; index += 1) {
    const mapping = mappings[index]!;
    if (!declared.has(mapping.actionType)) {
      return fail(
        "UNUSED_ACTION_MAPPING",
        `$migration.actionMappings[${index}].actionType`,
        "migration declaration contains a mapping for an Action absent from the V1 Application",
      );
    }
  }

  const output: ViraApplicationExactReference[] = [];
  for (let index = 0; index < application.actions.length; index += 1) {
    const action = application.actions[index]!;
    const mapped = byAction.get(action.actionType);
    if (!mapped) {
      return fail(
        "MISSING_ACTION_MAPPING",
        `$.actions[${index}].actionType`,
        "every legacy actionType requires one explicit exact Action mapping",
      );
    }
    output.push(mapped);
  }
  return { ok: true, value: Object.freeze(output) };
}

export function migrateViraApplicationPackageV1ToV2(
  input: unknown,
  migration: unknown,
): ViraApplicationV1ToV2MigrationResult {
  const source = parseViraApplicationPackage(input);
  if (!source.ok) {
    return fail(
      "INVALID_V1_APPLICATION",
      source.issue.path,
      source.issue.message,
    );
  }
  const declaration = parseMappingDeclaration(migration);
  if (!declaration.ok) return declaration;

  const actions = resolveActionMappings(source.value, declaration.value.actionMappings);
  if (!actions.ok) return actions;

  const candidate = {
    schemaVersion: "2",
    identity: source.value.identity,
    version: source.value.version,
    publisher: source.value.publisher,
    experiences: source.value.experiences,
    capabilities: source.value.capabilities,
    contextTypes: source.value.contextTypes,
    actions: actions.value,
    flows: source.value.flows,
    brandRef: source.value.brandRef,
    governanceRequirements: source.value.governanceRequirements,
    hostCompatibility: source.value.hostCompatibility,
    protocolProjections: source.value.protocolProjections,
    triggers: declaration.value.triggers,
    distribution: source.value.distribution,
    commercial: {
      entitlementRefs: source.value.commercial.entitlementRefs,
      meteringRefs: source.value.commercial.meteringRefs,
      pricingRefs: declaration.value.pricingRefs,
      settlementRefs: declaration.value.settlementRefs,
    },
  };

  const target = parseViraApplicationPackageV2(candidate);
  if (!target.ok) {
    return fail(
      "INVALID_V2_APPLICATION",
      target.issue.path,
      target.issue.message,
      target.issue,
    );
  }
  return { ok: true, value: target.value };
}
