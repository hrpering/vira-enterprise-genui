export const VIRA_NATIVE_UX_GATE_VERSION = "1" as const;
export const VIRA_NATIVE_UX_PLATFORMS = Object.freeze(["web", "ios", "android"] as const);
export type ViraNativeUxPlatform = (typeof VIRA_NATIVE_UX_PLATFORMS)[number];
export type ViraTextDirection = "ltr" | "rtl";
export type ViraDateTimeStyle = "short" | "medium" | "long" | "full";
export type ViraNumberStyle = "decimal" | "percent" | "currency";

export interface ViraLocalizationSemantics { readonly version: "1"; readonly locale: string; readonly direction: ViraTextDirection; readonly currency: string; readonly timeZone: string; readonly numberingSystem: string; readonly dateStyle: ViraDateTimeStyle; readonly timeStyle: ViraDateTimeStyle; readonly numberStyle: ViraNumberStyle; }
export interface ViraWebAccessibilityEvidence { readonly version: "1"; readonly platform: "web"; readonly keyboardNavigation: boolean; readonly aria: boolean; readonly screenReader: boolean; }
export interface ViraIosAccessibilityEvidence { readonly version: "1"; readonly platform: "ios"; readonly voiceOver: boolean; readonly dynamicType: boolean; readonly higBehavior: boolean; }
export interface ViraAndroidAccessibilityEvidence { readonly version: "1"; readonly platform: "android"; readonly talkBack: boolean; readonly fontScaling: boolean; readonly composeSemantics: boolean; }
export type ViraPlatformAccessibilityEvidence = ViraWebAccessibilityEvidence | ViraIosAccessibilityEvidence | ViraAndroidAccessibilityEvidence;
export interface ViraNativeUxGateInput { readonly version: "1"; readonly localization: ViraLocalizationSemantics; readonly evidence: readonly ViraPlatformAccessibilityEvidence[]; }

export type ViraNativeUxGateFailureCode = "WEB_KEYBOARD_REQUIRED" | "WEB_ARIA_REQUIRED" | "WEB_SCREEN_READER_REQUIRED" | "IOS_VOICEOVER_REQUIRED" | "IOS_DYNAMIC_TYPE_REQUIRED" | "IOS_HIG_REQUIRED" | "ANDROID_TALKBACK_REQUIRED" | "ANDROID_FONT_SCALING_REQUIRED" | "ANDROID_COMPOSE_SEMANTICS_REQUIRED";
export interface ViraNativeUxGateFailure { readonly platform: ViraNativeUxPlatform; readonly code: ViraNativeUxGateFailureCode; readonly path: string; readonly message: string; }
export interface ViraNativeUxGateReport { readonly version: "1"; readonly accepted: boolean; readonly localization: ViraLocalizationSemantics; readonly platforms: readonly ViraNativeUxPlatform[]; readonly failures: readonly ViraNativeUxGateFailure[]; }
export type ViraNativeUxGateIssueCode = "INVALID_INPUT" | "INVALID_LOCALIZATION" | "INVALID_EVIDENCE" | "MISSING_PLATFORM" | "DUPLICATE_PLATFORM";
export interface ViraNativeUxGateIssue { readonly code: ViraNativeUxGateIssueCode; readonly path: string; readonly message: string; }
export type ViraNativeUxGateFailureResult = { readonly ok: false; readonly issue: ViraNativeUxGateIssue };
export type ViraNativeUxGateResult = { readonly ok: true; readonly value: ViraNativeUxGateReport } | ViraNativeUxGateFailureResult;
export type ViraLocalizationSemanticsResult = { readonly ok: true; readonly value: ViraLocalizationSemantics } | ViraNativeUxGateFailureResult;

const localizationKeys = Object.freeze(["version", "locale", "direction", "currency", "timeZone", "numberingSystem", "dateStyle", "timeStyle", "numberStyle"] as const);
const webKeys = Object.freeze(["version", "platform", "keyboardNavigation", "aria", "screenReader"] as const);
const iosKeys = Object.freeze(["version", "platform", "voiceOver", "dynamicType", "higBehavior"] as const);
const androidKeys = Object.freeze(["version", "platform", "talkBack", "fontScaling", "composeSemantics"] as const);

