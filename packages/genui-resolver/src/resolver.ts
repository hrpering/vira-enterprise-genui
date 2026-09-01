import {
  createViraExperienceRuntime,
  type StudioRuntimeReactRenderer,
  type ViraExperienceRuntime,
  type ViraExperienceRuntimeInput,
  type ViraExperienceRuntimeResult,
} from "@vira-enterprise-genui/genui";
import {
  lookupExperienceRegistryManifest,
  type ExperienceRegistrySnapshot,
} from "@vira-enterprise-genui/experience-registry";
import { parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import type {
  ViraCommandAdapterResult,
  ViraDependencyManifest,
  ViraRuntimeCapabilityProfile,
  ViraRuntimeCapabilityRegistry,
} from "./capabilities.js";
import type {
  ViraExperiencePackIdentity,
  ViraExperiencePresentMessage,
} from "./message.js";

export interface ExperienceArtifactResolver {
  readonly resolveStudioPublication: (input: {
    readonly packId: string;
    readonly version: string;
    readonly artifactId: string;
    readonly digest: string;
  }) => Promise<unknown>;
}

export type ViraExperienceRuntimeFactory = (
  input: ViraExperienceRuntimeInput,
) => ViraExperienceRuntimeResult;

export type ViraExperienceResolutionCode =
  | "REGISTRY_LOOKUP_FAILED"
  | "UNKNOWN_PACK"
  | "UNKNOWN_ENTRYPOINT"
  | "MISSING_ARTIFACT"
  | "WRONG_ARTIFACT_ROLE"
  | "WRONG_MEDIA_TYPE"
  | "ARTIFACT_RESOLUTION_FAILED"
  | "INVALID_PUBLICATION"
  | "UNSUPPORTED_PUBLICATION_VERSION"
  | "MISSING_CAPABILITY"
  | "AMBIGUOUS_PROFILE"
  | "PROFILE_PREPARATION_FAILED"
  | "MISSING_RENDERER"
  | "RUNTIME_FAILED"
  | "UNKNOWN_COMMAND"
  | "COMMAND_REJECTED"
  | "COMMAND_FAILED"
  | "RESOLVED_EXPERIENCE_DISPOSED";

export interface ViraExperienceResolutionIssue {
  readonly code: ViraExperienceResolutionCode;
  readonly path: string;
  readonly message: string;
}

export type ViraResolvedExperienceCommandResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issue: ViraExperienceResolutionIssue };

export interface ViraResolvedExperience {
  readonly instanceId: string;
  readonly pack: ViraExperiencePackIdentity;
  readonly publication: JsonObject;
  readonly profileId: string;
  readonly runtime: ViraExperienceRuntime;
  readonly renderers: Readonly<Record<string, StudioRuntimeReactRenderer>>;
  readonly command: (command: string, args: JsonObject) => Promise<ViraResolvedExperienceCommandResult>;
  readonly dispose: () => void;
}

export type ViraExperienceResolutionResult =
  | { readonly ok: true; readonly value: ViraResolvedExperience }
  | { readonly ok: false; readonly issue: ViraExperienceResolutionIssue };

export interface ViraExperienceResolver {
  readonly resolvePresent: (message: ViraExperiencePresentMessage) => Promise<ViraExperienceResolutionResult>;
}

export interface ViraExperienceResolverInput {
  readonly registry: ExperienceRegistrySnapshot;
  readonly artifactResolver: ExperienceArtifactResolver;
  readonly capabilities: ViraRuntimeCapabilityRegistry;
  readonly runtimeFactory?: ViraExperienceRuntimeFactory;
}

function failure(
  code: ViraExperienceResolutionCode,
  path: string,
  message: string,
): ViraExperienceResolutionResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function objectValue(value: JsonValue | undefined): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function dependencyArray(
  value: JsonValue | undefined,
  path: string,
): { readonly ok: true; readonly value: readonly string[] } | { readonly ok: false; readonly issue: ViraExperienceResolutionIssue } {
  if (!Array.isArray(value)) {
    return { ok: false, issue: Object.freeze({ code: "INVALID_PUBLICATION", path, message: "dependency manifest field must be an array" }) };
  }
  const output: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item !== "string" || item.length === 0) {
      return { ok: false, issue: Object.freeze({ code: "INVALID_PUBLICATION", path: `${path}[${index}]`, message: "dependency manifest entries must be non-empty strings" }) };
    }
    output.push(item);
  }
  return { ok: true, value: Object.freeze(output) };
}

