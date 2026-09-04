import type { ResolvedExperienceDescriptor } from "@vira-enterprise-genui/experience-resolver";
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
import { prepareStudioPublication } from "@vira-enterprise-genui/studio-publish";

export const VIRA_NATIVE_MOUNT_ENVELOPE_VERSION = "1" as const;
export type ViraNativePlatform = "ios" | "android";

export interface ViraNativeMountEnvelopeInput {
  readonly instanceId: string;
  readonly descriptor: ResolvedExperienceDescriptor;
  readonly brand: ViraBrandDefinition;
  readonly hostManifest: StudioHostCapabilityManifest;
}

export interface ViraNativeMountEnvelopePackIdentity {
  readonly id: string;
  readonly version: string;
  readonly entrypoint: string;
}

export interface ViraNativeMountEnvelopeArtifactIdentity {
  readonly id: string;
  readonly role: "studio-publication";
  readonly mediaType: "application/json";
  readonly digest: string;
}

export interface ViraNativeMountEnvelopeCapability {
  readonly version: string;
  readonly id: string;
}

export interface ViraNativeMountEnvelopeProp {
  readonly key: string;
  readonly type: "string" | "number" | "boolean" | "enum";
  readonly required: boolean;
  readonly bindable: boolean;
  readonly options?: readonly string[];
}

export interface ViraNativeMountEnvelopeEventPayloadField {
  readonly key: string;
  readonly type: "string" | "number" | "boolean" | "enum";
  readonly required: boolean;
  readonly options?: readonly string[];
}

export interface ViraNativeMountEnvelopeEvent {
  readonly name: string;
  readonly payload?: readonly ViraNativeMountEnvelopeEventPayloadField[];
}

export interface ViraNativeMountEnvelopeComponent {
  readonly ref: string;
  readonly implementationId: string;
  readonly props: readonly ViraNativeMountEnvelopeProp[];
  readonly slots: readonly string[];
  readonly events: readonly ViraNativeMountEnvelopeEvent[];
}

export interface ViraNativeMountEnvelopeActionMapping {
  readonly event: string;
  readonly actionType: string;
}

export interface ViraNativeMountEnvelopeDataSource {
  readonly kind: "state" | "domain" | "scope";
  readonly path: string;
  readonly valueType: "string" | "number" | "boolean" | "enum" | "array" | "object";
}

export interface ViraNativeMountEnvelopeBrand {
  readonly version: "1";
  readonly id: string;
  readonly components: readonly ViraNativeMountEnvelopeComponent[];
  readonly actions: readonly ViraNativeMountEnvelopeActionMapping[];
  readonly dataSources: readonly ViraNativeMountEnvelopeDataSource[];
}

export interface ViraNativeMountEnvelope<Platform extends ViraNativePlatform> {
  readonly version: typeof VIRA_NATIVE_MOUNT_ENVELOPE_VERSION;
  readonly instanceId: string;
  readonly deploymentId: string;
  readonly pack: ViraNativeMountEnvelopePackIdentity;
  readonly artifact: ViraNativeMountEnvelopeArtifactIdentity;
  readonly compatibility: {
    readonly hostId: string;
    readonly platform: Platform;
  };
  readonly host: {
    readonly version: "1";
    readonly id: string;
    readonly platform: Platform;
    readonly implementationIds: readonly string[];
    readonly capabilities: readonly ViraNativeMountEnvelopeCapability[];
  };
  readonly brand: ViraNativeMountEnvelopeBrand;
  readonly document: StudioBrandPackage["templates"][number]["document"];
}

export type ViraNativeMountEnvelopeStage =
  | "input"
  | "host"
  | "descriptor"
  | "brand"
  | "publication";

export type ViraNativeMountEnvelopeIssueCode =
  | "INVALID_INPUT"
  | "INVALID_INSTANCE_ID"
  | "INVALID_HOST_MANIFEST"
  | "NON_PLATFORM_HOST"
  | "INVALID_DESCRIPTOR"
  | "INSTANCE_MISMATCH"
  | "HOST_MISMATCH"
  | "INVALID_BRAND"
  | "INVALID_IMPLEMENTATIONS"
  | "UNSUPPORTED_IMPLEMENTATION"
  | "INVALID_PUBLICATION"
  | "FORGED_PUBLICATION";

