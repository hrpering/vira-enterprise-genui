import { test } from "vitest";
import assert from "node:assert/strict";
import { runViraCrossPlatformFixture } from "../../packages/cross-platform-conformance/src/runner.js";

const localization = { version: "1", locale: "tr-TR", direction: "ltr", currency: "TRY", timeZone: "Europe/Istanbul", numberingSystem: "latn", dateStyle: "medium", timeStyle: "short", numberStyle: "currency" } as const;

function snapshot(platform: "web" | "ios" | "android", flightId: string) {
  return {
    version: "1", platform, experienceId: "airline.flight.search", experienceVersion: "1.0.0", viewId: "results",
    componentSemantics: ["flight.result.card"], state: { selectedFlightId: flightId }, bindings: [],
    actions: [{ event: "select-flight", actionType: "flight.select" }], navigation: ["results"], policyCalls: [],
    accessibility: [{ nodeId: "result", role: "button", label: `Select ${flightId}` }], localization,
    actionIntent: { version: "1", instanceId: "fixture-instance", expectedStateRevision: 4, idempotencyKey: "fixture-idem", action: { version: "1", id: "select-flight", type: "flight.select", source: "user", payload: { flightId } } },
    stateRevision: 4, outcome: "success",
  } as const;
}

test("one canonical fixture is applied in web, ios, android order regardless of runner input order", async () => {
  const order: string[] = [];
  const fixture = { version: "1", id: "select-flight", input: { flightId: "VX-977" } } as const;
  const runner = (platform: "web" | "ios" | "android") => ({ version: "1" as const, platform, run: (value: typeof fixture) => { order.push(platform); return snapshot(platform, value.input.flightId); } });
  const result = await runViraCrossPlatformFixture({ fixture, runners: [runner("android"), runner("web"), runner("ios")] as never });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(order, ["web", "ios", "android"]);
  assert.equal(result.value.conformant, true);
});

test("one divergent peer host fails the shared fixture report instead of falling back", async () => {
  const fixture = { version: "1", id: "select-flight", input: { flightId: "VX-977" } } as const;
  const result = await runViraCrossPlatformFixture({ fixture, runners: [
    { version: "1", platform: "web", run: () => snapshot("web", "VX-977") },
    { version: "1", platform: "ios", run: () => snapshot("ios", "VX-977") },
    { version: "1", platform: "android", run: () => snapshot("android", "VX-983") },
  ] as never });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.conformant, false);
  assert.equal(result.value.mismatches.some((item) => item.platform === "android" && item.dimension === "action-intent"), true);
});
