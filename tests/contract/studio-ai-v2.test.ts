import { test } from "vitest";
import assert from "node:assert/strict";
import { generateStudioDraftV2, type StudioAiV2Request } from "../../packages/studio-ai/src/v2.js";

const commonComponent = { ref: "reference.component.card", label: "Card", category: "content.card", kind: "content", props: [], slots: [], events: [] };
const webOnlyComponent = { ref: "reference.component.web-only", label: "Web Only", category: "content.web", kind: "content", props: [], slots: [], events: [] };
function document(component = commonComponent.ref) {
  return { version: "1", id: "reference.request", recipeId: "reference.recipe.request", entryView: "main", views: [{ id: "main", nodes: [{ id: "root", component, order: 0, props: {} }] }], bindings: [], interactions: [] };
}
function brand() {
  return {
    identity: { version: "1", id: "reference.brand", displayName: "Reference", tokenRefs: {} },
    design: { palette: { primary: { $type: "color", $value: { colorSpace: "srgb", components: [0, 0, 0], hex: "#000000" } } } },
    components: {
      catalog: { version: "1", id: "reference.studio.components", brandId: "reference.brand", components: [commonComponent, webOnlyComponent] },
      implementations: [
        { component: commonComponent.ref, web: "reference.web.card", ios: "reference.ios.card", android: "reference.android.card" },
        { component: webOnlyComponent.ref, web: "reference.web.web-only", ios: "reference.ios.web-only", android: "reference.android.web-only" },
      ],
    },
    actions: { version: "1", id: "reference.studio.actions", mappings: [{ event: "request.submit", actionType: "support.request.submit" }] },
    dataSources: { version: "1", id: "reference.studio.data", sources: [{ kind: "domain", path: "support.request.options", label: "Request options", valueType: "string" }] },
    policies: { version: "1", id: "reference.studio.policies", mappings: [{ recipe: "reference.recipe.request", layoutPolicy: "reference.policy.layout", disclosurePolicy: "reference.policy.disclosure" }] },
    experiences: [{ id: "request", label: "Request", description: "Create request", document: document() }],
  };
}
type TestHostManifest = {
  version: string;
  id: string;
  platform: string;
  implementationIds: string[];
  capabilities: { version: string; id: string }[];
};
function hosts(): [TestHostManifest, TestHostManifest, TestHostManifest] {
  return [
    { version: "1", id: "reference.host.web", platform: "web", implementationIds: ["reference.web.card", "reference.web.web-only", "internal.web.secret"], capabilities: [{ version: "1", id: "capability.pointer" }] },
    { version: "1", id: "reference.host.ios", platform: "ios", implementationIds: ["reference.ios.card", "reference.ios.web-only", "internal.ios.secret"], capabilities: [{ version: "1", id: "capability.touch" }] },
    { version: "1", id: "reference.host.android", platform: "android", implementationIds: ["reference.android.card", "internal.android.secret"], capabilities: [{ version: "1", id: "capability.touch" }] },
  ];
}
function input() {
  const hostManifests: TestHostManifest[] = [...hosts()];
  return { prompt: "Create a request experience that works on web, iOS and Android.", experienceId: "reference.request", recipeId: "reference.recipe.request", brand: brand(), requestedPlatforms: ["web", "ios", "android"], hostManifests };
}

test("AI v2 exposes only the component surface common to web, iOS and Android", async () => {
  let request: StudioAiV2Request | undefined;
  const result = await generateStudioDraftV2(input(), { generate(value) { request = value; return document(); } });
  assert.equal(result.ok, true);
  assert.deepEqual(request?.requestedPlatforms, ["web", "ios", "android"]);
  assert.deepEqual(request?.components.map((component) => component.ref), [commonComponent.ref]);
  assert.deepEqual(request?.platforms.map((platform) => platform.implementationIds), [["reference.web.card"], ["reference.ios.card"], ["reference.android.card"]]);
  assert.deepEqual(request?.actions, [{ event: "request.submit", actionType: "support.request.submit" }]);
  assert.deepEqual(request?.platforms.map((platform) => platform.capabilityIds), [["capability.pointer@1"], ["capability.touch@1"], ["capability.touch@1"]]);
  assert.equal(request?.policy.layoutPolicy, "reference.policy.layout");
  assert.equal(request?.policy.disclosurePolicy, "reference.policy.disclosure");
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request?.platforms), true);
  assert.equal(Object.isFrozen(request?.actions), true);
});