export interface ViraNativeMountEnvelopeIssue {
  readonly stage: ViraNativeMountEnvelopeStage;
  readonly code: ViraNativeMountEnvelopeIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraNativeMountEnvelopeResult<Platform extends ViraNativePlatform> =
  | { readonly ok: true; readonly value: ViraNativeMountEnvelope<Platform> }
  | { readonly ok: false; readonly issue: ViraNativeMountEnvelopeIssue };

const INPUT_FIELDS = new Set(["instanceId", "descriptor", "brand", "hostManifest"]);
const DESCRIPTOR_FIELDS = new Set([
  "instanceId",
  "deploymentId",
  "pack",
  "artifact",
  "publication",
  "compatibility",
]);
const PACK_FIELDS = new Set(["id", "version", "entrypoint"]);
const ARTIFACT_FIELDS = new Set(["id", "role", "mediaType", "digest"]);
const COMPATIBILITY_FIELDS = new Set(["hostId", "platform"]);
const BRAND_FIELDS = new Set(["version", "package", "design", "policies", "implementations"]);
const IMPLEMENTATION_FIELDS = new Set(["component", "web", "ios", "android"]);

function failure<Platform extends ViraNativePlatform>(
  stage: ViraNativeMountEnvelopeStage,
  code: ViraNativeMountEnvelopeIssueCode,
  path: string,
  message: string,
): ViraNativeMountEnvelopeResult<Platform> {
  return { ok: false, issue: Object.freeze({ stage, code, path, message }) };
}

function dataObject(
  input: unknown,
  fields: ReadonlySet<string>,
): { readonly ok: true; readonly value: Readonly<Record<string, unknown>> } | { readonly ok: false } {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return { ok: false };
  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return { ok: false };
    if (Object.getOwnPropertySymbols(input).length > 0) return { ok: false };
    const keys = Object.keys(input);
    if (Object.getOwnPropertyNames(input).length !== keys.length) return { ok: false };
    if (keys.some((key) => !fields.has(key))) return { ok: false };
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

function jsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value: JsonObject, fields: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === fields.size && keys.every((key) => fields.has(key));
}

function boundedString(value: JsonValue | undefined): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4_096;
}

function implementationId(value: JsonValue | undefined): value is string {
  return typeof value === "string" && value.includes(".") && isSemanticNamespace(value);
}

function sameJson(left: JsonValue, right: JsonValue): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!sameJson(left[index]!, right[index]!)) return false;
    }
    return true;
  }
  const a = left as JsonObject;
  const b = right as JsonObject;
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length) return false;
  for (let index = 0; index < ak.length; index += 1) {
    const key = ak[index];
    if (!key || key !== bk[index] || !sameJson(a[key]!, b[key]!)) return false;
  }
  return true;
}

function freezeDeep<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeDeep(item);
    return Object.freeze(value);
  }
  for (const key of Object.keys(value)) freezeDeep((value as Record<string, unknown>)[key]);
  return Object.freeze(value);
}

function canonicalDescriptor(
  input: unknown,
  platform: ViraNativePlatform,
): { readonly ok: true; readonly value: JsonObject } | { readonly ok: false } {
  let parsed: ReturnType<typeof parseJsonValue>;
  try {
    parsed = parseJsonValue(input, "$.descriptor");
  } catch {
    return { ok: false };
  }
  if (!parsed.ok || !jsonObject(parsed.value) || !exactFields(parsed.value, DESCRIPTOR_FIELDS)) {
    return { ok: false };
  }
  const root = parsed.value;
  if (!boundedString(root.instanceId) || !boundedString(root.deploymentId)) return { ok: false };
  if (!jsonObject(root.pack) || !exactFields(root.pack, PACK_FIELDS)) return { ok: false };
  if (!boundedString(root.pack.id) || !boundedString(root.pack.version) || !boundedString(root.pack.entrypoint)) {
    return { ok: false };
  }
  if (!jsonObject(root.artifact) || !exactFields(root.artifact, ARTIFACT_FIELDS)) return { ok: false };
  if (
    !boundedString(root.artifact.id)
    || root.artifact.role !== "studio-publication"
    || root.artifact.mediaType !== "application/json"
    || !boundedString(root.artifact.digest)
  ) {
    return { ok: false };
  }
  if (!jsonObject(root.compatibility) || !exactFields(root.compatibility, COMPATIBILITY_FIELDS)) return { ok: false };
  if (!boundedString(root.compatibility.hostId) || root.compatibility.platform !== platform) return { ok: false };
  if (!jsonObject(root.publication)) return { ok: false };
  return { ok: true, value: root };
}

