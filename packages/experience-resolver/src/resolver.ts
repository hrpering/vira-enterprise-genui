import type {
  ExperiencePackArtifactDescriptor,
  ExperiencePackManifest,
} from "@vira-enterprise-genui/experience-packs";
import {
  isCanonicalExperienceRegistrySnapshot,
  lookupExperienceRegistryManifest,
  type ExperienceRegistrySnapshot,
} from "@vira-enterprise-genui/experience-registry";
import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  createStudioHostCapabilityManifest,
  evaluateStudioHostCompatibility,
  type StudioHostCompatibilityMismatch,
  type StudioHostPlatform,
} from "@vira-enterprise-genui/studio-host";

export const EXPERIENCE_RESOLUTION_REQUEST_VERSION = "1" as const;
export const EXPERIENCE_RESOLVER_MAX_ID_LENGTH = 4_096 as const;

export interface ExperienceResolutionRequest {
  readonly version: typeof EXPERIENCE_RESOLUTION_REQUEST_VERSION;
  readonly instanceId: string;
  readonly deploymentId: string;
}

export interface ExperienceExactDeploymentTarget {
  readonly deploymentId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly entrypoint: string;
}

export interface ExperienceResolutionPackIdentity {
  readonly id: string;
  readonly version: string;
  readonly entrypoint: string;
}

export interface ExperienceResolutionArtifactIdentity {
  readonly id: string;
  readonly role: "studio-publication";
  readonly mediaType: "application/json";
  readonly digest: string;
}

export interface ExperienceResolutionCompatibilityIdentity {
  readonly hostId: string;
  readonly platform: StudioHostPlatform;
}

export interface ResolvedExperienceDescriptor {
  readonly instanceId: string;
  readonly deploymentId: string;
  readonly pack: ExperienceResolutionPackIdentity;
  readonly artifact: ExperienceResolutionArtifactIdentity;
  /** Canonical JSON snapshot only; Studio semantic authenticity is a later canonical runtime gate. */
  readonly publication: JsonObject;
  readonly compatibility: ExperienceResolutionCompatibilityIdentity;
}

export interface ExperienceArtifactResolutionContext {
  readonly deploymentId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly artifactId: string;
  readonly role: "studio-publication";
  readonly mediaType: "application/json";
  readonly digest: string;
}

export interface ExperienceHostRequirementContext {
  readonly deploymentId: string;
  readonly pack: ExperienceResolutionPackIdentity;
  readonly artifact: ExperienceResolutionArtifactIdentity;
  readonly publication: JsonObject;
  readonly host: ExperienceResolutionCompatibilityIdentity;
}

export interface ExperienceResolverConfiguration {
  readonly registry: ExperienceRegistrySnapshot;
  readonly hostManifest: unknown;
  readonly resolveExactDeployment: (deploymentId: string) => unknown | Promise<unknown>;
  readonly resolvePublicationArtifact: (
    context: ExperienceArtifactResolutionContext,
  ) => unknown | Promise<unknown>;
  readonly deriveHostRequirement: (
    context: ExperienceHostRequirementContext,
  ) => unknown | Promise<unknown>;
}

export type ExperienceResolverConfigurationCode =
  | "INVALID_CONFIGURATION"
  | "UNKNOWN_CONFIGURATION_FIELD"
  | "INVALID_REGISTRY"
  | "INVALID_HOST_MANIFEST"
  | "INVALID_DEPLOYMENT_RESOLVER"
  | "INVALID_ARTIFACT_RESOLVER"
  | "INVALID_REQUIREMENT_RESOLVER";

export interface ExperienceResolverConfigurationIssue {
  readonly code: ExperienceResolverConfigurationCode;
  readonly path: string;
  readonly message: string;
}

