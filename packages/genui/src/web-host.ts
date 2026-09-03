import {
  EXPERIENCE_RESOLVER_MAX_INSTANCES,
  type ExperienceResolver,
  type ResolvedExperienceDescriptor,
} from "@vira-enterprise-genui/experience-resolver";
import {
  isRuntimeSessionInstanceId,
  createRuntimeSessionState,
  transitionRuntimeSession,
  type RuntimeSessionConnectivity,
  type RuntimeSessionEvent,
  type RuntimeSessionState,
  type RuntimeSessionVisibility,
} from "@vira-enterprise-genui/runtime-core";
import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  createStudioBrandPackage,
  VIRA_BRAND_DEFINITION_VERSION,
  type StudioBrandPackage,
  type ViraBrandDefinition,
} from "@vira-enterprise-genui/studio-brand";
import {
  createStudioHostCapabilityManifest,
  type StudioHostCapabilityManifest,
} from "@vira-enterprise-genui/studio-host";
import type { StudioHostedDispatchResult } from "@vira-enterprise-genui/studio-host-runtime";
import type {
  StudioRuntimeReactRenderer,
  StudioRuntimeReactRenderResult,
} from "@vira-enterprise-genui/studio-runtime-react";
import {
  createViraExperienceRuntime,
  type ViraExperienceController,
} from "./runtime.js";

export const VIRA_WEB_HOST_VERSION = "1" as const;

export type ViraWebRendererRegistry = Readonly<Record<string, StudioRuntimeReactRenderer>>;

export interface ViraWebLifecycleSnapshot {
  readonly visibility: RuntimeSessionVisibility;
  readonly connectivity: RuntimeSessionConnectivity;
}

export interface ViraWebLifecycleSource {
  readonly snapshot: () => ViraWebLifecycleSnapshot;
  readonly subscribe: (listener: (event: RuntimeSessionEvent) => void) => () => void;
}

export interface ViraWebHostConfiguration {
  readonly manifest: unknown;
  readonly renderers: ViraWebRendererRegistry;
  readonly lifecycle: ViraWebLifecycleSource;
}

export interface ViraWebExperienceInput {
  readonly resolver: ExperienceResolver;
  readonly instanceId: string;
  readonly brand: ViraBrandDefinition;
  readonly runtimeState: unknown;
  readonly permissionPolicy: unknown;
  readonly host: unknown;
}

export type ViraWebHostIssueCode =
  | "INVALID_CONFIGURATION"
  | "UNKNOWN_CONFIGURATION_FIELD"
  | "INVALID_HOST_MANIFEST"
  | "NON_WEB_HOST"
  | "INVALID_RENDERER_REGISTRY"
  | "INVALID_LIFECYCLE_SOURCE"
  | "HOST_DISPOSED"
  | "INVALID_EXPERIENCE_INPUT"
  | "INVALID_INSTANCE_ID"
  | "INSTANCE_ALREADY_MOUNTED"
  | "INSTANCE_LIMIT_EXCEEDED"
  | "INVALID_RESOLVER"
  | "RESOLUTION_NOT_FOUND"
  | "INVALID_RESOLUTION"
  | "RESOLUTION_INSTANCE_MISMATCH"
  | "RESOLUTION_HOST_MISMATCH"
  | "INVALID_BRAND"
  | "INVALID_BRAND_IMPLEMENTATIONS"
  | "UNSUPPORTED_IMPLEMENTATION"
  | "LIFECYCLE_SNAPSHOT_FAILED"
  | "LIFECYCLE_SUBSCRIBE_FAILED"
  | "RUNTIME_CREATION_FAILED";

