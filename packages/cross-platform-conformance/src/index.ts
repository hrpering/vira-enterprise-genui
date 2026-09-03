import type { ViraActionIntent } from "@vira-enterprise-genui/action-boundary";
import { parseViraLocalizationSemantics, type ViraLocalizationSemantics } from "@vira-enterprise-genui/native-ux-gate";
import { parseJsonValue, type JsonObject, type JsonValue } from "@vira-enterprise-genui/protocol";

export const VIRA_CROSS_PLATFORM_CONFORMANCE_VERSION = "1" as const;
export const VIRA_CONFORMANCE_PLATFORMS = Object.freeze(["web", "ios", "android"] as const);
export type ViraConformancePlatform = (typeof VIRA_CONFORMANCE_PLATFORMS)[number];

export interface ViraConformancePolicyCall { readonly provider: string; readonly effect: "allow" | "deny" | "challenge" | "transform"; readonly reasonCode: string; }
export interface ViraConformanceAccessibilityNode { readonly nodeId: string; readonly role: string; readonly label: string; readonly value?: string; readonly hint?: string; readonly disabled?: boolean; }
export interface ViraPlatformSemanticSnapshot {
  readonly version: "1";
  readonly platform: ViraConformancePlatform;
  readonly experienceId: string;
  readonly experienceVersion: string;
  readonly viewId: string;
  readonly componentSemantics: readonly string[];
  readonly state: JsonObject;
  readonly bindings: readonly JsonValue[];
  readonly actions: readonly JsonValue[];
  readonly navigation: readonly string[];
  readonly policyCalls: readonly ViraConformancePolicyCall[];
  readonly accessibility: readonly ViraConformanceAccessibilityNode[];
  readonly localization: ViraLocalizationSemantics;
  readonly actionIntent: ViraActionIntent;
  readonly stateRevision: number;
  readonly outcome: "neutral" | "success" | "failure";
}

export type ViraConformanceDimension = "experience" | "component-semantics" | "state" | "bindings" | "actions" | "navigation" | "policy-calls" | "accessibility" | "localization" | "action-intent" | "revision" | "outcome";
export interface ViraConformanceMismatch { readonly dimension: ViraConformanceDimension; readonly platform: Exclude<ViraConformancePlatform, "web">; readonly path: string; readonly message: string; }
export interface ViraCrossPlatformConformanceReport { readonly version: "1"; readonly fixtureId: string; readonly baseline: "web"; readonly platforms: readonly ViraConformancePlatform[]; readonly conformant: boolean; readonly mismatches: readonly ViraConformanceMismatch[]; }
export type ViraCrossPlatformConformanceIssueCode = "INVALID_INPUT" | "INVALID_FIXTURE_ID" | "INVALID_SNAPSHOT" | "MISSING_PLATFORM" | "DUPLICATE_PLATFORM";
export interface ViraCrossPlatformConformanceIssue { readonly code: ViraCrossPlatformConformanceIssueCode; readonly path: string; readonly message: string; }
export type ViraCrossPlatformConformanceResult = { readonly ok: true; readonly value: ViraCrossPlatformConformanceReport } | { readonly ok: false; readonly issue: ViraCrossPlatformConformanceIssue };

const snapshotKeys = Object.freeze(["version", "platform", "experienceId", "experienceVersion", "viewId", "componentSemantics", "state", "bindings", "actions", "navigation", "policyCalls", "accessibility", "localization", "actionIntent", "stateRevision", "outcome"] as const);
const policyKeys = Object.freeze(["provider", "effect", "reasonCode"] as const);
const accessibilityRequiredKeys = Object.freeze(["nodeId", "role", "label"] as const);
const accessibilityOptionalKeys = Object.freeze(["value", "hint", "disabled"] as const);

function fail(code: ViraCrossPlatformConformanceIssueCode, path: string, message: string): ViraCrossPlatformConformanceResult { return { ok: false, issue: Object.freeze({ code, path, message }) }; }
function plain(value: unknown): value is Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const proto = Object.getPrototypeOf(value); return proto === Object.prototype || proto === null; }
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }
function onlyKnown(value: Record<string, unknown>, required: readonly string[], optional: readonly string[]): boolean { const keys = Object.keys(value); return required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key)); }
function bounded(value: unknown, max = 256): value is string { return typeof value === "string" && value.length > 0 && value.length <= max; }
function platform(value: unknown): value is ViraConformancePlatform { return value === "web" || value === "ios" || value === "android"; }
function safeRevision(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function json(value: unknown): JsonValue | undefined { const parsed = parseJsonValue(value); return parsed.ok ? parsed.value : undefined; }
function jsonEqual(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== typeof right) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) if (!jsonEqual(left[index]!, right[index]!)) return false;
    return true;
  }
  if (typeof left !== "object" || typeof right !== "object") return false;
  const leftKeys = Object.keys(left).sort(); const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) { if (leftKeys[index] !== rightKeys[index]) return false; const key = leftKeys[index]!; if (!jsonEqual((left as JsonObject)[key]!, (right as JsonObject)[key]!)) return false; }
  return true;
}
function jsonArray(value: unknown): readonly JsonValue[] | undefined { if (!Array.isArray(value)) return undefined; const out: JsonValue[] = []; for (const item of value) { const parsed = json(item); if (parsed === undefined) return undefined; out.push(parsed); } return Object.freeze(out); }
function stringArray(value: unknown): readonly string[] | undefined { if (!Array.isArray(value)) return undefined; const out: string[] = []; for (const item of value) { if (!bounded(item)) return undefined; out.push(item); } return Object.freeze(out); }