export type ExperienceResolutionCode =
  | "INVALID_REQUEST"
  | "RESOLVER_DISPOSED"
  | "INSTANCE_ALREADY_RESERVED"
  | "DEPLOYMENT_RESOLUTION_FAILED"
  | "INVALID_DEPLOYMENT_TARGET"
  | "DEPLOYMENT_ID_MISMATCH"
  | "REGISTRY_LOOKUP_FAILED"
  | "PACK_NOT_FOUND"
  | "ENTRYPOINT_NOT_FOUND"
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_RESOLUTION_FAILED"
  | "INVALID_PUBLICATION_ARTIFACT"
  | "HOST_REQUIREMENT_DERIVATION_FAILED"
  | "INVALID_HOST_REQUIREMENT"
  | "HOST_INCOMPATIBLE";

export interface ExperienceResolutionIssue {
  readonly code: ExperienceResolutionCode;
  readonly path: string;
  readonly message: string;
  readonly mismatches?: readonly StudioHostCompatibilityMismatch[];
}

export type ExperienceResolutionResult =
  | { readonly ok: true; readonly value: ResolvedExperienceDescriptor }
  | { readonly ok: false; readonly issue: ExperienceResolutionIssue };

export interface ExperienceResolver {
  readonly resolve: (request: unknown) => Promise<ExperienceResolutionResult>;
  readonly get: (instanceId: string) => ResolvedExperienceDescriptor | undefined;
  readonly release: (instanceId: string) => boolean;
  readonly dispose: () => void;
}

export type ExperienceResolverFactoryResult =
  | { readonly ok: true; readonly value: ExperienceResolver }
  | { readonly ok: false; readonly issue: ExperienceResolverConfigurationIssue };

const configurationFields = new Set([
  "registry",
  "hostManifest",
  "resolveExactDeployment",
  "resolvePublicationArtifact",
  "deriveHostRequirement",
]);
const requestFields = new Set(["version", "instanceId", "deploymentId"]);
const deploymentFields = new Set(["deploymentId", "packId", "packVersion", "entrypoint"]);

function configurationFailure(
  code: ExperienceResolverConfigurationCode,
  path: string,
  message: string,
): ExperienceResolverFactoryResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function resolutionFailure(
  code: ExperienceResolutionCode,
  path: string,
  message: string,
  mismatches?: readonly StudioHostCompatibilityMismatch[],
): ExperienceResolutionResult {
  return {
    ok: false,
    issue: Object.freeze({
      code,
      path,
      message,
      ...(mismatches === undefined ? {} : { mismatches }),
    }),
  };
}

function isPlainObject(value: unknown): value is object {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readConfiguration(input: unknown):
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly result: ExperienceResolverFactoryResult } {
  if (!isPlainObject(input) || Object.getOwnPropertySymbols(input).length > 0) {
    return {
      ok: false,
      result: configurationFailure(
        "INVALID_CONFIGURATION",
        "$",
        "experience resolver configuration must be a plain own-data object",
      ),
    };
  }
  const keys = Object.keys(input);
  if (Object.getOwnPropertyNames(input).length !== keys.length) {
    return {
      ok: false,
      result: configurationFailure(
        "INVALID_CONFIGURATION",
        "$",
        "experience resolver configuration must use enumerable string fields only",
      ),
    };
  }
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (!configurationFields.has(key)) {
      return {
        ok: false,
        result: configurationFailure(
          "UNKNOWN_CONFIGURATION_FIELD",
          `$.${key}`,
          "unknown experience resolver configuration field",
        ),
      };
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !("value" in descriptor)) {
      return {
        ok: false,
        result: configurationFailure(
          "INVALID_CONFIGURATION",
          `$.${key}`,
          "experience resolver configuration must not contain accessors",
        ),
      };
    }
    output[key] = descriptor.value;
  }
  return { ok: true, value: output };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function freezeJson<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeJson(item);
    return Object.freeze(value);
  }
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) freezeJson(object[key]);
  return Object.freeze(value);
}

function isBoundedExactId(value: JsonValue | undefined): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= EXPERIENCE_RESOLVER_MAX_ID_LENGTH;
}

function exactFields(value: JsonObject, allowed: ReadonlySet<string>): string | undefined {
  return Object.keys(value).sort().find((key) => !allowed.has(key));
}