function issue(code: ViraNativeUxGateIssueCode, path: string, message: string): ViraNativeUxGateFailureResult { return { ok: false, issue: Object.freeze({ code, path, message }) }; }
function plain(value: unknown): value is Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const proto = Object.getPrototypeOf(value); return proto === Object.prototype || proto === null; }
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }
function bounded(value: unknown, max = 128): value is string { return typeof value === "string" && value.length > 0 && value.length <= max; }
function locale(value: unknown): value is string { return bounded(value, 64) && /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?(?:-[A-Za-z0-9]{5,8})*$/.test(value); }
function currency(value: unknown): value is string { return typeof value === "string" && /^[A-Z]{3}$/.test(value); }
function timeZone(value: unknown): value is string { return bounded(value, 96) && (value === "UTC" || /^[A-Za-z_]+(?:\/[A-Za-z0-9._+-]+)+$/.test(value)); }
function numberingSystem(value: unknown): value is string { return typeof value === "string" && /^[a-z0-9]{3,8}$/.test(value); }
function dateTimeStyle(value: unknown): value is ViraDateTimeStyle { return value === "short" || value === "medium" || value === "long" || value === "full"; }
function numberStyle(value: unknown): value is ViraNumberStyle { return value === "decimal" || value === "percent" || value === "currency"; }
function boolean(value: unknown): value is boolean { return typeof value === "boolean"; }

export function parseViraLocalizationSemantics(raw: unknown): ViraLocalizationSemanticsResult {
  if (!plain(raw) || !exact(raw, localizationKeys)) return issue("INVALID_LOCALIZATION", "$.localization", "localization semantics must be an exact plain object");
  if (raw.version !== "1" || !locale(raw.locale) || (raw.direction !== "ltr" && raw.direction !== "rtl") || !currency(raw.currency) || !timeZone(raw.timeZone) || !numberingSystem(raw.numberingSystem) || !dateTimeStyle(raw.dateStyle) || !dateTimeStyle(raw.timeStyle) || !numberStyle(raw.numberStyle)) return issue("INVALID_LOCALIZATION", "$.localization", "localization semantics are invalid");
  return { ok: true, value: Object.freeze({ version: "1", locale: raw.locale, direction: raw.direction, currency: raw.currency, timeZone: raw.timeZone, numberingSystem: raw.numberingSystem, dateStyle: raw.dateStyle, timeStyle: raw.timeStyle, numberStyle: raw.numberStyle }) };
}

function parseEvidence(raw: unknown, index: number): ViraNativeUxGateFailureResult | { readonly ok: true; readonly value: ViraPlatformAccessibilityEvidence } {
  if (!plain(raw) || raw.version !== "1" || (raw.platform !== "web" && raw.platform !== "ios" && raw.platform !== "android")) return issue("INVALID_EVIDENCE", `$.evidence[${index}]`, "platform accessibility evidence is invalid");
  if (raw.platform === "web") {
    if (!exact(raw, webKeys) || !boolean(raw.keyboardNavigation) || !boolean(raw.aria) || !boolean(raw.screenReader)) return issue("INVALID_EVIDENCE", `$.evidence[${index}]`, "web evidence is invalid");
    return { ok: true, value: Object.freeze({ version: "1", platform: "web", keyboardNavigation: raw.keyboardNavigation, aria: raw.aria, screenReader: raw.screenReader }) };
  }
  if (raw.platform === "ios") {
    if (!exact(raw, iosKeys) || !boolean(raw.voiceOver) || !boolean(raw.dynamicType) || !boolean(raw.higBehavior)) return issue("INVALID_EVIDENCE", `$.evidence[${index}]`, "iOS evidence is invalid");
    return { ok: true, value: Object.freeze({ version: "1", platform: "ios", voiceOver: raw.voiceOver, dynamicType: raw.dynamicType, higBehavior: raw.higBehavior }) };
  }
  if (!exact(raw, androidKeys) || !boolean(raw.talkBack) || !boolean(raw.fontScaling) || !boolean(raw.composeSemantics)) return issue("INVALID_EVIDENCE", `$.evidence[${index}]`, "Android evidence is invalid");
  return { ok: true, value: Object.freeze({ version: "1", platform: "android", talkBack: raw.talkBack, fontScaling: raw.fontScaling, composeSemantics: raw.composeSemantics }) };
}