function parseSnapshot(raw: unknown, index: number): ViraPlatformSemanticSnapshot | ViraCrossPlatformConformanceResult {
  if (!plain(raw) || !exact(raw, snapshotKeys)) return fail("INVALID_SNAPSHOT", `$.snapshots[${index}]`, "conformance snapshot must be an exact plain object");
  if (raw.version !== "1" || !platform(raw.platform) || !bounded(raw.experienceId) || !bounded(raw.experienceVersion) || !bounded(raw.viewId) || !safeRevision(raw.stateRevision) || (raw.outcome !== "neutral" && raw.outcome !== "success" && raw.outcome !== "failure")) return fail("INVALID_SNAPSHOT", `$.snapshots[${index}]`, "conformance snapshot identity is invalid");
  const state = json(raw.state); const bindings = jsonArray(raw.bindings); const actions = jsonArray(raw.actions); const componentSemantics = stringArray(raw.componentSemantics); const navigation = stringArray(raw.navigation); const actionIntent = json(raw.actionIntent);
  if (!state || Array.isArray(state) || !bindings || !actions || !componentSemantics || !navigation || !actionIntent || Array.isArray(actionIntent) || actionIntent === null) return fail("INVALID_SNAPSHOT", `$.snapshots[${index}]`, "conformance snapshot canonical data is invalid");
  const localization = parseViraLocalizationSemantics(raw.localization); if (!localization.ok) return fail("INVALID_SNAPSHOT", `$.snapshots[${index}].localization`, localization.issue.message);
  if (!Array.isArray(raw.policyCalls) || !Array.isArray(raw.accessibility)) return fail("INVALID_SNAPSHOT", `$.snapshots[${index}]`, "conformance policy/accessibility data is invalid");
  const policyCalls: ViraConformancePolicyCall[] = [];
  for (let p = 0; p < raw.policyCalls.length; p += 1) {
    const call = raw.policyCalls[p];
    if (!plain(call) || !exact(call, policyKeys) || !bounded(call.provider) || !bounded(call.reasonCode) || (call.effect !== "allow" && call.effect !== "deny" && call.effect !== "challenge" && call.effect !== "transform")) return fail("INVALID_SNAPSHOT", `$.snapshots[${index}].policyCalls[${p}]`, "policy call is invalid");
    policyCalls.push(Object.freeze({ provider: call.provider, effect: call.effect, reasonCode: call.reasonCode } as ViraConformancePolicyCall));
  }
  const accessibility: ViraConformanceAccessibilityNode[] = [];
  for (let a = 0; a < raw.accessibility.length; a += 1) {
    const node = raw.accessibility[a];
    if (!plain(node) || !onlyKnown(node, accessibilityRequiredKeys, accessibilityOptionalKeys) || !bounded(node.nodeId) || !bounded(node.role) || !bounded(node.label) || (node.value !== undefined && typeof node.value !== "string") || (node.hint !== undefined && typeof node.hint !== "string") || (node.disabled !== undefined && typeof node.disabled !== "boolean")) return fail("INVALID_SNAPSHOT", `$.snapshots[${index}].accessibility[${a}]`, "accessibility node is invalid");
    accessibility.push(Object.freeze({ nodeId: node.nodeId, role: node.role, label: node.label, ...(node.value === undefined ? {} : { value: node.value }), ...(node.hint === undefined ? {} : { hint: node.hint }), ...(node.disabled === undefined ? {} : { disabled: node.disabled }) } as ViraConformanceAccessibilityNode));
  }
  return Object.freeze({ version: "1", platform: raw.platform, experienceId: raw.experienceId, experienceVersion: raw.experienceVersion, viewId: raw.viewId, componentSemantics, state: state as JsonObject, bindings, actions, navigation, policyCalls: Object.freeze(policyCalls), accessibility: Object.freeze(accessibility), localization: localization.value, actionIntent: actionIntent as unknown as ViraActionIntent, stateRevision: raw.stateRevision, outcome: raw.outcome });
}