export interface ViraWebHostIssue {
  readonly code: ViraWebHostIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface ViraWebExperience {
  readonly instanceId: string;
  readonly capabilityHostId: string;
  readonly runtimeHostId: string;
  readonly controller: ViraExperienceController;
  readonly revision: () => number;
  readonly subscribe: (listener: () => void) => () => void;
  readonly sessionState: () => RuntimeSessionState;
  readonly subscribeSession: (listener: (state: RuntimeSessionState) => void) => () => void;
  readonly renderReact: (input?: {
    readonly onHostResult?: (result: StudioHostedDispatchResult) => void;
  }) => StudioRuntimeReactRenderResult;
  readonly isDisposed: () => boolean;
  readonly dispose: () => void;
}

export interface ViraWebHost {
  readonly version: typeof VIRA_WEB_HOST_VERSION;
  readonly manifest: StudioHostCapabilityManifest;
  readonly createExperience: (input: ViraWebExperienceInput) => ViraWebExperienceResult;
  readonly get: (instanceId: string) => ViraWebExperience | undefined;
  readonly release: (instanceId: string) => boolean;
  readonly isDisposed: () => boolean;
  readonly dispose: () => void;
}

export type CreateViraWebHostResult =
  | { readonly ok: true; readonly value: ViraWebHost }
  | { readonly ok: false; readonly issue: ViraWebHostIssue };

export type ViraWebExperienceResult =
  | { readonly ok: true; readonly value: ViraWebExperience }
  | { readonly ok: false; readonly issue: ViraWebHostIssue };

export interface ViraWebBrowserDocument {
  readonly visibilityState: string;
  readonly addEventListener: (type: string, listener: () => void) => void;
  readonly removeEventListener: (type: string, listener: () => void) => void;
}

export interface ViraWebBrowserWindow {
  readonly addEventListener: (type: string, listener: () => void) => void;
  readonly removeEventListener: (type: string, listener: () => void) => void;
}

export interface ViraWebBrowserNavigator {
  readonly onLine: boolean;
}

export interface ViraWebBrowserPlatform {
  readonly document: ViraWebBrowserDocument;
  readonly window: ViraWebBrowserWindow;
  readonly navigator: ViraWebBrowserNavigator;
}

export type ViraWebBrowserLifecycleIssueCode = "PLATFORM_UNAVAILABLE" | "INVALID_PLATFORM";

export interface ViraWebBrowserLifecycleIssue {
  readonly code: ViraWebBrowserLifecycleIssueCode;
  readonly message: string;
}

export type CreateViraWebBrowserLifecycleSourceResult =
  | { readonly ok: true; readonly value: ViraWebLifecycleSource }
  | { readonly ok: false; readonly issue: ViraWebBrowserLifecycleIssue };

const configurationFields = new Set(["manifest", "renderers", "lifecycle"]);
const experienceFields = new Set([
  "resolver",
  "instanceId",
  "brand",
  "runtimeState",
  "permissionPolicy",
  "host",
]);
const resolutionFields = new Set([
  "instanceId",
  "deploymentId",
  "pack",
  "artifact",
  "publication",
  "compatibility",
]);
const compatibilityFields = new Set(["hostId", "platform"]);
const brandFields = new Set(["version", "package", "design", "policies", "implementations"]);
const implementationFields = new Set(["component", "web", "ios", "android"]);
const TRUSTED_METHOD_PROTOTYPE_DEPTH_LIMIT = 64;

type TrustedMethod = (...args: readonly unknown[]) => unknown;

type DataObjectResult =
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false };

function issue(code: ViraWebHostIssueCode, path: string, message: string): ViraWebHostIssue {
  return Object.freeze({ code, path, message });
}

function failure(code: ViraWebHostIssueCode, path: string, message: string): ViraWebExperienceResult {
  return { ok: false, issue: issue(code, path, message) };
}

function readDataObject(input: unknown, fields?: ReadonlySet<string>): DataObjectResult {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return { ok: false };
  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return { ok: false };
    if (Object.getOwnPropertySymbols(input).length > 0) return { ok: false };
    const keys = Object.keys(input);
    if (Object.getOwnPropertyNames(input).length !== keys.length) return { ok: false };
    if (fields && keys.some((key) => !fields.has(key))) return { ok: false };
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !("value" in descriptor)) return { ok: false };
      output[key] = descriptor.value;
    }
    return { ok: true, value: output };
  } catch {
    return { ok: false };
  }
}