function canonicalBrand<Platform extends ViraNativePlatform>(
  input: unknown,
  host: StudioHostCapabilityManifest,
  platform: Platform,
):
  | {
      readonly ok: true;
      readonly package: StudioBrandPackage;
      readonly components: readonly ViraNativeMountEnvelopeComponent[];
    }
  | { readonly ok: false; readonly result: ViraNativeMountEnvelopeResult<Platform> } {
  let parsedBrand: ReturnType<typeof parseJsonValue>;
  try {
    parsedBrand = parseJsonValue(input, "$.brand");
  } catch {
    return { ok: false, result: failure("brand", "INVALID_BRAND", "$.brand", "Vira Brand definition could not be inspected safely") };
  }
  if (
    !parsedBrand.ok
    || !jsonObject(parsedBrand.value)
    || !exactFields(parsedBrand.value, BRAND_FIELDS)
    || parsedBrand.value.version !== VIRA_BRAND_DEFINITION_VERSION
  ) {
    return { ok: false, result: failure("brand", "INVALID_BRAND", "$.brand", `${platform} mount requires canonical Vira Brand data`) };
  }
  const root = parsedBrand.value;
  const brandPackage = createStudioBrandPackage(root.package);
  if (!brandPackage.ok) {
    return { ok: false, result: failure("brand", "INVALID_BRAND", "$.brand.package", "Vira Brand package is invalid") };
  }

  const implementations = root.implementations;
  if (!Array.isArray(implementations)) {
    return { ok: false, result: failure("brand", "INVALID_IMPLEMENTATIONS", "$.brand.implementations", "brand implementation mappings must be canonical JSON") };
  }

  const catalogRefs = new Set(brandPackage.value.components.components.map((component) => component.ref));
  const byComponent = new Map<string, string>();
  for (const entry of implementations) {
    if (!jsonObject(entry) || !exactFields(entry, IMPLEMENTATION_FIELDS)) {
      return { ok: false, result: failure("brand", "INVALID_IMPLEMENTATIONS", "$.brand.implementations", "brand implementation mapping shape is invalid") };
    }
    if (
      typeof entry.component !== "string"
      || !catalogRefs.has(entry.component)
      || byComponent.has(entry.component)
      || !implementationId(entry.web)
      || !implementationId(entry.ios)
      || !implementationId(entry.android)
    ) {
      return { ok: false, result: failure("brand", "INVALID_IMPLEMENTATIONS", "$.brand.implementations", "brand implementation mappings do not exactly match the active catalog") };
    }
    const selected = entry[platform];
    if (typeof selected !== "string" || !host.implementationIds.includes(selected)) {
      return { ok: false, result: failure("brand", "UNSUPPORTED_IMPLEMENTATION", "$.brand.implementations", `brand requires a ${platform} implementation not supported by the active Host Manifest`) };
    }
    byComponent.set(entry.component, selected);
  }
  if (byComponent.size !== brandPackage.value.components.components.length) {
    return { ok: false, result: failure("brand", "INVALID_IMPLEMENTATIONS", "$.brand.implementations", `brand ${platform} implementation mappings must exactly cover the active catalog`) };
  }

  const components = brandPackage.value.components.components.map((component) => Object.freeze({
    ref: component.ref,
    implementationId: byComponent.get(component.ref)!,
    props: Object.freeze(component.props.map((prop) => Object.freeze({
      key: prop.key,
      type: prop.type,
      required: prop.required,
      bindable: prop.bindable,
      ...(prop.options === undefined ? {} : { options: Object.freeze([...prop.options]) }),
    }))),
    slots: Object.freeze(component.slots.map((slot) => slot.name)),
    events: Object.freeze(component.events.map((event) => Object.freeze({
      name: event.name,
      ...(event.payload === undefined ? {} : {
        payload: Object.freeze(event.payload.map((field) => Object.freeze({
          key: field.key,
          type: field.type,
          required: field.required,
          ...(field.options === undefined ? {} : { options: Object.freeze([...field.options]) }),
        }))),
      }),
    }))),
  }));

  return { ok: true, package: brandPackage.value, components: Object.freeze(components) };
}