function primitiveArraysEqual(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
function jsonArraysEqual(left: readonly JsonValue[], right: readonly JsonValue[]): boolean { return left.length === right.length && left.every((value, index) => jsonEqual(value, right[index]!)); }
function addMismatch(out: ViraConformanceMismatch[], platformValue: Exclude<ViraConformancePlatform, "web">, dimension: ViraConformanceDimension, path: string, message: string): void { out.push(Object.freeze({ dimension, platform: platformValue, path, message })); }

export function evaluateViraCrossPlatformConformance(input: { readonly fixtureId: string; readonly snapshots: readonly ViraPlatformSemanticSnapshot[] }): ViraCrossPlatformConformanceResult {
  if (!input || typeof input !== "object" || !Array.isArray(input.snapshots)) return fail("INVALID_INPUT", "$", "conformance input is invalid");
  if (!bounded(input.fixtureId)) return fail("INVALID_FIXTURE_ID", "$.fixtureId", "fixtureId is invalid");
  if (input.snapshots.length !== 3) return fail("MISSING_PLATFORM", "$.snapshots", "exactly one web, ios and android snapshot is required");
  const byPlatform = new Map<ViraConformancePlatform, ViraPlatformSemanticSnapshot>();
  for (let index = 0; index < input.snapshots.length; index += 1) { const parsed = parseSnapshot(input.snapshots[index], index); if ("ok" in parsed) return parsed; if (byPlatform.has(parsed.platform)) return fail("DUPLICATE_PLATFORM", `$.snapshots[${index}].platform`, "duplicate platform snapshot"); byPlatform.set(parsed.platform, parsed); }
  for (const required of VIRA_CONFORMANCE_PLATFORMS) if (!byPlatform.has(required)) return fail("MISSING_PLATFORM", "$.snapshots", `missing ${required} snapshot`);
  const web = byPlatform.get("web")!; const mismatches: ViraConformanceMismatch[] = [];
  for (const p of ["ios", "android"] as const) {
    const candidate = byPlatform.get(p)!;
    if (web.experienceId !== candidate.experienceId || web.experienceVersion !== candidate.experienceVersion || web.viewId !== candidate.viewId) addMismatch(mismatches, p, "experience", `$.${p}.experience`, "Experience/view identity differs from web baseline");
    if (!primitiveArraysEqual(web.componentSemantics, candidate.componentSemantics)) addMismatch(mismatches, p, "component-semantics", `$.${p}.componentSemantics`, "component semantics differ from web baseline");
    if (!jsonEqual(web.state, candidate.state)) addMismatch(mismatches, p, "state", `$.${p}.state`, "state differs from web baseline");
    if (!jsonArraysEqual(web.bindings, candidate.bindings)) addMismatch(mismatches, p, "bindings", `$.${p}.bindings`, "bindings differ from web baseline");
    if (!jsonArraysEqual(web.actions, candidate.actions)) addMismatch(mismatches, p, "actions", `$.${p}.actions`, "actions differ from web baseline");
    if (!primitiveArraysEqual(web.navigation, candidate.navigation)) addMismatch(mismatches, p, "navigation", `$.${p}.navigation`, "navigation differs from web baseline");
    if (!jsonEqual(web.policyCalls as unknown as JsonValue, candidate.policyCalls as unknown as JsonValue)) addMismatch(mismatches, p, "policy-calls", `$.${p}.policyCalls`, "policy calls differ from web baseline");
    if (!jsonEqual(web.accessibility as unknown as JsonValue, candidate.accessibility as unknown as JsonValue)) addMismatch(mismatches, p, "accessibility", `$.${p}.accessibility`, "accessibility metadata differs from web baseline");
    if (!jsonEqual(web.localization as unknown as JsonValue, candidate.localization as unknown as JsonValue)) addMismatch(mismatches, p, "localization", `$.${p}.localization`, "localization semantics differ from web baseline");
    if (!jsonEqual(web.actionIntent as unknown as JsonValue, candidate.actionIntent as unknown as JsonValue)) addMismatch(mismatches, p, "action-intent", `$.${p}.actionIntent`, "canonical ActionIntent differs from web baseline");
    if (web.stateRevision !== candidate.stateRevision) addMismatch(mismatches, p, "revision", `$.${p}.stateRevision`, "state revision differs from web baseline");
    if (web.outcome !== candidate.outcome) addMismatch(mismatches, p, "outcome", `$.${p}.outcome`, "outcome differs from web baseline");
  }
  return { ok: true, value: Object.freeze({ version: "1", fixtureId: input.fixtureId, baseline: "web", platforms: VIRA_CONFORMANCE_PLATFORMS, conformant: mismatches.length === 0, mismatches: Object.freeze(mismatches) }) };
}