function findDataMethod(input: unknown, name: string): TrustedMethod | undefined {
  if (input === null || (typeof input !== "object" && typeof input !== "function")) return undefined;
  const visited = new Set<object>();
  let current: object | null = input as object;
  let depth = 0;
  try {
    while (current !== null) {
      if (visited.has(current) || depth >= TRUSTED_METHOD_PROTOTYPE_DEPTH_LIMIT) return undefined;
      visited.add(current);
      depth += 1;
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (descriptor) {
        return "value" in descriptor && typeof descriptor.value === "function"
          ? descriptor.value as TrustedMethod
          : undefined;
      }
      current = Object.getPrototypeOf(current) as object | null;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function readRendererRegistry(
  input: unknown,
  manifest: StudioHostCapabilityManifest,
): { readonly ok: true; readonly value: ReadonlyMap<string, StudioRuntimeReactRenderer> }
  | { readonly ok: false; readonly issue: ViraWebHostIssue } {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, issue: issue("INVALID_RENDERER_REGISTRY", "$.renderers", "web renderer registry must be a plain object") };
  }
  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      return { ok: false, issue: issue("INVALID_RENDERER_REGISTRY", "$.renderers", "web renderer registry must be a plain object") };
    }
    if (Object.getOwnPropertySymbols(input).length > 0) {
      return { ok: false, issue: issue("INVALID_RENDERER_REGISTRY", "$.renderers", "web renderer registry must use string data properties only") };
    }
    const actual = Object.keys(input);
    if (Object.getOwnPropertyNames(input).length !== actual.length) {
      return { ok: false, issue: issue("INVALID_RENDERER_REGISTRY", "$.renderers", "web renderer registry must use enumerable data properties only") };
    }
    const supported = new Set(manifest.implementationIds);
    if (actual.length !== supported.size || actual.some((key) => !supported.has(key))) {
      return { ok: false, issue: issue("INVALID_RENDERER_REGISTRY", "$.renderers", "web renderer registry must exactly match the Host Manifest implementation IDs") };
    }
    const output = new Map<string, StudioRuntimeReactRenderer>();
    for (const implementationId of manifest.implementationIds) {
      const descriptor = Object.getOwnPropertyDescriptor(input, implementationId);
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "function") {
        return { ok: false, issue: issue("INVALID_RENDERER_REGISTRY", "$.renderers", "every supported web implementation ID must resolve to a trusted local renderer") };
      }
      output.set(implementationId, descriptor.value as StudioRuntimeReactRenderer);
    }
    return { ok: true, value: output };
  } catch {
    return { ok: false, issue: issue("INVALID_RENDERER_REGISTRY", "$.renderers", "web renderer registry could not be inspected safely") };
  }
}

function readLifecycleSource(
  input: unknown,
): { readonly ok: true; readonly value: { readonly snapshot: TrustedMethod; readonly subscribe: TrustedMethod } }
  | { readonly ok: false; readonly issue: ViraWebHostIssue } {
  const snapshot = findDataMethod(input, "snapshot");
  const subscribe = findDataMethod(input, "subscribe");
  if (!snapshot || !subscribe) {
    return { ok: false, issue: issue("INVALID_LIFECYCLE_SOURCE", "$.lifecycle", "web lifecycle source must provide trusted snapshot and subscribe methods") };
  }
  return { ok: true, value: Object.freeze({ snapshot, subscribe }) };
}

function jsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function isImplementationId(value: JsonValue | undefined): value is string {
  return typeof value === "string" && value.includes(".") && isSemanticNamespace(value);
}

function canonicalResolution(
  input: unknown,
  expectedInstanceId: string,
  manifest: StudioHostCapabilityManifest,
): { readonly ok: true; readonly value: ResolvedExperienceDescriptor }
  | { readonly ok: false; readonly issue: ViraWebHostIssue } {
  let parsed: ReturnType<typeof parseJsonValue>;
  try {
    parsed = parseJsonValue(input, "$.resolution");
  } catch {
    return { ok: false, issue: issue("INVALID_RESOLUTION", "$.resolution", "resolved Experience descriptor could not be inspected safely") };
  }
  if (!parsed.ok || !jsonObject(parsed.value)) {
    return { ok: false, issue: issue("INVALID_RESOLUTION", "$.resolution", "resolver returned an invalid Experience descriptor") };
  }
  const root = parsed.value;
  const keys = Object.keys(root);
  if (keys.length !== resolutionFields.size || keys.some((key) => !resolutionFields.has(key))) {
    return { ok: false, issue: issue("INVALID_RESOLUTION", "$.resolution", "resolver returned an unexpected Experience descriptor shape") };
  }
  if (root.instanceId !== expectedInstanceId) {
    return { ok: false, issue: issue("RESOLUTION_INSTANCE_MISMATCH", "$.resolution.instanceId", "resolved Experience descriptor belongs to a different instance") };
  }
  if (!jsonObject(root.compatibility)) {
    return { ok: false, issue: issue("INVALID_RESOLUTION", "$.resolution.compatibility", "resolved Experience compatibility identity is invalid") };
  }
  const compatibilityKeys = Object.keys(root.compatibility);
  if (compatibilityKeys.length !== compatibilityFields.size || compatibilityKeys.some((key) => !compatibilityFields.has(key))) {
    return { ok: false, issue: issue("INVALID_RESOLUTION", "$.resolution.compatibility", "resolved Experience compatibility identity has an unexpected shape") };
  }
  if (root.compatibility.hostId !== manifest.id || root.compatibility.platform !== "web") {
    return { ok: false, issue: issue("RESOLUTION_HOST_MISMATCH", "$.resolution.compatibility", "resolved Experience was approved for a different Host Capability identity") };
  }
  if (!jsonObject(root.publication)) {
    return { ok: false, issue: issue("INVALID_RESOLUTION", "$.resolution.publication", "resolved Experience publication snapshot is invalid") };
  }
  return { ok: true, value: root as unknown as ResolvedExperienceDescriptor };
}