function parseRequest(input: unknown):
  | { readonly ok: true; readonly value: ExperienceResolutionRequest }
  | { readonly ok: false; readonly result: ExperienceResolutionResult } {
  const parsed = parseJsonValue(input);
  if (!parsed.ok || !isJsonObject(parsed.value)) {
    return {
      ok: false,
      result: resolutionFailure(
        "INVALID_REQUEST",
        parsed.ok ? "$" : parsed.issue.path,
        "experience resolution request must be canonical JSON object data",
      ),
    };
  }
  const fields = parsed.value;
  const unknown = exactFields(fields, requestFields);
  if (unknown) {
    return {
      ok: false,
      result: resolutionFailure("INVALID_REQUEST", `$.${unknown}`, "unknown experience resolution request field"),
    };
  }
  if (fields.version !== EXPERIENCE_RESOLUTION_REQUEST_VERSION) {
    return {
      ok: false,
      result: resolutionFailure(
        "INVALID_REQUEST",
        "$.version",
        `experience resolution request version must be ${EXPERIENCE_RESOLUTION_REQUEST_VERSION}`,
      ),
    };
  }
  if (!isBoundedExactId(fields.instanceId)) {
    return {
      ok: false,
      result: resolutionFailure("INVALID_REQUEST", "$.instanceId", "instanceId must be a bounded non-empty string"),
    };
  }
  if (!isBoundedExactId(fields.deploymentId)) {
    return {
      ok: false,
      result: resolutionFailure("INVALID_REQUEST", "$.deploymentId", "deploymentId must be a bounded non-empty string"),
    };
  }
  return {
    ok: true,
    value: Object.freeze({
      version: EXPERIENCE_RESOLUTION_REQUEST_VERSION,
      instanceId: fields.instanceId,
      deploymentId: fields.deploymentId,
    }),
  };
}

function parseDeploymentTarget(input: unknown):
  | { readonly ok: true; readonly value: ExperienceExactDeploymentTarget }
  | { readonly ok: false; readonly result: ExperienceResolutionResult } {
  const parsed = parseJsonValue(input);
  if (!parsed.ok || !isJsonObject(parsed.value)) {
    return {
      ok: false,
      result: resolutionFailure(
        "INVALID_DEPLOYMENT_TARGET",
        parsed.ok ? "$.deployment" : `$.deployment${parsed.issue.path.slice(1)}`,
        "exact deployment resolver must return canonical JSON object data",
      ),
    };
  }
  const fields = parsed.value;
  const unknown = exactFields(fields, deploymentFields);
  if (unknown) {
    return {
      ok: false,
      result: resolutionFailure(
        "INVALID_DEPLOYMENT_TARGET",
        `$.deployment.${unknown}`,
        "unknown exact deployment target field",
      ),
    };
  }
  for (const key of ["deploymentId", "packId", "packVersion", "entrypoint"] as const) {
    if (!isBoundedExactId(fields[key])) {
      return {
        ok: false,
        result: resolutionFailure(
          "INVALID_DEPLOYMENT_TARGET",
          `$.deployment.${key}`,
          "exact deployment target identity fields must be bounded non-empty strings",
        ),
      };
    }
  }
  return {
    ok: true,
    value: Object.freeze({
      deploymentId: fields.deploymentId,
      packId: fields.packId,
      packVersion: fields.packVersion,
      entrypoint: fields.entrypoint,
    } as ExperienceExactDeploymentTarget),
  };
}

function findEntrypointArtifact(
  manifest: ExperiencePackManifest,
  entrypoint: string,
): ExperiencePackArtifactDescriptor | undefined {
  if (!manifest.entrypoints.includes(entrypoint)) return undefined;
  return manifest.artifacts.find((artifact) => artifact.id === entrypoint);
}

function canonicalArtifactIdentity(
  artifact: ExperiencePackArtifactDescriptor,
): ExperienceResolutionArtifactIdentity {
  /* Canonical Pack validation guarantees every entrypoint is a JSON Studio publication. */
  return Object.freeze({
    id: artifact.id,
    role: "studio-publication",
    mediaType: "application/json",
    digest: artifact.digest,
  });
}