function dependencyManifest(publication: JsonObject):
  | { readonly ok: true; readonly value: ViraDependencyManifest }
  | { readonly ok: false; readonly issue: ViraExperienceResolutionIssue } {
  const manifest = objectValue(publication.manifest);
  if (!manifest) {
    return { ok: false, issue: Object.freeze({ code: "INVALID_PUBLICATION", path: "$.publication.manifest", message: "Studio publication dependency manifest is required" }) };
  }
  const components = dependencyArray(manifest.componentRefs, "$.publication.manifest.componentRefs");
  if (!components.ok) return components;
  const actions = dependencyArray(manifest.actionEvents, "$.publication.manifest.actionEvents");
  if (!actions.ok) return actions;
  const bindings = dependencyArray(manifest.bindingSources, "$.publication.manifest.bindingSources");
  if (!bindings.ok) return bindings;
  return {
    ok: true,
    value: Object.freeze({
      componentRefs: components.value,
      actionEvents: actions.value,
      bindingSources: bindings.value,
    }),
  };
}

function hasEntrypoint(entrypoints: readonly string[], entrypoint: string): boolean {
  for (const candidate of entrypoints) if (candidate === entrypoint) return true;
  return false;
}

function findArtifact(
  artifacts: readonly { readonly id: string; readonly role: string; readonly mediaType: string; readonly digest: string }[],
  id: string,
): { readonly id: string; readonly role: string; readonly mediaType: string; readonly digest: string } | undefined {
  for (const artifact of artifacts) if (artifact.id === id) return artifact;
  return undefined;
}

function hasRenderer(
  renderers: Readonly<Record<string, StudioRuntimeReactRenderer>>,
  ref: string,
): boolean {
  return Object.hasOwn(renderers, ref) && typeof renderers[ref] === "function";
}

function runtimeFailure(result: Exclude<ViraExperienceRuntimeResult, { readonly ok: true }>): ViraExperienceResolutionResult {
  return failure("RUNTIME_FAILED", `$.runtime.${result.stage}`, result.issue.message);
}

function commandFailure(
  code: ViraExperienceResolutionCode,
  path: string,
  message: string,
): ViraResolvedExperienceCommandResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function commandAdapterResult(result: ViraCommandAdapterResult): ViraResolvedExperienceCommandResult {
  return result.ok
    ? { ok: true }
    : commandFailure("COMMAND_REJECTED", result.issue.path, result.issue.message);
}