function bindBrandRenderers(
  input: unknown,
  manifest: StudioHostCapabilityManifest,
  installed: ReadonlyMap<string, StudioRuntimeReactRenderer>,
): { readonly ok: true; readonly brandPackage: StudioBrandPackage; readonly renderers: ViraWebRendererRegistry }
  | { readonly ok: false; readonly issue: ViraWebHostIssue } {
  const root = readDataObject(input, brandFields);
  if (!root.ok || root.value.version !== VIRA_BRAND_DEFINITION_VERSION) {
    return { ok: false, issue: issue("INVALID_BRAND", "$.brand", "web Experience requires a canonical Vira Brand definition") };
  }
  const brandPackage = createStudioBrandPackage(root.value.package);
  if (!brandPackage.ok) {
    return { ok: false, issue: issue("INVALID_BRAND", "$.brand.package", "Vira Brand package is invalid") };
  }

  let implementations: ReturnType<typeof parseJsonValue>;
  try {
    implementations = parseJsonValue(root.value.implementations, "$.brand.implementations");
  } catch {
    return { ok: false, issue: issue("INVALID_BRAND_IMPLEMENTATIONS", "$.brand.implementations", "brand implementation mappings could not be inspected safely") };
  }
  if (!implementations.ok || !Array.isArray(implementations.value)) {
    return { ok: false, issue: issue("INVALID_BRAND_IMPLEMENTATIONS", "$.brand.implementations", "brand implementation mappings must be canonical JSON data") };
  }

  const expectedComponents = brandPackage.value.components.components.map((component) => component.ref);
  if (implementations.value.length !== expectedComponents.length) {
    return { ok: false, issue: issue("INVALID_BRAND_IMPLEMENTATIONS", "$.brand.implementations", "brand web implementation mappings must exactly cover the active component catalog") };
  }
  const expected = new Set(expectedComponents);
  const byComponent = new Map<string, StudioRuntimeReactRenderer>();
  const supported = new Set(manifest.implementationIds);

  for (const entry of implementations.value) {
    if (!jsonObject(entry)) {
      return { ok: false, issue: issue("INVALID_BRAND_IMPLEMENTATIONS", "$.brand.implementations", "brand web implementation mapping is invalid") };
    }
    const keys = Object.keys(entry);
    if (keys.length !== implementationFields.size || keys.some((key) => !implementationFields.has(key))) {
      return { ok: false, issue: issue("INVALID_BRAND_IMPLEMENTATIONS", "$.brand.implementations", "brand web implementation mapping has an unexpected shape") };
    }
    if (
      typeof entry.component !== "string"
      || !isImplementationId(entry.web)
      || !isImplementationId(entry.ios)
      || !isImplementationId(entry.android)
      || !expected.has(entry.component)
      || byComponent.has(entry.component)
    ) {
      return { ok: false, issue: issue("INVALID_BRAND_IMPLEMENTATIONS", "$.brand.implementations", "brand platform implementation mapping does not exactly match the active component catalog") };
    }
    if (!supported.has(entry.web)) {
      return { ok: false, issue: issue("UNSUPPORTED_IMPLEMENTATION", "$.brand.implementations", "brand requires a web implementation not supported by the active Host Manifest") };
    }
    const renderer = installed.get(entry.web);
    if (!renderer) {
      return { ok: false, issue: issue("UNSUPPORTED_IMPLEMENTATION", "$.brand.implementations", "brand web implementation is not installed in the trusted renderer registry") };
    }
    byComponent.set(entry.component, renderer);
  }

  const rendererRecord: Record<string, StudioRuntimeReactRenderer> = Object.create(null) as Record<string, StudioRuntimeReactRenderer>;
  for (const component of expectedComponents) {
    const renderer = byComponent.get(component);
    if (!renderer) {
      return { ok: false, issue: issue("INVALID_BRAND_IMPLEMENTATIONS", "$.brand.implementations", "brand web implementation mappings are incomplete") };
    }
    rendererRecord[component] = renderer;
  }
  return {
    ok: true,
    brandPackage: brandPackage.value,
    renderers: Object.freeze(rendererRecord),
  };
}