export function createExperienceResolver(input: unknown): ExperienceResolverFactoryResult {
  const configuration = readConfiguration(input);
  if (!configuration.ok) return configuration.result;
  const fields = configuration.value;

  if (!isCanonicalExperienceRegistrySnapshot(fields.registry)) {
    return configurationFailure(
      "INVALID_REGISTRY",
      "$.registry",
      "experience resolver requires a canonical parsed Experience Registry snapshot",
    );
  }
  const hostManifest = createStudioHostCapabilityManifest(fields.hostManifest);
  if (!hostManifest.ok) {
    return configurationFailure(
      "INVALID_HOST_MANIFEST",
      `$.hostManifest${hostManifest.issue.path.slice(1)}`,
      hostManifest.issue.message,
    );
  }
  if (typeof fields.resolveExactDeployment !== "function") {
    return configurationFailure(
      "INVALID_DEPLOYMENT_RESOLVER",
      "$.resolveExactDeployment",
      "resolveExactDeployment must be a trusted function",
    );
  }
  if (typeof fields.resolvePublicationArtifact !== "function") {
    return configurationFailure(
      "INVALID_ARTIFACT_RESOLVER",
      "$.resolvePublicationArtifact",
      "resolvePublicationArtifact must be a trusted function",
    );
  }
  if (typeof fields.deriveHostRequirement !== "function") {
    return configurationFailure(
      "INVALID_REQUIREMENT_RESOLVER",
      "$.deriveHostRequirement",
      "deriveHostRequirement must be a trusted function",
    );
  }

  const registry = fields.registry as ExperienceRegistrySnapshot;
  const resolveExactDeployment = fields.resolveExactDeployment as ExperienceResolverConfiguration["resolveExactDeployment"];
  const resolvePublicationArtifact = fields.resolvePublicationArtifact as ExperienceResolverConfiguration["resolvePublicationArtifact"];
  const deriveHostRequirement = fields.deriveHostRequirement as ExperienceResolverConfiguration["deriveHostRequirement"];
  const mounted = new Map<string, ResolvedExperienceDescriptor>();
  const pending = new Set<string>();
  let disposed = false;

  const resolver: ExperienceResolver = {
    async resolve(requestInput): Promise<ExperienceResolutionResult> {
      if (disposed) {
        return resolutionFailure("RESOLVER_DISPOSED", "$", "experience resolver is disposed");
      }
      const request = parseRequest(requestInput);
      if (!request.ok) return request.result;
      const instanceId = request.value.instanceId;
      if (mounted.has(instanceId) || pending.has(instanceId)) {
        return resolutionFailure(
          "INSTANCE_ALREADY_RESERVED",
          "$.instanceId",
          "instanceId is already mounted or resolving in this resolver",
        );
      }

      pending.add(instanceId);
      try {
        let deploymentRaw: unknown;
        try {
          deploymentRaw = await resolveExactDeployment(request.value.deploymentId);
        } catch {
          return resolutionFailure(
            "DEPLOYMENT_RESOLUTION_FAILED",
            "$.deploymentId",
            "trusted exact deployment resolver failed",
          );
        }
        const deployment = parseDeploymentTarget(deploymentRaw);
        if (!deployment.ok) return deployment.result;
        if (deployment.value.deploymentId !== request.value.deploymentId) {
          return resolutionFailure(
            "DEPLOYMENT_ID_MISMATCH",
            "$.deployment.deploymentId",
            "exact deployment resolver returned a different deployment identity",
          );
        }

        const lookup = lookupExperienceRegistryManifest(
          registry,
          deployment.value.packId,
          deployment.value.packVersion,
        );
        if (!lookup.ok) {
          return resolutionFailure("REGISTRY_LOOKUP_FAILED", lookup.issue.path, lookup.issue.message);
        }
        if (lookup.value.manifest === null) {
          return resolutionFailure(
            "PACK_NOT_FOUND",
            "$.deployment",
            "exact Pack id and version are not present in the Registry snapshot",
          );
        }
        const manifest = lookup.value.manifest;
        if (!manifest.entrypoints.includes(deployment.value.entrypoint)) {
          return resolutionFailure(
            "ENTRYPOINT_NOT_FOUND",
            "$.deployment.entrypoint",
            "exact Pack entrypoint is not registered",
          );
        }
        const artifact = findEntrypointArtifact(manifest, deployment.value.entrypoint);
        if (!artifact) {
          return resolutionFailure(
            "ARTIFACT_NOT_FOUND",
            "$.deployment.entrypoint",
            "canonical Pack entrypoint artifact is unexpectedly unavailable",
          );
        }
        const resolvedArtifact = canonicalArtifactIdentity(artifact);
        const pack: ExperienceResolutionPackIdentity = Object.freeze({
          id: manifest.id,
          version: manifest.version,
          entrypoint: deployment.value.entrypoint,
        });
        const artifactContext: ExperienceArtifactResolutionContext = Object.freeze({
          deploymentId: deployment.value.deploymentId,
          packId: manifest.id,
          packVersion: manifest.version,
          artifactId: resolvedArtifact.id,
          role: resolvedArtifact.role,
          mediaType: resolvedArtifact.mediaType,
          digest: resolvedArtifact.digest,
        });

        let publicationRaw: unknown;
        try {
          publicationRaw = await resolvePublicationArtifact(artifactContext);
        } catch {
          return resolutionFailure(
            "ARTIFACT_RESOLUTION_FAILED",
            "$.publication",
            "trusted publication artifact resolver failed",
          );
        }
        const publicationParsed = parseJsonValue(publicationRaw, "$.publication");
        if (!publicationParsed.ok || !isJsonObject(publicationParsed.value)) {
          return resolutionFailure(
            "INVALID_PUBLICATION_ARTIFACT",
            publicationParsed.ok ? "$.publication" : publicationParsed.issue.path,
            "publication artifact must be bounded canonical JSON object data",
          );
        }
        const publication = freezeJson(publicationParsed.value);
        const compatibilityIdentity: ExperienceResolutionCompatibilityIdentity = Object.freeze({
          hostId: hostManifest.value.id,
          platform: hostManifest.value.platform,
        });
        const requirementContext: ExperienceHostRequirementContext = Object.freeze({
          deploymentId: deployment.value.deploymentId,
          pack,
          artifact: resolvedArtifact,
          publication,
          host: compatibilityIdentity,
        });

        let requirementRaw: unknown;
        try {
          requirementRaw = await deriveHostRequirement(requirementContext);
        } catch {
          return resolutionFailure(
            "HOST_REQUIREMENT_DERIVATION_FAILED",
            "$.compatibility",
            "trusted host requirement derivation failed",
          );
        }
        const compatibility = evaluateStudioHostCompatibility(hostManifest.value, requirementRaw);
        if (!compatibility.ok) {
          return resolutionFailure(
            "INVALID_HOST_REQUIREMENT",
            "$.compatibility",
            compatibility.issue.message,
          );
        }
        if (!compatibility.value.compatible) {
          return resolutionFailure(
            "HOST_INCOMPATIBLE",
            "$.compatibility",
            "host does not satisfy the exact Experience compatibility requirement",
            compatibility.value.mismatches,
          );
        }

        if (disposed) {
          return resolutionFailure("RESOLVER_DISPOSED", "$", "experience resolver was disposed while resolving");
        }
        const descriptor: ResolvedExperienceDescriptor = Object.freeze({
          instanceId,
          deploymentId: deployment.value.deploymentId,
          pack,
          artifact: resolvedArtifact,
          publication,
          compatibility: compatibilityIdentity,
        });
        mounted.set(instanceId, descriptor);
        return { ok: true, value: descriptor };
      } finally {
        pending.delete(instanceId);
      }
    },

    get(instanceId): ResolvedExperienceDescriptor | undefined {
      if (disposed || typeof instanceId !== "string") return undefined;
      return mounted.get(instanceId);
    },

    release(instanceId): boolean {
      if (disposed || typeof instanceId !== "string") return false;
      return mounted.delete(instanceId);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      mounted.clear();
      pending.clear();
    },
  };

  return { ok: true, value: Object.freeze(resolver) };
}
