import { test } from "vitest";
import assert from "node:assert/strict";
import { evaluateViraCrossPlatformConformance } from "../../packages/cross-platform-conformance/src/index.js";

const localization = { version: "1", locale: "tr-TR", direction: "ltr", currency: "TRY", timeZone: "Europe/Istanbul", numberingSystem: "latn", dateStyle: "medium", timeStyle: "short", numberStyle: "currency" } as const;

function snapshot(platform: "web" | "ios" | "android") {
  return {
    version: "1",
    platform,
    experienceId: "airline.flight.search",
    experienceVersion: "1.0.0",
    viewId: "results",
    componentSemantics: ["flight.result.list", "flight.result.card"],
    state: { selectedFlightId: "VX-977", filters: { directOnly: true } },
    bindings: [{ nodeId: "result-2", prop: "selected", source: "state.selectedFlightId" }],
    actions: [{ event: "select-flight", actionType: "flight.select" }],
    navigation: ["search", "results"],
    policyCalls: [{ provider: "airline.policy", effect: "allow", reasonCode: "selection-allowed" }],
    accessibility: [{ nodeId: "result-2", role: "button", label: "Select flight VX-977" }],
    localization,
    actionIntent: {
      version: "1",
      instanceId: "flight-instance-1",
      expectedStateRevision: 7,
      idempotencyKey: "flight-select-7",
      action: { version: "1", id: "select-flight-1", type: "flight.select", source: "user", payload: { flightId: "VX-977" } },
    },
    stateRevision: 7,
    outcome: "success",
  } as const;
}

test("one fixture is conformant when web, iOS and Android preserve canonical semantics", () => {
  const result = evaluateViraCrossPlatformConformance({ fixtureId: "select-flight", snapshots: [snapshot("android"), snapshot("web"), snapshot("ios")] as never });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.conformant, true);
  assert.deepEqual(result.value.platforms, ["web", "ios", "android"]);
  assert.deepEqual(result.value.mismatches, []);
});

test("ActionIntent payload drift is reported independently from presentation", () => {
  const android = snapshot("android");
  const result = evaluateViraCrossPlatformConformance({ fixtureId: "select-flight", snapshots: [snapshot("web"), snapshot("ios"), { ...android, actionIntent: { ...android.actionIntent, action: { ...android.actionIntent.action, payload: { flightId: "VX-983" } } } }] as never });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.conformant, false);
  assert.deepEqual(result.value.mismatches.map((item) => item.dimension), ["action-intent"]);
  assert.equal(result.value.mismatches[0]?.platform, "android");
});

test("suite reports accessibility localization revision and outcome drift as separate dimensions", () => {
  const ios = snapshot("ios");
  const result = evaluateViraCrossPlatformConformance({
    fixtureId: "select-flight",
    snapshots: [snapshot("web"), { ...ios, stateRevision: 8, outcome: "failure", accessibility: [{ nodeId: "result-2", role: "button", label: "Flight VX-977" }], localization: { ...localization, direction: "rtl" } }, snapshot("android")] as never,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.mismatches.map((item) => item.dimension), ["accessibility", "localization", "revision", "outcome"]);
});

test("exactly one web, iOS and Android snapshot is mandatory", () => {
  const duplicate = evaluateViraCrossPlatformConformance({ fixtureId: "select-flight", snapshots: [snapshot("web"), snapshot("web"), snapshot("android")] as never });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.issue.code, "DUPLICATE_PLATFORM");
  const missing = evaluateViraCrossPlatformConformance({ fixtureId: "select-flight", snapshots: [snapshot("web"), snapshot("ios")] as never });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.issue.code, "MISSING_PLATFORM");
});

test("snapshot extra fields fail closed instead of becoming hidden platform evidence", () => {
  const web = snapshot("web");
  const result = evaluateViraCrossPlatformConformance({ fixtureId: "select-flight", snapshots: [{ ...web, rawNativeTree: "hidden" }, snapshot("ios"), snapshot("android")] as never });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, "INVALID_SNAPSHOT");
});
