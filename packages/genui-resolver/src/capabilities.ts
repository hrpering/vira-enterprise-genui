import type {
  StudioRuntimeReactRenderer,
  ViraExperienceRuntime,
  ViraExperienceRuntimeInput,
} from "@vira-enterprise-genui/genui";
import type { JsonObject } from "@vira-enterprise-genui/protocol";
import type { ViraExperiencePackIdentity } from "./message.js";

export interface ViraDependencyManifest {
  readonly componentRefs: readonly string[];
  readonly actionEvents: readonly string[];
  readonly bindingSources: readonly string[];
}

export interface ViraRuntimeProfileContext {
  readonly instanceId: string;
  readonly pack: ViraExperiencePackIdentity;
  readonly payload: JsonObject;
  readonly publication: JsonObject;
}

export interface ViraRuntimeProfilePreparation extends Omit<ViraExperienceRuntimeInput, "publication"> {
  readonly renderers: Readonly<Record<string, StudioRuntimeReactRenderer>>;
}

export interface ViraCommandAdapterIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type ViraCommandAdapterResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issue: ViraCommandAdapterIssue };

export interface ViraCommandAdapterContext {
  readonly runtime: ViraExperienceRuntime;
  readonly instanceId: string;
  readonly pack: ViraExperiencePackIdentity;
  readonly payload: JsonObject;
  readonly publication: JsonObject;
  readonly args: JsonObject;
}

export type ViraCommandAdapter = (
  context: ViraCommandAdapterContext,
) => ViraCommandAdapterResult | Promise<ViraCommandAdapterResult>;

export interface ViraRuntimeCapabilityProfile {
  readonly id: string;
  readonly componentRefs: readonly string[];
  readonly actionEvents: readonly string[];
  readonly bindingSources: readonly string[];
  readonly prepare: (
    context: ViraRuntimeProfileContext,
  ) => ViraRuntimeProfilePreparation | Promise<ViraRuntimeProfilePreparation>;
  readonly commands?: Readonly<Record<string, ViraCommandAdapter>>;
}

export interface ViraRuntimeCapabilityRegistryIssue {
  readonly code: "INVALID_PROFILE" | "DUPLICATE_PROFILE" | "MISSING_CAPABILITY" | "AMBIGUOUS_PROFILE";
  readonly path: string;
  readonly message: string;
}

export type ViraRuntimeCapabilityRegistryResult =
  | { readonly ok: true; readonly value: ViraRuntimeCapabilityRegistry }
  | { readonly ok: false; readonly issue: ViraRuntimeCapabilityRegistryIssue };

export type ViraRuntimeCapabilityResolveResult =
  | { readonly ok: true; readonly value: ViraRuntimeCapabilityProfile }
  | { readonly ok: false; readonly issue: ViraRuntimeCapabilityRegistryIssue };

export interface ViraRuntimeCapabilityRegistry {
  readonly profiles: readonly ViraRuntimeCapabilityProfile[];
  readonly resolve: (manifest: ViraDependencyManifest) => ViraRuntimeCapabilityResolveResult;
}

function issue(
  code: ViraRuntimeCapabilityRegistryIssue["code"],
  path: string,
  message: string,
): ViraRuntimeCapabilityRegistryIssue {
  return Object.freeze({ code, path, message });
}

function snapshotStrings(
  value: readonly string[],
  path: string,
): { readonly ok: true; readonly value: readonly string[] } | { readonly ok: false; readonly issue: ViraRuntimeCapabilityRegistryIssue } {
  if (!Array.isArray(value)) return { ok: false, issue: issue("INVALID_PROFILE", path, "capability refs must be an array") };
  const output: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item !== "string" || item.length === 0 || item.length > 4_096) {
      return { ok: false, issue: issue("INVALID_PROFILE", `${path}[${index}]`, "capability ref must be a bounded non-empty string") };
    }
    if (seen.has(item)) {
      return { ok: false, issue: issue("INVALID_PROFILE", `${path}[${index}]`, "capability refs must be unique") };
    }
    seen.add(item);
    output.push(item);
  }
  return { ok: true, value: Object.freeze(output) };
}