test("AI v2 canonicalizes caller platform order to web, ios, android", async () => {
  const value = input();
  value.requestedPlatforms = ["android", "web", "ios"];
  const [web, ios, android] = hosts();
  value.hostManifests = [android, web, ios];
  let request: StudioAiV2Request | undefined;
  const result = await generateStudioDraftV2(value, { generate(candidate) { request = candidate; return document(); } });
  assert.equal(result.ok, true);
  assert.deepEqual(request?.requestedPlatforms, ["web", "ios", "android"]);
  assert.deepEqual(request?.platforms.map((entry) => entry.platform), ["web", "ios", "android"]);
});

test("AI v2 rejects any subset instead of widening the catalog beyond universal support", async () => {
  const value = input();
  value.requestedPlatforms = ["web"];
  const [web] = hosts();
  value.hostManifests = [web];
  let called = false;
  const result = await generateStudioDraftV2(value, { generate() { called = true; return document(); } });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, "INVALID_PLATFORMS");
  assert.equal(called, false);
});

test("AI v2 rejects a generated Brand component that is not common to all three Hosts", async () => {
  const result = await generateStudioDraftV2(input(), { generate: () => document(webOnlyComponent.ref) });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, "UNSUPPORTED_COMPONENT");
});

test("AI v2 rejects missing/duplicate Host platform before provider execution", async () => {
  let called = false;
  const broken = input();
  const [web, ios, android] = hosts();
  broken.hostManifests = [web, ios, { ...android, platform: "web" }];
  const result = await generateStudioDraftV2(broken, { generate() { called = true; return document(); } });
  assert.equal(result.ok, false);
  assert.equal(called, false);
});

test("AI v2 provider surface is draft-only and contains no publish, secret, executor or deployment material", async () => {
  let keys: string[] = [];
  const result = await generateStudioDraftV2(input(), { generate(request) {
    keys = Object.keys(request).sort();
    for (const forbidden of ["publish", "secrets", "secretRef", "secretLease", "execute", "executor", "dispatch", "deploy", "promote"]) assert.equal(Object.hasOwn(request, forbidden), false);
    return document();
  } });
  assert.equal(result.ok, true);
  assert.deepEqual(keys, ["actions", "bindingSources", "components", "identity", "platforms", "policy", "prompt", "requestedPlatforms", "version"]);
});

test("AI v2 rejects accessor-backed requested platform arrays without invoking getters", async () => {
  let reads = 0;
  const platforms: unknown[] = new Array(3);
  Object.defineProperty(platforms, "0", { enumerable: true, configurable: true, get() { reads += 1; return "web"; } });
  Object.defineProperty(platforms, "1", { enumerable: true, configurable: true, value: "ios" });
  Object.defineProperty(platforms, "2", { enumerable: true, configurable: true, value: "android" });
  const value = input(); value.requestedPlatforms = platforms as string[];
  const result = await generateStudioDraftV2(value, { generate: () => document() });
  assert.equal(result.ok, false); assert.equal(reads, 0);
});

test("AI v2 rejects accessor-backed Host manifest arrays without invoking getters", async () => {
  let reads = 0;
  const manifests: unknown[] = new Array(3);
  const [web, ios, android] = hosts();
  Object.defineProperty(manifests, "0", { enumerable: true, configurable: true, get() { reads += 1; return web; } });
  Object.defineProperty(manifests, "1", { enumerable: true, configurable: true, value: ios });
  Object.defineProperty(manifests, "2", { enumerable: true, configurable: true, value: android });
  const value = input(); value.hostManifests = manifests as TestHostManifest[];
  const result = await generateStudioDraftV2(value, { generate: () => document() });
  assert.equal(result.ok, false); assert.equal(reads, 0);
});
