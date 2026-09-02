import {
  isSemanticNamespace,
  parseCapability,
  parseJsonValue,
  type Capability,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";

export const STUDIO_HOST_CAPABILITY_MANIFEST_VERSION = "1" as const;
export const STUDIO_HOST_COMPATIBILITY_REQUIREMENT_VERSION = "1" as const;
export const STUDIO_HOST_PLATFORMS = Object.freeze(["web", "ios", "android"] as const);
export const STUDIO_HOST_MAX_IMPLEMENTATION_IDS = 512 as const;
export const STUDIO_HOST_MAX_CAPABILITIES = 256 as const;

export type StudioHostPlatform = (typeof STUDIO_HOST_PLATFORMS)[number];

export interface StudioHostCapabilityManifest {
  readonly version: typeof STUDIO_HOST_CAPABILITY_MANIFEST_VERSION;
  readonly id: string;
  readonly platform: StudioHostPlatform;
  readonly implementationIds: readonly string[];
  readonly capabilities: readonly Capability[];
}

export interface StudioHostCompatibilityRequirement {
  readonly version: typeof STUDIO_HOST_COMPATIBILITY_REQUIREMENT_VERSION;
  readonly platform: StudioHostPlatform;
  readonly implementationIds: readonly string[];
  readonly capabilities: readonly Capability[];
}

export type StudioHostCapabilityValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ID"
  | "INVALID_PLATFORM"
  | "INVALID_IMPLEMENTATION_IDS"
  | "IMPLEMENTATION_LIMIT_EXCEEDED"
  | "INVALID_IMPLEMENTATION_ID"
  | "DUPLICATE_IMPLEMENTATION_ID"
  | "INVALID_CAPABILITIES"
  | "CAPABILITY_LIMIT_EXCEEDED"
  | "INVALID_CAPABILITY"
  | "DUPLICATE_CAPABILITY";

export interface StudioHostCapabilityValidationIssue {
  readonly code: StudioHostCapabilityValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StudioHostCapabilityManifestResult =
  | { readonly ok: true; readonly value: StudioHostCapabilityManifest }
  | { readonly ok: false; readonly issue: StudioHostCapabilityValidationIssue };

export type StudioHostCompatibilityRequirementResult =
  | { readonly ok: true; readonly value: StudioHostCompatibilityRequirement }
  | { readonly ok: false; readonly issue: StudioHostCapabilityValidationIssue };

export type StudioHostCompatibilityMismatchCode =
  | "PLATFORM_MISMATCH"
  | "MISSING_IMPLEMENTATION"
  | "MISSING_CAPABILITY";

export interface StudioHostCompatibilityMismatch {
  readonly code: StudioHostCompatibilityMismatchCode;
  readonly path: string;
}

export interface StudioHostCompatibilityEvaluation {
  readonly compatible: boolean;
  readonly mismatches: readonly StudioHostCompatibilityMismatch[];
}

export type StudioHostCompatibilityInputStage = "manifest" | "requirement";

export interface StudioHostCompatibilityInputIssue extends StudioHostCapabilityValidationIssue {
  readonly stage: StudioHostCompatibilityInputStage;
}

export type StudioHostCompatibilityEvaluationResult =
  | { readonly ok: true; readonly value: StudioHostCompatibilityEvaluation }
  | { readonly ok: false; readonly issue: StudioHostCompatibilityInputIssue };

type StudioHostCapabilityValidationFailure = {
  readonly ok: false;
  readonly issue: StudioHostCapabilityValidationIssue;
};

type ParsedValueResult<T> =
  | { readonly ok: true; readonly value: T }
  | StudioHostCapabilityValidationFailure;

const manifestFields = new Set(["version", "id", "platform", "implementationIds", "capabilities"]);
const requirementFields = new Set(["version", "platform", "implementationIds", "capabilities"]);
const platforms = new Set<StudioHostPlatform>(STUDIO_HOST_PLATFORMS);

function failure(
  code: StudioHostCapabilityValidationCode,
  path: string,
  message: string,
): StudioHostCapabilityValidationFailure {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

function preflightArrayLimit(
  input: unknown,
  key: string,
  maximum: number,
  code: "IMPLEMENTATION_LIMIT_EXCEEDED" | "CAPABILITY_LIMIT_EXCEEDED",
  path: string,
): StudioHostCapabilityValidationFailure | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !("value" in descriptor) || !Array.isArray(descriptor.value)) return undefined;
    if (descriptor.value.length > maximum) {
      return failure(code, path, `maximum ${maximum} entries exceeded`);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parsePlatform(
  value: JsonValue | undefined,
  path: string,
): ParsedValueResult<StudioHostPlatform> {
  if (typeof value !== "string" || !platforms.has(value as StudioHostPlatform)) {
    return failure("INVALID_PLATFORM", path, "Studio host platform must be web, ios, or android");
  }
  return { ok: true, value: value as StudioHostPlatform };
}

function parseImplementationIds(
  value: JsonValue | undefined,
  path: string,
): ParsedValueResult<readonly string[]> {
  if (!Array.isArray(value)) {
    return failure("INVALID_IMPLEMENTATION_IDS", path, "implementationIds must be an array");
  }
  if (value.length > STUDIO_HOST_MAX_IMPLEMENTATION_IDS) {
    return failure("IMPLEMENTATION_LIMIT_EXCEEDED", path, `maximum ${STUDIO_HOST_MAX_IMPLEMENTATION_IDS} implementation IDs exceeded`);
  }

  const seen = new Set<string>();
  const output: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const candidate = value[index];
    if (typeof candidate !== "string" || !candidate.includes(".") || !isSemanticNamespace(candidate)) {
      return failure(
        "INVALID_IMPLEMENTATION_ID",
        `${path}[${index}]`,
        "implementation ID must be a namespaced semantic identifier",
      );
    }
    if (seen.has(candidate)) {
      return failure("DUPLICATE_IMPLEMENTATION_ID", `${path}[${index}]`, "duplicate implementation ID");
    }
    seen.add(candidate);
    output.push(candidate);
  }
  return { ok: true, value: Object.freeze(output) };
}

function capabilityIdentity(capability: Capability): string {
  return `${capability.version}\u0000${capability.id}`;
}

function parseCapabilities(
  value: JsonValue | undefined,
  path: string,
): ParsedValueResult<readonly Capability[]> {
  if (!Array.isArray(value)) {
    return failure("INVALID_CAPABILITIES", path, "capabilities must be an array");
  }
  if (value.length > STUDIO_HOST_MAX_CAPABILITIES) {
    return failure("CAPABILITY_LIMIT_EXCEEDED", path, `maximum ${STUDIO_HOST_MAX_CAPABILITIES} capabilities exceeded`);
  }

  const seen = new Set<string>();
  const output: Capability[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const parsed = parseCapability(value[index]);
    if (!parsed.ok) {
      return failure(
        "INVALID_CAPABILITY",
        nestedPath(`${path}[${index}]`, parsed.issue.path),
        parsed.issue.message,
      );
    }
    const identity = capabilityIdentity(parsed.value);
    if (seen.has(identity)) {
      return failure("DUPLICATE_CAPABILITY", `${path}[${index}]`, "duplicate capability");
    }
    seen.add(identity);
    output.push(Object.freeze({ version: parsed.value.version, id: parsed.value.id }));
  }
  return { ok: true, value: Object.freeze(output) };
}

export function createStudioHostCapabilityManifest(input: unknown): StudioHostCapabilityManifestResult {
  const implementationLimit = preflightArrayLimit(
    input,
    "implementationIds",
    STUDIO_HOST_MAX_IMPLEMENTATION_IDS,
    "IMPLEMENTATION_LIMIT_EXCEEDED",
    "$.implementationIds",
  );
  if (implementationLimit) return implementationLimit;
  const capabilityLimit = preflightArrayLimit(
    input,
    "capabilities",
    STUDIO_HOST_MAX_CAPABILITIES,
    "CAPABILITY_LIMIT_EXCEEDED",
    "$.capabilities",
  );
  if (capabilityLimit) return capabilityLimit;

  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "Studio host capability manifest must be a canonical JSON object");
  const fields = parsed.value;
  const unknown = Object.keys(fields).sort().find((field) => !manifestFields.has(field));
  if (unknown) return failure("UNKNOWN_FIELD", `$.${unknown}`, `unknown Studio host capability manifest field: ${unknown}`);
  if (fields.version !== STUDIO_HOST_CAPABILITY_MANIFEST_VERSION) {
    return failure("INVALID_VERSION", "$.version", `Studio host capability manifest version must be ${STUDIO_HOST_CAPABILITY_MANIFEST_VERSION}`);
  }
  if (typeof fields.id !== "string" || !fields.id.includes(".") || !isSemanticNamespace(fields.id)) {
    return failure("INVALID_ID", "$.id", "Studio host capability manifest id must be a namespaced semantic identifier");
  }

  const platform = parsePlatform(fields.platform, "$.platform");
  if (!platform.ok) return platform;
  const implementationIds = parseImplementationIds(fields.implementationIds, "$.implementationIds");
  if (!implementationIds.ok) return implementationIds;
  const capabilities = parseCapabilities(fields.capabilities, "$.capabilities");
  if (!capabilities.ok) return capabilities;

  return {
    ok: true,
    value: Object.freeze({
      version: STUDIO_HOST_CAPABILITY_MANIFEST_VERSION,
      id: fields.id,
      platform: platform.value,
      implementationIds: implementationIds.value,
      capabilities: capabilities.value,
    }),
  };
}

export function createStudioHostCompatibilityRequirement(input: unknown): StudioHostCompatibilityRequirementResult {
  const implementationLimit = preflightArrayLimit(
    input,
    "implementationIds",
    STUDIO_HOST_MAX_IMPLEMENTATION_IDS,
    "IMPLEMENTATION_LIMIT_EXCEEDED",
    "$.implementationIds",
  );
  if (implementationLimit) return implementationLimit;
  const capabilityLimit = preflightArrayLimit(
    input,
    "capabilities",
    STUDIO_HOST_MAX_CAPABILITIES,
    "CAPABILITY_LIMIT_EXCEEDED",
    "$.capabilities",
  );
  if (capabilityLimit) return capabilityLimit;

  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "Studio host compatibility requirement must be a canonical JSON object");
  const fields = parsed.value;
  const unknown = Object.keys(fields).sort().find((field) => !requirementFields.has(field));
  if (unknown) return failure("UNKNOWN_FIELD", `$.${unknown}`, `unknown Studio host compatibility requirement field: ${unknown}`);
  if (fields.version !== STUDIO_HOST_COMPATIBILITY_REQUIREMENT_VERSION) {
    return failure("INVALID_VERSION", "$.version", `Studio host compatibility requirement version must be ${STUDIO_HOST_COMPATIBILITY_REQUIREMENT_VERSION}`);
  }

  const platform = parsePlatform(fields.platform, "$.platform");
  if (!platform.ok) return platform;
  const implementationIds = parseImplementationIds(fields.implementationIds, "$.implementationIds");
  if (!implementationIds.ok) return implementationIds;
  const capabilities = parseCapabilities(fields.capabilities, "$.capabilities");
  if (!capabilities.ok) return capabilities;

  return {
    ok: true,
    value: Object.freeze({
      version: STUDIO_HOST_COMPATIBILITY_REQUIREMENT_VERSION,
      platform: platform.value,
      implementationIds: implementationIds.value,
      capabilities: capabilities.value,
    }),
  };
}