function defaultBrowserPlatform(): ViraWebBrowserPlatform | undefined {
  try {
    const scope = globalThis as unknown as {
      readonly document?: ViraWebBrowserDocument;
      readonly window?: ViraWebBrowserWindow;
      readonly navigator?: ViraWebBrowserNavigator;
    };
    if (!scope.document || !scope.window || !scope.navigator) return undefined;
    return Object.freeze({ document: scope.document, window: scope.window, navigator: scope.navigator });
  } catch {
    return undefined;
  }
}

export function createViraWebBrowserLifecycleSource(
  platformInput?: ViraWebBrowserPlatform,
): CreateViraWebBrowserLifecycleSourceResult {
  const platform = platformInput ?? defaultBrowserPlatform();
  if (!platform) {
    return { ok: false, issue: Object.freeze({ code: "PLATFORM_UNAVAILABLE", message: "browser lifecycle platform is unavailable" }) };
  }

  const source: ViraWebLifecycleSource = Object.freeze({
    snapshot(): ViraWebLifecycleSnapshot {
      const visibility = platform.document.visibilityState === "visible" ? "foreground" : "background";
      if (typeof platform.navigator.onLine !== "boolean") throw new Error("invalid browser online signal");
      return Object.freeze({
        visibility,
        connectivity: platform.navigator.onLine ? "connected" : "disconnected",
      });
    },
    subscribe(listener): () => void {
      const onVisibility = (): void => {
        try {
          listener(Object.freeze({
            version: "1",
            type: platform.document.visibilityState === "visible" ? "resume" : "background",
          }));
        } catch {
          // Browser observers are outside the canonical session kernel boundary.
        }
      };
      const onOnline = (): void => {
        try {
          listener(Object.freeze({ version: "1", type: "reconnect" }));
        } catch {
          // Browser observers are outside the canonical session kernel boundary.
        }
      };
      const onOffline = (): void => {
        try {
          listener(Object.freeze({ version: "1", type: "disconnect" }));
        } catch {
          // Browser observers are outside the canonical session kernel boundary.
        }
      };

      let visibilityAttached = false;
      let onlineAttached = false;
      let offlineAttached = false;
      try {
        platform.document.addEventListener("visibilitychange", onVisibility);
        visibilityAttached = true;
        platform.window.addEventListener("online", onOnline);
        onlineAttached = true;
        platform.window.addEventListener("offline", onOffline);
        offlineAttached = true;
      } catch {
        try { if (visibilityAttached) platform.document.removeEventListener("visibilitychange", onVisibility); } catch {
          // Best-effort rollback of partially attached browser listeners.
        }
        try { if (onlineAttached) platform.window.removeEventListener("online", onOnline); } catch {
          // Best-effort rollback of partially attached browser listeners.
        }
        try { if (offlineAttached) platform.window.removeEventListener("offline", onOffline); } catch {
          // Best-effort rollback of partially attached browser listeners.
        }
        throw new Error("browser lifecycle subscription failed");
      }

      let active = true;
      return (): void => {
        if (!active) return;
        active = false;
        try { platform.document.removeEventListener("visibilitychange", onVisibility); } catch {
          // Browser listener cleanup is best-effort and cannot restore ownership.
        }
        try { platform.window.removeEventListener("online", onOnline); } catch {
          // Browser listener cleanup is best-effort and cannot restore ownership.
        }
        try { platform.window.removeEventListener("offline", onOffline); } catch {
          // Browser listener cleanup is best-effort and cannot restore ownership.
        }
      };
    },
  });

  try {
    source.snapshot();
  } catch {
    return { ok: false, issue: Object.freeze({ code: "INVALID_PLATFORM", message: "browser lifecycle platform could not provide a valid initial state" }) };
  }
  return { ok: true, value: source };
}

