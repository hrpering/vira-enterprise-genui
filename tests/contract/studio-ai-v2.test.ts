import test from "node:test";
import assert from "node:assert/strict";
import { generateStudioDraftV2, type StudioAiV2Request } from "../../packages/studio-ai/src/v2.js";

const commonComponent = { ref: "pegasus.component.card", label: "Card", category: "content.card", kind: "content", props: [], slots: [], events: [] };
const webOnlyComponent = { ref: "pegasus.component.web-only", label: "Web Only", category: "content.web", kind: "content", props: [], slots: [], events: [] };
function document(component = commonComponent.ref) {
  return { version: "1", id: "pegasus.baggage-upgrade", recipeId: "pegasus.recipe.baggage-upgrade", entryView: "main", views: [{ id: "main", nodes: [{ id: "root", component, order: 0, props: {} }] }], bindings: [], interactions: [] };
}
function brand() {
  return {
    identity: { version: "1", id: "pegasus.brand", displayName: "Pegasus", tokenRefs: {} },
    design: { palette: { primary: { $type: "color", $value: { colorSpace: "srgb", components: [0, 0, 0], hex: "#000000" } } } },
    components: {
      catalog: { version: "1", id: "pegasus.studio.components", brandId: "pegasus.brand", components: [commonComponent, webOnlyComponent] },
      implementations: [
        { component: commonComponent.ref, web: "pegasus.web.card", ios: "pegasus.ios.card", android: "pegasus.android.card" },
        { component: webOnlyComponent.ref, web: "pegasus.web.web-only", ios: "pegasus.ios.web-only", android: "pegasus.android.web-only" },
      ],
    },
    actions: { version: "1", id: "pegasus.studio.actions", mappings: [{ event: "baggage.upgrade.submit", actionType: "travel.baggage.upgrade.submit" }] },
    dataSources: { version: "1", id: "pegasus.studio.data", sources: [{ kind: "domain", path: "travel.baggage.options", label: "Baggage options", valueType: "string" }] },
    policies: { version: "1", id: "pegasus.studio.policies", mappings: [{ recipe: "pegasus.recipe.baggage-upgrade", layoutPolicy: "pegasus.policy.layout", disclosurePolicy: "pegasus.policy.disclosure" }] },
    experiences: [{ id: "baggage-upgrade", label: "Baggage upgrade", description: "Upgrade baggage", document: document() }],
  };
}
function hosts() {
  return [
    { version: "1", id: "pegasus.host.web", platform: "web", implementationIds: ["pegasus.web.card", "pegasus.web.web-only", "internal.web.secret"], capabilities: [{ version: "1", id: "capability.pointer" }] },
    { version: "1", id: "pegasus.host.ios", platform: "ios", implementationIds: ["pegasus.ios.card", "pegasus.ios.web-only", "internal.ios.secret"], capabilities: [{ version: "1", id: "capability.touch" }] },
    { version: "1", id: "pegasus.host.android", platform: "android", implementationIds: ["pegasus.android.card", "internal.android.secret"], capabilities: [{ version: "1", id: "capability.touch" }] },
  ];
}
function input() {
  return { prompt: "Create a baggage-upgrade experience that works on web, iOS and Android.", experienceId: "pegasus.baggage-upgrade", recipeId: "pegasus.recipe.baggage-upgrade", brand: brand(), requestedPlatforms: ["web", "ios", "android"], hostManifests: hosts() };
}

test("AI v2 exposes only the component surface common to every requested Host", async () => {
  let request: StudioAiV2Request | undefined;
  const result = await generateStudioDraftV2(input(), { generate(value) { request = value; return document(); } });
  assert.equal(result.ok, true);
  assert.deepEqual(request?.components.map((component) => component.ref), [commonComponent.ref]);
  assert.deepEqual(request?.platforms.map((platform) => platform.implementationIds), [["pegasus.web.card"], ["pegasus.ios.card"], ["pegasus.android.card"]]);
  assert.deepEqual(request?.actions, [{ event: "baggage.upgrade.submit", actionType: "travel.baggage.upgrade.submit" }]);
  assert.deepEqual(request?.platforms.map((platform) => platform.capabilityIds), [["capability.pointer@1"], ["capability.touch@1"], ["capability.touch@1"]]);
  assert.equal(request?.policy.layoutPolicy, "pegasus.policy.layout");
  assert.equal(request?.policy.disclosurePolicy, "pegasus.policy.disclosure");
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request?.platforms), true);
});

test("AI v2 rejects a generated Brand component that is not common to all requested Hosts", async () => {
  const result = await generateStudioDraftV2(input(), { generate: () => document(webOnlyComponent.ref) });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, "UNSUPPORTED_COMPONENT");
});

test("AI v2 rejects exact Host platform mismatch before provider execution", async () => {
  let called = false;
  const broken = input();
  broken.hostManifests = [hosts()[0], hosts()[1], { ...hosts()[2], platform: "web" }];
  const result = await generateStudioDraftV2(broken, { generate() { called = true; return document(); } });
  assert.equal(result.ok, false);
  assert.equal(called, false);
});

test("AI v2 provider surface is draft-only and contains no publish, secret, executor or deployment material", async () => {
  let keys: string[] = [];
  const result = await generateStudioDraftV2(input(), { generate(request) {
    keys = Object.keys(request).sort();
    for (const forbidden of ["publish", "secrets", "secretLease", "execute", "executor", "deploy", "promote"]) assert.equal(Object.hasOwn(request, forbidden), false);
    return document();
  } });
  assert.equal(result.ok, true);
  assert.deepEqual(keys, ["actions", "bindingSources", "components", "identity", "platforms", "policy", "prompt", "requestedPlatforms", "version"]);
});

test("AI v2 rejects accessor-backed requested platform arrays without invoking getters", async () => {
  let reads = 0;
  const platforms: unknown[] = [];
  Object.defineProperty(platforms, "0", { enumerable: true, configurable: true, get() { reads += 1; return "web"; } });
  Object.defineProperty(platforms, "length", { value: 1, writable: true });
  const value = input(); value.requestedPlatforms = platforms as string[]; value.hostManifests = [hosts()[0]];
  const result = await generateStudioDraftV2(value, { generate: () => document() });
  assert.equal(result.ok, false); assert.equal(reads, 0);
});

test("AI v2 rejects accessor-backed Host manifest arrays without invoking getters", async () => {
  let reads = 0;
  const manifests: unknown[] = [];
  Object.defineProperty(manifests, "0", { enumerable: true, configurable: true, get() { reads += 1; return hosts()[0]; } });
  Object.defineProperty(manifests, "length", { value: 1, writable: true });
  const value = input(); value.requestedPlatforms = ["web"]; value.hostManifests = manifests as ReturnType<typeof hosts>;
  const result = await generateStudioDraftV2(value, { generate: () => document() });
  assert.equal(result.ok, false); assert.equal(reads, 0);
});
