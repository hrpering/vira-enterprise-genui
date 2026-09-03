import type { ViraActionIntent } from "@vira-enterprise-genui/action-boundary";
import { parseJsonValue, type JsonObject, type JsonValue } from "@vira-enterprise-genui/protocol";

export const VIRA_CROSS_PLATFORM_CONFORMANCE_VERSION = "1" as const;
export const VIRA_CONFORMANCE_PLATFORMS = Object.freeze(["web", "ios", "android"] as const);
export type ViraConformancePlatform = (typeof VIRA_CONFORMANCE_PLATFORMS)[number];

export interface ViraConformancePolicyCall {
  readonly provider: string;
  readonly effect: "allow" | "deny" | "challenge" | "transform";
  readonly reasonCode: string;
}

export interface ViraConformanceAccessibilityNode {
  readonly nodeId: string;
  readonly role: string;
  readonly label: string;
  readonly value?: string;
  readonly hint?: string;
  readonly disabled?: boolean;
}

export interface ViraPlatformSemanticSnapshot {
  readonly version: typeof VIRA_CROSS_PLATFORM_CONFORMANCE_VERSION;
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
  readonly actionIntent: ViraActionIntent;
  readonly stateRevision: number;
  readonly outcome: "neutral" | "success" | "failure";
}

export type ViraConformanceDimension =
  | "experience"
  | "component-semantics"
  | "state"
  | "bindings"
  | "actions"
  | "navigation"
  | "policy-calls"
  | "accessibility"
  | "action-intent"
  | "revision"
  | "outcome";

export interface ViraConformanceMismatch {
  readonly dimension: ViraConformanceDimension;
  readonly platform: Exclude<ViraConformancePlatform, "web">;
  readonly path: string;
  readonly message: string;
}

export interface ViraCrossPlatformConformanceReport {
  readonly version: typeof VIRA_CROSS_PLATFORM_CONFORMANCE_VERSION;
  readonly fixtureId: string;
  readonly baseline: "web";
  readonly platforms: readonly ViraConformancePlatform[];
  readonly conformant: boolean;
  readonly mismatches: readonly ViraConformanceMismatch[];
}

export type ViraCrossPlatformConformanceIssueCode = "INVALID_INPUT" | "INVALID_FIXTURE_ID" | "INVALID_SNAPSHOT" | "MISSING_PLATFORM" | "DUPLICATE_PLATFORM";
export interface ViraCrossPlatformConformanceIssue { readonly code: ViraCrossPlatformConformanceIssueCode; readonly path: string; readonly message: string; }
export type ViraCrossPlatformConformanceResult =
  | { readonly ok: true; readonly value: ViraCrossPlatformConformanceReport }
  | { readonly ok: false; readonly issue: ViraCrossPlatformConformanceIssue };

