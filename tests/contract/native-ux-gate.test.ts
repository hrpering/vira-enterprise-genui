import { test } from "vitest";
import assert from "node:assert/strict";
import { evaluateViraNativeUxGate, parseViraLocalizationSemantics } from "../../packages/native-ux-gate/src/index.js";

const localization = {
  version: "1",
  locale: "ar-SA",
  direction: "rtl",
  currency: "SAR",
  timeZone: "Asia/Riyadh",
  numberingSystem: "arab",
  dateStyle: "medium",
  timeStyle: "short",
  numberStyle: "currency",
} as const;

const evidence = [
  { version: "1", platform: "android", talkBack: true, fontScaling: true, composeSemantics: true },
  { version: "1", platform: "web", keyboardNavigation: true, aria: true, screenReader: true },
  { version: "1", platform: "ios", voiceOver: true, dynamicType: true, higBehavior: true },
] as const;

test("MASTER-19 accepts complete Web iOS Android accessibility evidence with localization semantics", () => {
  const result = evaluateViraNativeUxGate({ version: "1", localization, evidence });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.accepted, true);
  assert.deepEqual(result.value.platforms, ["web", "ios", "android"]);
  assert.equal(result.value.localization.direction, "rtl");
  assert.equal(result.value.localization.currency, "SAR");
});

test("accessibility failures are valid evidence but fail the acceptance gate", () => {
  const result = evaluateViraNativeUxGate({
    version: "1",
    localization,
    evidence: evidence.map((item) => item.platform === "ios" ? { ...item, voiceOver: false } : item),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.accepted, false);
  assert.deepEqual(result.value.failures.map((failure) => failure.code), ["IOS_VOICEOVER_REQUIRED"]);
});

test("all mandatory native accessibility dimensions fail independently", () => {
  const result = evaluateViraNativeUxGate({
    version: "1",
    localization,
    evidence: [
      { version: "1", platform: "web", keyboardNavigation: false, aria: false, screenReader: false },
      { version: "1", platform: "ios", voiceOver: false, dynamicType: false, higBehavior: false },
      { version: "1", platform: "android", talkBack: false, fontScaling: false, composeSemantics: false },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.accepted, false);
  assert.equal(result.value.failures.length, 9);
});

test("missing and duplicate platform evidence fails closed", () => {
  const missing = evaluateViraNativeUxGate({ version: "1", localization, evidence: evidence.slice(0, 2) });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.issue.code, "MISSING_PLATFORM");
  const duplicate = evaluateViraNativeUxGate({ version: "1", localization, evidence: [evidence[0], evidence[1], evidence[1]] });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.issue.code, "DUPLICATE_PLATFORM");
});

test("localization semantics reject malformed locale currency timezone and extra fields", () => {
  for (const invalid of [
    { ...localization, locale: "not a locale!!!" },
    { ...localization, currency: "sar" },
    { ...localization, timeZone: "../../secret" },
    { ...localization, secret: "must-not-enter-contract" },
  ]) {
    const parsed = parseViraLocalizationSemantics(invalid);
    assert.equal(parsed.ok, false);
    if (!parsed.ok) assert.equal(parsed.issue.code, "INVALID_LOCALIZATION");
  }
});

test("platform evidence rejects extra-field side channels", () => {
  const result = evaluateViraNativeUxGate({
    version: "1",
    localization,
    evidence: [
      evidence[0],
      { ...evidence[1], rawAriaTree: "should-not-be-portable" },
      evidence[2],
    ],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, "INVALID_EVIDENCE");
});