export function createViraWebHost(input: ViraWebHostConfiguration): CreateViraWebHostResult {
  const root = readDataObject(input, configurationFields);
  if (!root.ok) {
    return { ok: false, issue: issue("INVALID_CONFIGURATION", "$", "web Host configuration must be a plain own-data object with exact fields") };
  }

  let manifestResult: ReturnType<typeof createStudioHostCapabilityManifest>;
  try {
    manifestResult = createStudioHostCapabilityManifest(root.value.manifest);
  } catch {
    return { ok: false, issue: issue("INVALID_HOST_MANIFEST", "$.manifest", "web Host Manifest could not be inspected safely") };
  }
  if (!manifestResult.ok) {
    return { ok: false, issue: issue("INVALID_HOST_MANIFEST", "$.manifest", "web Host Manifest is invalid") };
  }
  const manifest = manifestResult.value;
  if (manifest.platform !== "web") {
    return { ok: false, issue: issue("NON_WEB_HOST", "$.manifest.platform", "Vira Web Host requires platform web") };
  }

  const renderers = readRendererRegistry(root.value.renderers, manifest);
  if (!renderers.ok) return renderers;
  const lifecycle = readLifecycleSource(root.value.lifecycle);
  if (!lifecycle.ok) return lifecycle;
  const lifecycleObject = root.value.lifecycle;

  const active = new Map<string, ViraWebExperience>();
  const pending = new Set<string>();
  let hostDisposed = false;

  const webHost: ViraWebHost = {
    version: VIRA_WEB_HOST_VERSION,
    manifest,
    createExperience(experienceInput: ViraWebExperienceInput): ViraWebExperienceResult {
      if (hostDisposed) return failure("HOST_DISPOSED", "$", "Vira Web Host is disposed");
      const fields = readDataObject(experienceInput, experienceFields);
      if (!fields.ok) return failure("INVALID_EXPERIENCE_INPUT", "$", "web Experience input must be a plain own-data object with exact fields");
      const instanceId = fields.value.instanceId;
      if (!isRuntimeSessionInstanceId(instanceId)) {
        return failure("INVALID_INSTANCE_ID", "$.instanceId", "web Experience requires a bounded exact instanceId");
      }
      if (active.has(instanceId) || pending.has(instanceId)) {
        return failure("INSTANCE_ALREADY_MOUNTED", "$.instanceId", "web Experience instance is already mounted or being created");
      }
      if (active.size + pending.size >= EXPERIENCE_RESOLVER_MAX_INSTANCES) {
        return failure("INSTANCE_LIMIT_EXCEEDED", "$.instanceId", `Vira Web Host may retain at most ${EXPERIENCE_RESOLVER_MAX_INSTANCES} active or pending instances`);
      }

      const resolverInput = fields.value.resolver;
      const resolverGet = findDataMethod(resolverInput, "get");
      const resolverRelease = findDataMethod(resolverInput, "release");
      if (!resolverGet || !resolverRelease) {
        return failure("INVALID_RESOLVER", "$.resolver", "web Experience requires the canonical resolver get/release interface");
      }

      pending.add(instanceId);
      try {
        let descriptorRaw: unknown;
        try {
          descriptorRaw = resolverGet.call(resolverInput, instanceId);
        } catch {
          return failure("INVALID_RESOLVER", "$.resolver", "resolver lookup failed safely");
        }
        if (descriptorRaw === undefined) {
          return failure("RESOLUTION_NOT_FOUND", "$.instanceId", "exact resolved Experience instance is not available");
        }
        const resolution = canonicalResolution(descriptorRaw, instanceId, manifest);
        if (!resolution.ok) return { ok: false, issue: resolution.issue };

        const brand = bindBrandRenderers(fields.value.brand, manifest, renderers.value);
        if (!brand.ok) return { ok: false, issue: brand.issue };

        let lifecycleSnapshot: unknown;
        try {
          lifecycleSnapshot = lifecycle.value.snapshot.call(lifecycleObject);
        } catch {
          return failure("LIFECYCLE_SNAPSHOT_FAILED", "$.lifecycle", "web lifecycle source failed to provide initial state");
        }
        const initialSession = createRuntimeSessionState(instanceId, lifecycleSnapshot);
        if (!initialSession.ok) {
          return failure("LIFECYCLE_SNAPSHOT_FAILED", "$.lifecycle", "web lifecycle source returned an invalid initial state");
        }

        const runtime = createViraExperienceRuntime({
          publication: resolution.value.publication,
          componentCatalog: brand.brandPackage.components,
          bindingSourceCatalog: brand.brandPackage.dataSources,
          actionAdapter: brand.brandPackage.actions,
          runtimeState: fields.value.runtimeState,
          permissionPolicy: fields.value.permissionPolicy,
          host: fields.value.host,
        });
        if (!runtime.ok) {
          return failure("RUNTIME_CREATION_FAILED", "$", "canonical GenUI runtime could not be created for the resolved web Experience");
        }
        if (hostDisposed) {
          runtime.value.dispose();
          return failure("HOST_DISPOSED", "$", "Vira Web Host was disposed during Experience creation");
        }

        let sessionState = initialSession.value;
        let experienceDisposed = false;
        const sessionListeners = new Set<(state: RuntimeSessionState) => void>();
        const notifySession = (): void => {
          for (const listener of [...sessionListeners]) {
            try {
              listener(sessionState);
            } catch {
              // Session observers are outside the canonical session kernel boundary.
            }
          }
        };

        let unsubscribeLifecycle: (() => void) | undefined;
        try {
          const candidate = lifecycle.value.subscribe.call(lifecycleObject, (event: unknown) => {
            if (experienceDisposed || hostDisposed) return;
            const transitioned = transitionRuntimeSession(sessionState, event);
            if (!transitioned.ok || !transitioned.value.changed) return;
            sessionState = transitioned.value.state;
            notifySession();
          });
          if (typeof candidate !== "function") {
            runtime.value.dispose();
            return failure("LIFECYCLE_SUBSCRIBE_FAILED", "$.lifecycle", "web lifecycle source subscribe must return an unsubscribe function");
          }
          unsubscribeLifecycle = candidate as () => void;
        } catch {
          runtime.value.dispose();
          return failure("LIFECYCLE_SUBSCRIBE_FAILED", "$.lifecycle", "web lifecycle source subscription failed safely");
        }
        if (hostDisposed) {
          try { unsubscribeLifecycle(); } catch {
            // Lifecycle teardown is best-effort after Host disposal wins the race.
          }
          runtime.value.dispose();
          return failure("HOST_DISPOSED", "$", "Vira Web Host was disposed during Experience creation");
        }

        const experience: ViraWebExperience = Object.freeze({
          instanceId,
          capabilityHostId: manifest.id,
          runtimeHostId: runtime.value.hostId,
          controller: runtime.value.controller,
          revision: runtime.value.revision,
          subscribe: runtime.value.subscribe,
          sessionState: () => sessionState,
          subscribeSession(listener): () => void {
            if (experienceDisposed || hostDisposed || typeof listener !== "function") return () => {};
            sessionListeners.add(listener);
            let subscribed = true;
            return (): void => {
              if (!subscribed) return;
              subscribed = false;
              sessionListeners.delete(listener);
            };
          },
          renderReact(renderInput = {}): StudioRuntimeReactRenderResult {
            return runtime.value.renderReact({
              renderers: brand.renderers,
              onHostResult: renderInput.onHostResult,
            });
          },
          isDisposed: () => experienceDisposed,
          dispose(): void {
            if (experienceDisposed) return;
            experienceDisposed = true;
            try { unsubscribeLifecycle?.(); } catch {
              // Lifecycle teardown cannot block deterministic runtime disposal.
            }
            unsubscribeLifecycle = undefined;
            sessionListeners.clear();
            runtime.value.dispose();
            if (active.get(instanceId) === experience) active.delete(instanceId);
            try { resolverRelease.call(resolverInput, instanceId); } catch {
              // Resolver release is best-effort after this Web Experience is already disposed.
            }
          },
        });
        active.set(instanceId, experience);
        return { ok: true, value: experience };
      } finally {
        pending.delete(instanceId);
      }
    },
    get(instanceId: string): ViraWebExperience | undefined {
      if (hostDisposed || typeof instanceId !== "string") return undefined;
      return active.get(instanceId);
    },
    release(instanceId: string): boolean {
      if (hostDisposed || typeof instanceId !== "string") return false;
      const experience = active.get(instanceId);
      if (!experience) return false;
      experience.dispose();
      return true;
    },
    isDisposed: () => hostDisposed,
    dispose(): void {
      if (hostDisposed) return;
      hostDisposed = true;
      for (const experience of [...active.values()]) experience.dispose();
      active.clear();
      pending.clear();
    },
  };

  return { ok: true, value: Object.freeze(webHost) };
}
