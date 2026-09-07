import { parseViraApplicationExactReference, type ViraApplicationExactReference } from "@vira-enterprise-genui/application-package";
import type { ViraApplicationAiHostCompatibilityPlanV2 } from "./v2-types.js";

export const VIRA_EXTERNAL_AI_HOST_ADAPTER_VERSION = "1" as const;
export const VIRA_EXTERNAL_AI_HOST_FAMILIES = Object.freeze(["chatgpt", "copilot", "claude", "customer-agent"] as const);
export const VIRA_EXTERNAL_AI_HOST_FEATURES = Object.freeze(["render", "input", "resume", "human-task", "approval", "artifact"] as const);

export type ViraExternalAiHostFamily = (typeof VIRA_EXTERNAL_AI_HOST_FAMILIES)[number];
export type ViraExternalAiHostFeature = (typeof VIRA_EXTERNAL_AI_HOST_FEATURES)[number];

export interface ViraExternalAiHostAdapterProfile {
  readonly version: typeof VIRA_EXTERNAL_AI_HOST_ADAPTER_VERSION;
  readonly adapterId: string;
  readonly hostFamily: ViraExternalAiHostFamily;
  readonly viraVersion: string;
  readonly features: readonly ViraExternalAiHostFeature[];
  readonly requiredHostCapabilities: readonly string[];
  readonly protocolProjection: ViraApplicationExactReference;
}

export interface ViraExternalAiHostAdapterPlan {
  readonly version: typeof VIRA_EXTERNAL_AI_HOST_ADAPTER_VERSION;
  readonly adapterId: string;
  readonly hostFamily: ViraExternalAiHostFamily;
  readonly viraVersion: string;
  readonly features: readonly ViraExternalAiHostFeature[];
  readonly protocolProjection: ViraApplicationExactReference;
}

export type ViraExternalAiHostAdapterIssueCode =
  | "INVALID_INPUT"
  | "INVALID_PROFILE"
  | "HOST_VERSION_MISMATCH"
  | "MISSING_HOST_CAPABILITY"
  | "PROJECTION_NOT_COMPATIBLE";

export interface ViraExternalAiHostAdapterIssue {
  readonly code: ViraExternalAiHostAdapterIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraExternalAiHostAdapterResult =
  | { readonly ok: true; readonly value: ViraExternalAiHostAdapterPlan }
  | { readonly ok: false; readonly issue: ViraExternalAiHostAdapterIssue };

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const floatingVersions = new Set(["latest", "current", "stable", "head", "main", "next"]);
const profileKeys = Object.freeze(["version", "adapterId", "hostFamily", "viraVersion", "features", "requiredHostCapabilities", "protocolProjection"] as const);

function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function fail(code: ViraExternalAiHostAdapterIssueCode, path: string, message: string): ViraExternalAiHostAdapterResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function hostFamily(value: unknown): value is ViraExternalAiHostFamily {
  return value === "chatgpt" || value === "copilot" || value === "claude" || value === "customer-agent";
}

function feature(value: unknown): value is ViraExternalAiHostFeature {
  return value === "render" || value === "input" || value === "resume" || value === "human-task" || value === "approval" || value === "artifact";
}

function exactVersion(value: unknown): value is string {
  return typeof value === "string"
    && versionPattern.test(value)
    && !floatingVersions.has(value.toLowerCase())
    && !/(?:^|[._:+-])[xX](?:$|[._:+-])/.test(value)
    && !/\d[xX](?:$|[._:+-])/.test(value);
}

function uniqueStrings(value: unknown, predicate: (entry: unknown) => boolean, max = 64): value is readonly string[] {
  return Array.isArray(value)
    && value.length <= max
    && value.every(predicate)
    && new Set(value).size === value.length;
}

function referenceEqual(left: ViraApplicationExactReference, right: ViraApplicationExactReference): boolean {
  return left.id === right.id && left.versionRef === right.versionRef;
}

export function planViraExternalAiHostAdapter(input: unknown): ViraExternalAiHostAdapterResult {
  if (!plain(input) || !plain(input.compatibility) || !plain(input.profile)) {
    return fail("INVALID_INPUT", "$", "external AI-host adapter input is invalid");
  }
  const compatibility = input.compatibility as unknown as ViraApplicationAiHostCompatibilityPlanV2;
  const profileInput = input.profile;
  if (
    !exactKeys(profileInput, profileKeys)
    || profileInput.version !== VIRA_EXTERNAL_AI_HOST_ADAPTER_VERSION
    || typeof profileInput.adapterId !== "string"
    || !idPattern.test(profileInput.adapterId)
    || !hostFamily(profileInput.hostFamily)
    || !exactVersion(profileInput.viraVersion)
    || !uniqueStrings(profileInput.features, feature, VIRA_EXTERNAL_AI_HOST_FEATURES.length)
    || !uniqueStrings(profileInput.requiredHostCapabilities, (entry) => typeof entry === "string" && idPattern.test(entry))
  ) {
    return fail("INVALID_PROFILE", "$.profile", "external AI-host adapter profile is invalid");
  }

  const projection = parseViraApplicationExactReference(profileInput.protocolProjection);
  if (!projection.ok) return fail("INVALID_PROFILE", "$.profile.protocolProjection", projection.issue.message);

  if (!plain(compatibility.host) || compatibility.host.viraVersion !== profileInput.viraVersion) {
    return fail("HOST_VERSION_MISMATCH", "$.profile.viraVersion", "adapter profile Vira version does not match the evaluated host compatibility plan");
  }
  if (!Array.isArray(compatibility.host.capabilities) || !compatibility.host.capabilities.every((entry) => typeof entry === "string")) {
    return fail("INVALID_INPUT", "$.compatibility.host.capabilities", "evaluated host capabilities are invalid");
  }
  for (const required of profileInput.requiredHostCapabilities as readonly string[]) {
    if (!compatibility.host.capabilities.includes(required)) {
      return fail("MISSING_HOST_CAPABILITY", "$.profile.requiredHostCapabilities", `evaluated host is missing required adapter capability: ${required}`);
    }
  }
  if (!Array.isArray(compatibility.compatibleProtocolProjections)) {
    return fail("INVALID_INPUT", "$.compatibility.compatibleProtocolProjections", "evaluated compatible protocol projections are invalid");
  }
  const parsedCompatible: ViraApplicationExactReference[] = [];
  for (let index = 0; index < compatibility.compatibleProtocolProjections.length; index += 1) {
    const parsed = parseViraApplicationExactReference(compatibility.compatibleProtocolProjections[index]);
    if (!parsed.ok) return fail("INVALID_INPUT", `$.compatibility.compatibleProtocolProjections[${index}]`, "evaluated compatible projection is not exact");
    parsedCompatible.push(parsed.value);
  }
  if (!parsedCompatible.some((candidate) => referenceEqual(candidate, projection.value))) {
    return fail("PROJECTION_NOT_COMPATIBLE", "$.profile.protocolProjection", "adapter projection is not present in the evaluated compatible projection set");
  }

  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_EXTERNAL_AI_HOST_ADAPTER_VERSION,
      adapterId: profileInput.adapterId,
      hostFamily: profileInput.hostFamily,
      viraVersion: profileInput.viraVersion,
      features: Object.freeze([...(profileInput.features as readonly ViraExternalAiHostFeature[])]),
      protocolProjection: projection.value,
    }),
  };
}