function compatibilityInputFailure(
  stage: StudioHostCompatibilityInputStage,
  issue: StudioHostCapabilityValidationIssue,
): StudioHostCompatibilityEvaluationResult {
  return {
    ok: false,
    issue: Object.freeze({
      stage,
      code: issue.code,
      path: nestedPath(stage === "manifest" ? "$.manifest" : "$.requirement", issue.path),
      message: issue.message,
    }),
  };
}

export function evaluateStudioHostCompatibility(
  manifestInput: unknown,
  requirementInput: unknown,
): StudioHostCompatibilityEvaluationResult {
  const manifest = createStudioHostCapabilityManifest(manifestInput);
  if (!manifest.ok) return compatibilityInputFailure("manifest", manifest.issue);
  const requirement = createStudioHostCompatibilityRequirement(requirementInput);
  if (!requirement.ok) return compatibilityInputFailure("requirement", requirement.issue);

  const mismatches: StudioHostCompatibilityMismatch[] = [];
  if (manifest.value.platform !== requirement.value.platform) {
    mismatches.push(Object.freeze({ code: "PLATFORM_MISMATCH", path: "$.requirement.platform" }));
  }

  const supportedImplementations = new Set(manifest.value.implementationIds);
  for (let index = 0; index < requirement.value.implementationIds.length; index += 1) {
    if (!supportedImplementations.has(requirement.value.implementationIds[index]!)) {
      mismatches.push(Object.freeze({
        code: "MISSING_IMPLEMENTATION",
        path: `$.requirement.implementationIds[${index}]`,
      }));
    }
  }

  const supportedCapabilities = new Set(manifest.value.capabilities.map(capabilityIdentity));
  for (let index = 0; index < requirement.value.capabilities.length; index += 1) {
    if (!supportedCapabilities.has(capabilityIdentity(requirement.value.capabilities[index]!))) {
      mismatches.push(Object.freeze({
        code: "MISSING_CAPABILITY",
        path: `$.requirement.capabilities[${index}]`,
      }));
    }
  }

  const frozenMismatches = Object.freeze(mismatches);
  return {
    ok: true,
    value: Object.freeze({
      compatible: frozenMismatches.length === 0,
      mismatches: frozenMismatches,
    }),
  };
}