export function createViraExperienceResolver(input: ViraExperienceResolverInput): ViraExperienceResolver {
  const runtimeFactory = input.runtimeFactory ?? createViraExperienceRuntime;
  return Object.freeze({
    async resolvePresent(message: ViraExperiencePresentMessage): Promise<ViraExperienceResolutionResult> {
      const lookup = lookupExperienceRegistryManifest(input.registry, message.pack.id, message.pack.version);
      if (!lookup.ok) return failure("REGISTRY_LOOKUP_FAILED", lookup.issue.path, lookup.issue.message);
      const manifest = lookup.value.manifest;
      if (!manifest) return failure("UNKNOWN_PACK", "$.pack", "requested Experience Pack id and version are not registered");
      if (!hasEntrypoint(manifest.entrypoints, message.pack.entrypoint)) {
        return failure("UNKNOWN_ENTRYPOINT", "$.pack.entrypoint", "requested Experience Pack entrypoint is not registered");
      }
      const artifact = findArtifact(manifest.artifacts, message.pack.entrypoint);
      if (!artifact) return failure("MISSING_ARTIFACT", "$.pack.entrypoint", "entrypoint artifact is missing from the registered Pack");
      if (artifact.role !== "studio-publication") {
        return failure("WRONG_ARTIFACT_ROLE", "$.pack.entrypoint", "entrypoint artifact must be a Studio publication");
      }
      if (artifact.mediaType !== "application/json") {
        return failure("WRONG_MEDIA_TYPE", "$.pack.entrypoint", "Studio publication artifact must use application/json");
      }

      let artifactValue: unknown;
      try {
        artifactValue = await input.artifactResolver.resolveStudioPublication({
          packId: manifest.id,
          version: manifest.version,
          artifactId: artifact.id,
          digest: artifact.digest,
        });
      } catch {
        return failure("ARTIFACT_RESOLUTION_FAILED", "$.publication", "Studio publication artifact could not be resolved");
      }
      const parsedPublication = parseJsonValue(artifactValue, "$.publication");
      if (!parsedPublication.ok) return failure("INVALID_PUBLICATION", parsedPublication.issue.path, parsedPublication.issue.reason);
      const publication = objectValue(parsedPublication.value);
      if (!publication) return failure("INVALID_PUBLICATION", "$.publication", "Studio publication must be a JSON object");
      if (publication.version !== "1") {
        return failure("UNSUPPORTED_PUBLICATION_VERSION", "$.publication.version", "Studio publication version is not supported");
      }
      const dependencies = dependencyManifest(publication);
      if (!dependencies.ok) return { ok: false, issue: dependencies.issue };
      const capability = input.capabilities.resolve(dependencies.value);
      if (!capability.ok) {
        const resolutionCode: ViraExperienceResolutionCode = capability.issue.code === "AMBIGUOUS_PROFILE"
          ? "AMBIGUOUS_PROFILE"
          : "MISSING_CAPABILITY";
        return failure(resolutionCode, capability.issue.path, capability.issue.message);
      }
      const profile: ViraRuntimeCapabilityProfile = capability.value;

      let preparation;
      try {
        preparation = await profile.prepare({
          instanceId: message.instanceId,
          pack: message.pack,
          payload: message.payload,
          publication,
        });
      } catch {
        return failure("PROFILE_PREPARATION_FAILED", "$.profile", "trusted runtime profile failed while preparing runtime inputs");
      }
      for (const ref of dependencies.value.componentRefs) {
        if (!hasRenderer(preparation.renderers, ref)) {
          return failure("MISSING_RENDERER", `$.renderers.${ref}`, `trusted runtime profile does not provide renderer for ${ref}`);
        }
      }

      let runtimeResult: ViraExperienceRuntimeResult;
      try {
        runtimeResult = runtimeFactory({
          publication,
          componentCatalog: preparation.componentCatalog,
          bindingSourceCatalog: preparation.bindingSourceCatalog,
          actionAdapter: preparation.actionAdapter,
          runtimeState: preparation.runtimeState,
          permissionPolicy: preparation.permissionPolicy,
          host: preparation.host,
        });
      } catch {
        return failure("RUNTIME_FAILED", "$.runtime", "canonical GenUI runtime factory threw unexpectedly");
      }
      if (!runtimeResult.ok) return runtimeFailure(runtimeResult);
      const runtime = runtimeResult.value;
      let disposed = false;
      const pack: ViraExperiencePackIdentity = Object.freeze({ ...message.pack });
      const resolved: ViraResolvedExperience = {
        instanceId: message.instanceId,
        pack,
        publication,
        profileId: profile.id,
        runtime,
        renderers: preparation.renderers,
        async command(command, args): Promise<ViraResolvedExperienceCommandResult> {
          if (disposed) return commandFailure("RESOLVED_EXPERIENCE_DISPOSED", "$.instanceId", "resolved experience is disposed");
          const adapter = profile.commands?.[command];
          if (typeof adapter !== "function") return commandFailure("UNKNOWN_COMMAND", "$.command", "command alias is not registered for this runtime profile");
          try {
            return commandAdapterResult(await adapter({
              runtime,
              instanceId: message.instanceId,
              pack,
              payload: message.payload,
              publication,
              args,
            }));
          } catch {
            return commandFailure("COMMAND_FAILED", "$.command", "trusted command adapter failed unexpectedly");
          }
        },
        dispose(): void {
          if (disposed) return;
          disposed = true;
          runtime.dispose();
        },
      };
      return { ok: true, value: Object.freeze(resolved) };
    },
  });
}