function snapshotCommands(
  value: Readonly<Record<string, ViraCommandAdapter>> | undefined,
  path: string,
): { readonly ok: true; readonly value: Readonly<Record<string, ViraCommandAdapter>> } | { readonly ok: false; readonly issue: ViraRuntimeCapabilityRegistryIssue } {
  const output = Object.create(null) as Record<string, ViraCommandAdapter>;
  if (value === undefined) return { ok: true, value: Object.freeze(output) };
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, issue: issue("INVALID_PROFILE", path, "commands must be a command-adapter record") };
  }
  for (const key of Object.keys(value)) {
    const adapter = value[key];
    if (key.length === 0 || key.length > 4_096 || typeof adapter !== "function") {
      return { ok: false, issue: issue("INVALID_PROFILE", `${path}.${key}`, "command alias must map to a trusted adapter") };
    }
    output[key] = adapter;
  }
  return { ok: true, value: Object.freeze(output) };
}

function covers(profileValues: readonly string[], required: readonly string[]): boolean {
  const available = new Set(profileValues);
  for (const item of required) if (!available.has(item)) return false;
  return true;
}

export function createViraRuntimeCapabilityRegistry(
  input: readonly ViraRuntimeCapabilityProfile[],
): ViraRuntimeCapabilityRegistryResult {
  if (!Array.isArray(input)) {
    return { ok: false, issue: issue("INVALID_PROFILE", "$.profiles", "profiles must be an array") };
  }
  const profiles: ViraRuntimeCapabilityProfile[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < input.length; index += 1) {
    const profile = input[index];
    if (!profile || typeof profile !== "object" || typeof profile.id !== "string" || profile.id.length === 0 || profile.id.length > 512 || typeof profile.prepare !== "function") {
      return { ok: false, issue: issue("INVALID_PROFILE", `$.profiles[${index}]`, "profile requires bounded id and prepare function") };
    }
    if (ids.has(profile.id)) {
      return { ok: false, issue: issue("DUPLICATE_PROFILE", `$.profiles[${index}].id`, "profile ids must be unique") };
    }
    const components = snapshotStrings(profile.componentRefs, `$.profiles[${index}].componentRefs`);
    if (!components.ok) return components;
    const actions = snapshotStrings(profile.actionEvents, `$.profiles[${index}].actionEvents`);
    if (!actions.ok) return actions;
    const bindings = snapshotStrings(profile.bindingSources, `$.profiles[${index}].bindingSources`);
    if (!bindings.ok) return bindings;
    const commands = snapshotCommands(profile.commands, `$.profiles[${index}].commands`);
    if (!commands.ok) return commands;
    ids.add(profile.id);
    profiles.push(Object.freeze({
      id: profile.id,
      componentRefs: components.value,
      actionEvents: actions.value,
      bindingSources: bindings.value,
      prepare: profile.prepare,
      commands: commands.value,
    }));
  }

  const registry: ViraRuntimeCapabilityRegistry = {
    profiles: Object.freeze(profiles),
    resolve(manifest): ViraRuntimeCapabilityResolveResult {
      const matches: ViraRuntimeCapabilityProfile[] = [];
      for (const profile of profiles) {
        if (
          covers(profile.componentRefs, manifest.componentRefs)
          && covers(profile.actionEvents, manifest.actionEvents)
          && covers(profile.bindingSources, manifest.bindingSources)
        ) matches.push(profile);
      }
      if (matches.length === 0) {
        return { ok: false, issue: issue("MISSING_CAPABILITY", "$.publication.manifest", "no trusted runtime profile covers all publication dependencies") };
      }
      if (matches.length !== 1) {
        return { ok: false, issue: issue("AMBIGUOUS_PROFILE", "$.publication.manifest", "multiple trusted runtime profiles cover the publication dependencies") };
      }
      return { ok: true, value: matches[0] as ViraRuntimeCapabilityProfile };
    },
  };
  return { ok: true, value: Object.freeze(registry) };
}