function failure(platform: ViraNativeUxPlatform, code: ViraNativeUxGateFailureCode, path: string, message: string): ViraNativeUxGateFailure { return Object.freeze({ platform, code, path, message }); }

export function evaluateViraNativeUxGate(raw: unknown): ViraNativeUxGateResult {
  if (!plain(raw) || !exact(raw, ["version", "localization", "evidence"]) || raw.version !== "1" || !Array.isArray(raw.evidence)) return issue("INVALID_INPUT", "$", "native UX gate input is invalid");
  const localizationResult = parseViraLocalizationSemantics(raw.localization); if (!localizationResult.ok) return localizationResult;
  if (raw.evidence.length !== 3) return issue("MISSING_PLATFORM", "$.evidence", "exactly one Web, iOS and Android evidence record is required");
  const byPlatform = new Map<ViraNativeUxPlatform, ViraPlatformAccessibilityEvidence>();
  for (let index = 0; index < raw.evidence.length; index += 1) { const parsed = parseEvidence(raw.evidence[index], index); if (!parsed.ok) return parsed; if (byPlatform.has(parsed.value.platform)) return issue("DUPLICATE_PLATFORM", `$.evidence[${index}].platform`, "duplicate platform evidence"); byPlatform.set(parsed.value.platform, parsed.value); }
  for (const platform of VIRA_NATIVE_UX_PLATFORMS) if (!byPlatform.has(platform)) return issue("MISSING_PLATFORM", "$.evidence", `missing ${platform} evidence`);
  const failures: ViraNativeUxGateFailure[] = [];
  const web = byPlatform.get("web") as ViraWebAccessibilityEvidence;
  if (!web.keyboardNavigation) failures.push(failure("web", "WEB_KEYBOARD_REQUIRED", "$.evidence.web.keyboardNavigation", "Web keyboard navigation must pass"));
  if (!web.aria) failures.push(failure("web", "WEB_ARIA_REQUIRED", "$.evidence.web.aria", "Web ARIA semantics must pass"));
  if (!web.screenReader) failures.push(failure("web", "WEB_SCREEN_READER_REQUIRED", "$.evidence.web.screenReader", "Web screen-reader behavior must pass"));
  const ios = byPlatform.get("ios") as ViraIosAccessibilityEvidence;
  if (!ios.voiceOver) failures.push(failure("ios", "IOS_VOICEOVER_REQUIRED", "$.evidence.ios.voiceOver", "iOS VoiceOver behavior must pass"));
  if (!ios.dynamicType) failures.push(failure("ios", "IOS_DYNAMIC_TYPE_REQUIRED", "$.evidence.ios.dynamicType", "iOS Dynamic Type behavior must pass"));
  if (!ios.higBehavior) failures.push(failure("ios", "IOS_HIG_REQUIRED", "$.evidence.ios.higBehavior", "iOS HIG behavior must pass"));
  const android = byPlatform.get("android") as ViraAndroidAccessibilityEvidence;
  if (!android.talkBack) failures.push(failure("android", "ANDROID_TALKBACK_REQUIRED", "$.evidence.android.talkBack", "Android TalkBack behavior must pass"));
  if (!android.fontScaling) failures.push(failure("android", "ANDROID_FONT_SCALING_REQUIRED", "$.evidence.android.fontScaling", "Android font scaling must pass"));
  if (!android.composeSemantics) failures.push(failure("android", "ANDROID_COMPOSE_SEMANTICS_REQUIRED", "$.evidence.android.composeSemantics", "Android Compose semantics must pass"));
  return { ok: true, value: Object.freeze({ version: "1", accepted: failures.length === 0, localization: localizationResult.value, platforms: VIRA_NATIVE_UX_PLATFORMS, failures: Object.freeze(failures) }) };
}