export function createViraNativeMountEnvelope<Platform extends ViraNativePlatform>(
  input: ViraNativeMountEnvelopeInput,
  platform: Platform,
): ViraNativeMountEnvelopeResult<Platform> {
  const root = dataObject(input, INPUT_FIELDS);
  if (!root.ok) {
    return failure("input", "INVALID_INPUT", "$", `${platform} mount envelope input must be a plain own-data object with exact fields`);
  }
  if (typeof root.value.instanceId !== "string" || root.value.instanceId.length < 1 || root.value.instanceId.length > 4_096) {
    return failure("input", "INVALID_INSTANCE_ID", "$.instanceId", `${platform} mount requires an exact bounded instanceId`);
  }

  let hostResult: ReturnType<typeof createStudioHostCapabilityManifest>;
  try {
    hostResult = createStudioHostCapabilityManifest(root.value.hostManifest);
  } catch {
    return failure("host", "INVALID_HOST_MANIFEST", "$.hostManifest", `${platform} Host Manifest could not be inspected safely`);
  }
  if (!hostResult.ok) {
    return failure("host", "INVALID_HOST_MANIFEST", "$.hostManifest", `${platform} Host Manifest is invalid`);
  }
  const host = hostResult.value;
  if (host.platform !== platform) {
    return failure("host", "NON_PLATFORM_HOST", "$.hostManifest.platform", `Vira native mount requires platform ${platform}`);
  }

  const descriptor = canonicalDescriptor(root.value.descriptor, platform);
  if (!descriptor.ok) {
    return failure("descriptor", "INVALID_DESCRIPTOR", "$.descriptor", "resolved Experience descriptor is invalid for native mounting");
  }
  if (descriptor.value.instanceId !== root.value.instanceId) {
    return failure("descriptor", "INSTANCE_MISMATCH", "$.descriptor.instanceId", "resolved Experience descriptor belongs to a different instance");
  }
  const compatibility = descriptor.value.compatibility as JsonObject;
  if (compatibility.hostId !== host.id || compatibility.platform !== platform) {
    return failure("descriptor", "HOST_MISMATCH", "$.descriptor.compatibility", "resolved Experience descriptor belongs to a different Host Capability identity");
  }

  const brand = canonicalBrand(root.value.brand, host, platform);
  if (!brand.ok) return brand.result;

  const publication = descriptor.value.publication as JsonObject;
  const rebuilt = prepareStudioPublication({
    document: publication.document,
    componentCatalog: brand.package.components,
    bindingSourceCatalog: brand.package.dataSources,
    actionAdapter: brand.package.actions,
  });
  if (!rebuilt.ok) {
    return failure("publication", "INVALID_PUBLICATION", "$.descriptor.publication", "resolved Studio publication failed canonical validation");
  }
  let rebuiltJson: ReturnType<typeof parseJsonValue>;
  try {
    rebuiltJson = parseJsonValue(rebuilt.value);
  } catch {
    return failure("publication", "INVALID_PUBLICATION", "$.descriptor.publication", "canonical Studio publication could not be projected safely");
  }
  if (!rebuiltJson.ok || !jsonObject(rebuiltJson.value) || !sameJson(publication, rebuiltJson.value)) {
    return failure("publication", "FORGED_PUBLICATION", "$.descriptor.publication", "resolved Studio publication does not match canonical compilation");
  }

  const pack = descriptor.value.pack as JsonObject;
  const artifact = descriptor.value.artifact as JsonObject;
  const envelope: ViraNativeMountEnvelope<Platform> = {
    version: VIRA_NATIVE_MOUNT_ENVELOPE_VERSION,
    instanceId: root.value.instanceId,
    deploymentId: descriptor.value.deploymentId as string,
    pack: Object.freeze({
      id: pack.id as string,
      version: pack.version as string,
      entrypoint: pack.entrypoint as string,
    }),
    artifact: Object.freeze({
      id: artifact.id as string,
      role: "studio-publication",
      mediaType: "application/json",
      digest: artifact.digest as string,
    }),
    compatibility: Object.freeze({ hostId: host.id, platform }),
    host: Object.freeze({
      version: "1",
      id: host.id,
      platform,
      implementationIds: Object.freeze([...host.implementationIds]),
      capabilities: Object.freeze(host.capabilities.map((capability) => Object.freeze({
        version: capability.version,
        id: capability.id,
      }))),
    }),
    brand: Object.freeze({
      version: "1",
      id: brand.package.brand.id,
      components: brand.components,
      actions: Object.freeze(brand.package.actions.mappings.map((mapping) => Object.freeze({
        event: mapping.event,
        actionType: mapping.actionType,
      }))),
      dataSources: Object.freeze(brand.package.dataSources.sources.map((source) => Object.freeze({
        kind: source.kind,
        path: source.path,
        valueType: source.valueType,
      }))),
    }),
    document: rebuilt.value.document,
  };

  return { ok: true, value: freezeDeep(envelope) };
}