function fail(code: ViraCrossPlatformConformanceIssueCode, path: string, message: string): ViraCrossPlatformConformanceResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}
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
  for (let index = 0; index < leftKeys.length; index += 1) {
    if (leftKeys[index] !== rightKeys[index]) return false;
    const key = leftKeys[index]!;
    if (!jsonEqual((left as JsonObject)[key]!, (right as JsonObject)[key]!)) return false;
  }
  return true;
}
function jsonArray(value: unknown): readonly JsonValue[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: JsonValue[] = [];
  for (let index = 0; index < value.length; index += 1) { const parsed = json(value[index]); if (parsed === undefined) return undefined; out.push(parsed); }
  return Object.freeze(out);
}
function stringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (let index = 0; index < value.length; index += 1) { if (!bounded(value[index])) return undefined; out.push(value[index] as string); }
  return Object.freeze(out);
}
function parseSnapshot(raw: unknown, index: number): ViraPlatformSemanticSnapshot | ViraCrossPlatformConformanceResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("INVALID_SNAPSHOT", `$.snapshots[${index}]`, "conformance snapshot must be an object");
  const value = raw as Record<string, unknown>;
  if (value.version !== "1" || !platform(value.platform) || !bounded(value.experienceId) || !bounded(value.experienceVersion) || !bounded(value.viewId) || !safeRevision(value.stateRevision) || (value.outcome !== "neutral" && value.outcome !== "success" && value.outcome !== "failure")) return fail("INVALID_SNAPSHOT", `$.snapshots[${index}]`, "conformance snapshot identity is invalid");
  const state = json(value.state); const bindings = jsonArray(value.bindings); const actions = jsonArray(value.actions); const componentSemantics = stringArray(value.componentSemantics); const navigation = stringArray(value.navigation);
  const actionIntent = json(value.actionIntent);
  if (!state || Array.isArray(state) || !bindings || !actions || !componentSemantics || !navigation || !actionIntent || Array.isArray(actionIntent) || actionIntent === null) return fail("INVALID_SNAPSHOT", `$.snapshots[${index}]`, "conformance snapshot canonical data is invalid");
  if (!Array.isArray(value.policyCalls) || !Array.isArray(value.accessibility)) return fail("INVALID_SNAPSHOT", `$.snapshots[${index}]`, "conformance policy/accessibility data is invalid");
  const policyCalls: ViraConformancePolicyCall[] = [];
  for (let p = 0; p < value.policyCalls.length; p += 1) { const call = value.policyCalls[p] as Record<string, unknown>; if (!call || !bounded(call.provider) || !bounded(call.reasonCode) || (call.effect !== "allow" && call.effect !== "deny" && call.effect !== "challenge" && call.effect !== "transform")) return fail("INVALID_SNAPSHOT", `$.snapshots[${index}].policyCalls[${p}]`, "policy call is invalid"); policyCalls.push(Object.freeze({ provider: call.provider, effect: call.effect, reasonCode: call.reasonCode } as ViraConformancePolicyCall)); }
  const accessibility: ViraConformanceAccessibilityNode[] = [];
  for (let a = 0; a < value.accessibility.length; a += 1) { const node = value.accessibility[a] as Record<string, unknown>; if (!node || !bounded(node.nodeId) || !bounded(node.role) || !bounded(node.label) || (node.value !== undefined && typeof node.value !== "string") || (node.hint !== undefined && typeof node.hint !== "string") || (node.disabled !== undefined && typeof node.disabled !== "boolean")) return fail("INVALID_SNAPSHOT", `$.snapshots[${index}].accessibility[${a}]`, "accessibility node is invalid"); accessibility.push(Object.freeze({ nodeId: node.nodeId, role: node.role, label: node.label, ...(node.value === undefined ? {} : { value: node.value }), ...(node.hint === undefined ? {} : { hint: node.hint }), ...(node.disabled === undefined ? {} : { disabled: node.disabled }) } as ViraConformanceAccessibilityNode)); }
  return Object.freeze({ version: "1", platform: value.platform, experienceId: value.experienceId, experienceVersion: value.experienceVersion, viewId: value.viewId, componentSemantics, state: state as JsonObject, bindings, actions, navigation, policyCalls: Object.freeze(policyCalls), accessibility: Object.freeze(accessibility), actionIntent: actionIntent as unknown as ViraActionIntent, stateRevision: value.stateRevision, outcome: value.outcome });
}
function primitiveArraysEqual(left: readonly string[], right: readonly string[]): boolean { if (left.length !== right.length) return false; for (let i = 0; i < left.length; i += 1) if (left[i] !== right[i]) return false; return true; }
function jsonArraysEqual(left: readonly JsonValue[], right: readonly JsonValue[]): boolean { if (left.length !== right.length) return false; for (let i = 0; i < left.length; i += 1) if (!jsonEqual(left[i]!, right[i]!)) return false; return true; }
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
    if (!jsonEqual(web.actionIntent as unknown as JsonValue, candidate.actionIntent as unknown as JsonValue)) addMismatch(mismatches, p, "action-intent", `$.${p}.actionIntent`, "canonical ActionIntent differs from web baseline");
    if (web.stateRevision !== candidate.stateRevision) addMismatch(mismatches, p, "revision", `$.${p}.stateRevision`, "state revision differs from web baseline");
    if (web.outcome !== candidate.outcome) addMismatch(mismatches, p, "outcome", `$.${p}.outcome`, "outcome differs from web baseline");
  }
  return { ok: true, value: Object.freeze({ version: "1", fixtureId: input.fixtureId, baseline: "web", platforms: VIRA_CONFORMANCE_PLATFORMS, conformant: mismatches.length === 0, mismatches: Object.freeze(mismatches) }) };
}
